import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { selectPassage } from "../shared/passage-selection";
import { selectStandupStarter } from "../shared/results";
import { chooseCharacter, type CharacterId } from "../shared/characters";
import { BOMB_SELECTION_MS, BOMB_COUNTDOWN_MS, BOMB_FINALE_MS, cutTimes } from "../shared/bomb";
import { shuffled } from "./bomb-random";
import {
  clientMessageSchema,
  correctPrefix,
  COUNTDOWN_MS,
  MAX_MESSAGE_BYTES,
  MAX_BOMB_PLAYERS,
  playerCapacity,
  RACE_TIMEOUT_MS,
  ROOM_LIFETIME_MS,
  snapshotSchema,
  UPDATE_INTERVAL_MS,
  type Admission,
  type ClientMessage,
  type ServerMessage,
  type Session,
  type Snapshot,
  type GameMode,
} from "../shared/protocol";

const storedPlayerSchema = snapshotSchema.shape.players.element.omit({ connected: true }).extend({
  secretHash: z.string().length(64),
});
const stateSchema = snapshotSchema.omit({ serverNow: true, players: true }).extend({
  players: z.array(storedPlayerSchema).max(MAX_BOMB_PLAYERS),
  passageDay: z.string().default(""),
  passageHistory: z.array(z.string().max(500)).max(3).default([]),
  bombPlan: z
    .object({
      order: z.array(z.int()).max(MAX_BOMB_PLAYERS),
      times: z.array(z.number()).max(MAX_BOMB_PLAYERS),
    })
    .nullable()
    .default(null),
});
type RoomState = z.infer<typeof stateSchema>;
const attachmentSchema = z.object({ playerId: z.uuid().nullable() });

async function hashSecret(secret: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameHash(provided: string, expected: string): boolean {
  return crypto.subtle.timingSafeEqual(
    new TextEncoder().encode(provided),
    new TextEncoder().encode(expected),
  );
}

export class RoomError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class RaceRoom extends DurableObject<CloudflareBindings> {
  private broadcastTimer: ReturnType<typeof setTimeout> | undefined;
  private expired = false;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL)",
    );
  }

  private load(): RoomState {
    if (this.expired) throw new RoomError(410, "This room has expired. Create a new room.");
    const row = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM room WHERE id = 1")
      .toArray()[0];
    if (!row) throw new RoomError(404, "This room has expired or does not exist.");
    const state = stateSchema.parse(JSON.parse(row.value));
    const used = state.players.flatMap((player) =>
      player.characterId ? [player.characterId] : [],
    );
    for (const player of state.players) {
      if (player.characterId !== null) continue;
      player.characterId = chooseCharacter(player.name, used);
      used.push(player.characterId);
    }
    if (Date.now() >= state.expiresAt)
      throw new RoomError(410, "This room has expired. Create a new room.");
    return state;
  }

  private commit(state: RoomState): void {
    state.version++;
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO room (id, value) VALUES (1, ?)",
      JSON.stringify(state),
    );
  }

  private finish(state: RoomState, now: number, winnerId: string | null): void {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    const starter = selectStandupStarter(state.players, random);
    state.phase = "finished";
    state.outcome = winnerId ? "completed" : "timeout";
    state.winnerId = winnerId;
    state.finishAt = winnerId ? now : Math.min(now, state.deadline ?? now);
    state.standupStarterId = starter.id;
    state.standupTieCount = starter.tieCount;
  }

  private beginBomb(state: RoomState, now: number): void {
    const bomb = state.bomb;
    if (!bomb) throw new Error("Missing bomb.");
    const available = shuffled(bomb.cables.filter((cable) => cable.playerId === null));
    for (const player of state.players) {
      if (bomb.cables.some((cable) => cable.playerId === player.id)) continue;
      const cable = available.pop();
      if (!cable) throw new Error("Missing available cable.");
      cable.playerId = player.id;
    }
    // Draw only after selection closes. Persist the private permutation in the same commit.
    state.startAt = now + BOMB_COUNTDOWN_MS;
    const times = cutTimes(state.players.length, state.startAt);
    state.bombPlan = { order: shuffled(bomb.cables.map((cable) => cable.id)), times };
    state.deadline = times.at(-1)! + BOMB_FINALE_MS;
    state.phase = "countdown";
    bomb.nextCutAt = times[0]!;
  }

  private advanceBomb(state: RoomState, now: number): boolean {
    if (state.mode !== "bomb" || !state.bomb || state.phase === "finished") return false;
    const bomb = state.bomb;
    let changed = false;
    if (state.phase === "selecting" && now >= bomb.selectionEndsAt) {
      // Anchor timeout rounds to their scheduled deadline even if an alarm arrives late.
      this.beginBomb(state, bomb.selectionEndsAt);
      changed = true;
    }
    if (state.phase === "countdown" && now >= (state.startAt ?? Infinity)) {
      state.phase = "defusing";
      changed = true;
    }
    const plan = state.bombPlan;
    if (!plan) return changed;
    if (state.phase === "defusing") {
      for (const [index, time] of plan.times.entries()) {
        if (time > now) break;
        const cable = bomb.cables.find((item) => item.id === plan.order[index]);
        if (cable && cable.cutAt === null) {
          cable.cutAt = time;
          changed = true;
        }
      }
      bomb.nextCutAt = plan.times.find((time) => time > now) ?? null;
      if (bomb.nextCutAt === null) {
        state.phase = "finale";
        bomb.explodeAt = state.deadline;
        changed = true;
      }
    }
    if (state.phase === "finale" && now >= (state.deadline ?? Infinity)) {
      state.phase = "finished";
      state.outcome = "completed";
      state.finishAt = state.deadline;
      state.standupStarterId = bomb.cables.find(
        (cable) => cable.id === plan.order.at(-1),
      )!.playerId;
      state.standupTieCount = state.players.length;
      changed = true;
    }
    return changed;
  }

  private connected(id: string): boolean {
    return this.ctx
      .getWebSockets()
      .some((socket) => socket.readyState === WebSocket.OPEN && this.playerId(socket) === id);
  }

  private playerId(socket: WebSocket): string | null {
    const parsed = attachmentSchema.safeParse(socket.deserializeAttachment());
    return parsed.success ? parsed.data.playerId : null;
  }

  private snapshot(state = this.load()): Snapshot {
    const { passageDay: _day, passageHistory: _history, bombPlan: _plan, ...publicState } = state;
    return {
      ...publicState,
      serverNow: Date.now(),
      players: state.players.map(({ secretHash: _secretHash, ...player }) => ({
        ...player,
        connected: this.connected(player.id),
      })),
    };
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  private broadcast(): void {
    if (this.broadcastTimer !== undefined) clearTimeout(this.broadcastTimer);
    this.broadcastTimer = undefined;
    try {
      const message: ServerMessage = { type: "snapshot", state: this.snapshot() };
      for (const socket of this.ctx.getWebSockets()) {
        if (this.playerId(socket)) this.send(socket, message);
      }
    } catch (error) {
      if (!(error instanceof RoomError)) throw error;
    }
  }

  private broadcastSoon(): void {
    if (this.broadcastTimer === undefined) {
      this.broadcastTimer = setTimeout(() => this.broadcast(), UPDATE_INTERVAL_MS);
    }
  }

  private async scheduleAlarm(): Promise<void> {
    const state = this.load();
    const next =
      state.mode === "bomb" && state.bomb
        ? state.phase === "selecting"
          ? state.bomb.selectionEndsAt
          : state.phase === "countdown"
            ? state.startAt
            : state.phase === "defusing"
              ? state.bomb.nextCutAt
              : state.phase === "finale"
                ? state.deadline
                : null
        : state.phase === "countdown"
          ? state.startAt
          : state.phase === "racing"
            ? state.deadline
            : null;
    await this.ctx.storage.setAlarm(Math.min(next ?? state.expiresAt, state.expiresAt));
  }

  async create(
    roomId: string,
    name: string,
    mode: GameMode = "cars",
    characterId?: CharacterId,
  ): Promise<Admission> {
    const session = { playerId: crypto.randomUUID(), secret: crypto.randomUUID() };
    const secretHash = await hashSecret(session.secret);
    if (this.ctx.storage.sql.exec("SELECT id FROM room").toArray().length)
      throw new RoomError(409, "Room already exists.");
    const state: RoomState = {
      roomId,
      version: 0,
      phase: "lobby",
      hostId: session.playerId,
      raceId: null,
      startAt: null,
      deadline: null,
      winnerId: null,
      finishAt: null,
      outcome: null,
      standupStarterId: null,
      standupTieCount: 0,
      passageDay: "",
      passageHistory: [],
      language: "english",
      mode,
      bomb: null,
      bombPlan: null,
      passage: "",
      expiresAt: Date.now() + ROOM_LIFETIME_MS,
      players: [
        {
          id: session.playerId,
          name,
          secretHash,
          ready: false,
          progress: 0,
          sequence: 0,
          characterId: characterId ?? chooseCharacter(name),
        },
      ],
    };
    this.commit(state);
    await this.scheduleAlarm();
    return { roomId, session };
  }

  async join(
    name: string,
    characterId?: CharacterId,
  ): Promise<Admission | { error: string; status: number }> {
    const session = { playerId: crypto.randomUUID(), secret: crypto.randomUUID() };
    const secretHash = await hashSecret(session.secret);
    const state = this.load();
    if (state.phase !== "lobby")
      return {
        status: 409,
        error: "The round has already started. Join after the host resets it.",
      };
    if (state.players.length >= playerCapacity(state.mode))
      return {
        status: 409,
        error: `This room is full (${playerCapacity(state.mode)} ${state.mode === "bomb" ? "participants" : "racers"} maximum).`,
      };
    state.players.push({
      id: session.playerId,
      name,
      secretHash,
      ready: false,
      progress: 0,
      sequence: 0,
      characterId:
        characterId ??
        chooseCharacter(
          name,
          state.players.flatMap((item) => (item.characterId ? [item.characterId] : [])),
        ),
    });
    this.commit(state);
    this.broadcast();
    return { roomId: state.roomId, session };
  }

  async resume(session: Session): Promise<Admission> {
    const secretHash = await hashSecret(session.secret);
    const state = this.load();
    const player = state.players.find((item) => item.id === session.playerId);
    if (!player || !sameHash(secretHash, player.secretHash))
      throw new RoomError(403, "Invalid player session.");
    return { roomId: state.roomId, session };
  }

  async fetch(request: Request): Promise<Response> {
    this.load();
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket upgrade required.", { status: 426 });
    if (this.ctx.getWebSockets().length >= MAX_BOMB_PLAYERS * 2)
      return new Response("Too many connections.", { status: 429 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    try {
      if (typeof raw !== "string" || new TextEncoder().encode(raw).length > MAX_MESSAGE_BYTES) {
        socket.close(1009, "Message too large.");
        return;
      }
      const message: ClientMessage = clientMessageSchema.parse(JSON.parse(raw));
      if (message.type === "hello") {
        if (this.playerId(socket)) throw new RoomError(409, "Connection already authenticated.");
        await this.resume(message.session);
        // Re-read after authentication: another event may have changed the room while hashing.
        const state = this.load();
        if (!state.players.some((player) => player.id === message.session.playerId))
          throw new RoomError(403, "Player has left the room.");
        for (const previous of this.ctx.getWebSockets()) {
          if (previous !== socket && this.playerId(previous) === message.session.playerId) {
            previous.serializeAttachment({ playerId: null });
            previous.close(4001, "Session connected elsewhere.");
          }
        }
        socket.serializeAttachment({ playerId: message.session.playerId });
        if (this.advanceBomb(state, Date.now())) {
          this.commit(state);
          this.ctx.waitUntil(this.scheduleAlarm());
        }
        this.broadcast();
        return;
      }
      const playerId = this.playerId(socket);
      if (!playerId) throw new RoomError(403, "Authenticate before sending commands.");
      const state = this.load();
      const player = state.players.find((item) => item.id === playerId);
      if (!player) throw new RoomError(403, "Player is no longer in this room.");
      const now = Date.now();
      let phaseChanged = this.advanceBomb(state, now);
      if (
        state.mode !== "bomb" &&
        state.phase === "countdown" &&
        state.startAt !== null &&
        now >= state.startAt
      ) {
        state.phase = "racing";
        phaseChanged = true;
      }
      if (state.phase === "racing" && state.deadline !== null && now >= state.deadline) {
        this.finish(state, now, null);
        phaseChanged = true;
      }
      if (phaseChanged) {
        this.commit(state);
        this.broadcast();
        this.ctx.waitUntil(this.scheduleAlarm());
      }
      if (message.type === "ping") {
        this.send(socket, { type: "pong", sentAt: message.sentAt, serverNow: now });
        return;
      }
      if (message.type === "progress") {
        if (
          state.mode === "bomb" ||
          state.phase !== "racing" ||
          message.raceId !== state.raceId ||
          message.sequence <= player.sequence
        )
          return;
        // A single synchronous read/modify/write owns both progress and the winner. No await here.
        player.sequence = message.sequence;
        player.progress = correctPrefix(message.text, state.passage);
        const completed = player.progress === state.passage.length;
        if (completed) {
          this.finish(state, now, player.id);
        }
        this.commit(state);
        if (completed) {
          this.broadcast();
          await this.scheduleAlarm();
        } else this.broadcastSoon();
        return;
      }
      if (message.type === "wire") {
        if (state.mode !== "bomb" || message.raceId !== state.raceId) return;
        const bomb = state.bomb;
        if (!bomb) return;
        const assigned = bomb.cables.find((cable) => cable.playerId === playerId);
        // Retried packets are harmless. A confirmed choice can never be changed.
        if (assigned?.id === message.cableId) return;
        if (state.phase !== "selecting" || assigned)
          throw new RoomError(409, "Your cable is locked for this round.");
        const cable = bomb.cables.find((item) => item.id === message.cableId);
        if (!cable || cable.playerId !== null)
          throw new RoomError(409, "That cable was just taken. Choose another cable.");
        cable.playerId = playerId;
        if (bomb.cables.every((item) => item.playerId !== null)) this.beginBomb(state, now);
        this.commit(state);
        this.broadcast();
        await this.scheduleAlarm();
        return;
      }
      if (message.type === "ready") {
        if (state.phase !== "lobby")
          throw new RoomError(409, "Readiness can only change in the lobby.");
        player.ready = message.ready;
        this.commit(state);
        this.broadcast();
        return;
      }
      if (message.type === "character") {
        if (state.phase !== "lobby")
          throw new RoomError(409, "Choose your character in the lobby before the next round.");
        if (player.characterId === message.characterId) return;
        player.characterId = message.characterId;
        player.ready = false;
        this.commit(state);
        this.broadcast();
        return;
      }
      if (message.type === "leave") {
        if (state.phase !== "lobby")
          throw new RoomError(409, "Leave after the race finishes and resets.");
        if (state.hostId === playerId)
          throw new RoomError(409, "The host must stay. Create a new room to change hosts.");
        state.players = state.players.filter((item) => item.id !== playerId);
        this.commit(state);
        socket.serializeAttachment({ playerId: null });
        socket.close(1000, "Left room.");
        this.broadcast();
        return;
      }
      if (state.hostId !== playerId)
        throw new RoomError(403, "Only the host can control the race.");
      if (message.type === "configure") {
        if (state.phase !== "lobby")
          throw new RoomError(
            409,
            "Change the race mode or language in the lobby before the next round.",
          );
        const language = message.language ?? state.language;
        const mode = message.mode ?? state.mode;
        if (state.players.length > playerCapacity(mode))
          throw new RoomError(
            409,
            "Typing races support up to nine racers. Keep this group in Defuse the bomb or create a smaller room.",
          );
        if (state.language === language && state.mode === mode) return;
        state.language = language;
        state.mode = mode;
        // Readiness belongs to the chosen challenge; changing it clears previous ready marks.
        for (const item of state.players) item.ready = false;
        this.commit(state);
        this.broadcast();
        return;
      }
      if (message.type === "start") {
        if (state.phase !== "lobby") throw new RoomError(409, "The race is already underway.");
        if (
          state.players.length < 2 ||
          (state.mode === "bomb"
            ? !this.connected(state.hostId)
            : state.players.some((item) => !item.ready || !this.connected(item.id)))
        ) {
          throw new RoomError(
            409,
            state.mode === "bomb"
              ? "Invite at least one teammate before starting the bomb."
              : "At least two racers must be connected, and everyone must be ready.",
          );
        }
        if (state.mode === "bomb") {
          state.raceId = crypto.randomUUID();
          state.phase = "selecting";
          state.bomb = {
            selectionEndsAt: now + BOMB_SELECTION_MS,
            nextCutAt: null,
            explodeAt: null,
            cables: state.players.map((_item, id) => ({ id, playerId: null, cutAt: null })),
          };
          state.bombPlan = null;
          this.commit(state);
          this.broadcast();
          await this.scheduleAlarm();
          return;
        }
        const choice = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
        const selected = selectPassage(
          state.language,
          now,
          state.passageDay,
          state.passageHistory,
          choice,
          state.mode,
        );
        state.passage = selected.passage;
        state.passageDay = selected.day;
        state.passageHistory = selected.history;
        state.raceId = crypto.randomUUID();
        state.phase = "countdown";
        state.startAt = now + COUNTDOWN_MS;
        state.deadline = state.startAt + RACE_TIMEOUT_MS;
        this.commit(state);
        this.broadcast();
        await this.scheduleAlarm();
        return;
      }
      if (message.type === "reset") {
        if (state.phase !== "finished")
          throw new RoomError(409, "Reset is available after a result.");
        state.phase = "lobby";
        state.raceId = null;
        state.startAt = null;
        state.deadline = null;
        state.winnerId = null;
        state.finishAt = null;
        state.outcome = null;
        state.standupStarterId = null;
        state.standupTieCount = 0;
        state.passage = "";
        state.bomb = null;
        state.bombPlan = null;
        for (const item of state.players) {
          item.ready = false;
          item.progress = 0;
          item.sequence = 0;
        }
        // Disconnected guests are removed between rounds, freeing their seats.
        state.players = state.players.filter(
          (item) => item.id === state.hostId || this.connected(item.id),
        );
        this.commit(state);
        this.broadcast();
        await this.scheduleAlarm();
      }
    } catch (error) {
      const known = error instanceof RoomError;
      this.send(socket, {
        type: "error",
        code: known ? String(error.status) : "invalid_message",
        message: known ? error.message : "Invalid message.",
      });
      if (
        (known && error.status === 403) ||
        error instanceof z.ZodError ||
        error instanceof SyntaxError
      )
        socket.close(1008, "Invalid session or message.");
      if (!known && !(error instanceof z.ZodError) && !(error instanceof SyntaxError)) {
        console.error(JSON.stringify({ message: "Room command failed", error: String(error) }));
      }
    }
  }

  webSocketClose(socket: WebSocket, code: number): void {
    socket.close(code);
    socket.serializeAttachment({ playerId: null });
    this.broadcast();
  }

  webSocketError(socket: WebSocket): void {
    socket.serializeAttachment({ playerId: null });
    socket.close(1011, "Connection failed.");
    this.broadcast();
  }

  async alarm(): Promise<void> {
    const row = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM room WHERE id = 1")
      .toArray()[0];
    if (!row) return;
    const state = stateSchema.parse(JSON.parse(row.value));
    const now = Date.now();
    if (now >= state.expiresAt) {
      this.expired = true;
      if (this.broadcastTimer !== undefined) clearTimeout(this.broadcastTimer);
      this.broadcastTimer = undefined;
      for (const socket of this.ctx.getWebSockets()) socket.close(4004, "Room expired.");
      await this.ctx.storage.deleteAll();
      return;
    }
    if (state.mode === "bomb") {
      if (this.advanceBomb(state, now)) {
        this.commit(state);
        this.broadcast();
      }
      await this.scheduleAlarm();
      return;
    }
    if (state.phase === "countdown" && state.startAt !== null && now >= state.startAt) {
      state.phase = "racing";
      this.commit(state);
      this.broadcast();
    }
    if (state.phase === "racing" && state.deadline !== null && now >= state.deadline) {
      this.finish(state, now, null);
      this.commit(state);
      this.broadcast();
    }
    await this.scheduleAlarm();
  }
}
