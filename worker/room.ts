import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import {
  clientMessageSchema,
  correctPrefix,
  COUNTDOWN_MS,
  MAX_MESSAGE_BYTES,
  MAX_PLAYERS,
  PASSAGES,
  RACE_TIMEOUT_MS,
  ROOM_LIFETIME_MS,
  snapshotSchema,
  UPDATE_INTERVAL_MS,
  type Admission,
  type ClientMessage,
  type ServerMessage,
  type Session,
  type Snapshot,
} from "../shared/protocol";

const storedPlayerSchema = snapshotSchema.shape.players.element.omit({ connected: true }).extend({
  secretHash: z.string().length(64),
});
const stateSchema = snapshotSchema.omit({ serverNow: true, players: true }).extend({
  players: z.array(storedPlayerSchema).max(MAX_PLAYERS),
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
    return {
      ...state,
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
      state.phase === "countdown"
        ? state.startAt
        : state.phase === "racing"
          ? state.deadline
          : null;
    await this.ctx.storage.setAlarm(Math.min(next ?? state.expiresAt, state.expiresAt));
  }

  async create(roomId: string, name: string): Promise<Admission> {
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
      passage: "",
      expiresAt: Date.now() + ROOM_LIFETIME_MS,
      players: [{ id: session.playerId, name, secretHash, ready: false, progress: 0, sequence: 0 }],
    };
    this.commit(state);
    await this.scheduleAlarm();
    return { roomId, session };
  }

  async join(name: string): Promise<Admission> {
    const session = { playerId: crypto.randomUUID(), secret: crypto.randomUUID() };
    const secretHash = await hashSecret(session.secret);
    const state = this.load();
    if (state.phase !== "lobby")
      throw new RoomError(409, "The race has already started. Join after the host resets it.");
    if (state.players.length >= MAX_PLAYERS)
      throw new RoomError(409, "This room is full (8 racers maximum).");
    state.players.push({
      id: session.playerId,
      name,
      secretHash,
      ready: false,
      progress: 0,
      sequence: 0,
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
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS * 2)
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
        this.broadcast();
        return;
      }
      const playerId = this.playerId(socket);
      if (!playerId) throw new RoomError(403, "Authenticate before sending commands.");
      const state = this.load();
      const player = state.players.find((item) => item.id === playerId);
      if (!player) throw new RoomError(403, "Player is no longer in this room.");
      const now = Date.now();
      let phaseChanged = false;
      if (state.phase === "countdown" && state.startAt !== null && now >= state.startAt) {
        state.phase = "racing";
        phaseChanged = true;
      }
      if (state.phase === "racing" && state.deadline !== null && now >= state.deadline) {
        state.phase = "finished";
        state.outcome = "timeout";
        phaseChanged = true;
      }
      if (phaseChanged) {
        this.commit(state);
        this.broadcast();
      }
      if (message.type === "ping") {
        this.send(socket, { type: "pong", sentAt: message.sentAt, serverNow: now });
        return;
      }
      if (message.type === "progress") {
        if (
          state.phase !== "racing" ||
          message.raceId !== state.raceId ||
          message.sequence <= player.sequence
        )
          return;
        // A single synchronous read/modify/write owns both progress and the winner. No await here.
        player.sequence = message.sequence;
        player.progress = correctPrefix(message.text, state.passage);
        if (player.progress === state.passage.length) {
          state.phase = "finished";
          state.winnerId = player.id;
          state.finishAt = now;
          state.outcome = "completed";
        }
        this.commit(state);
        if (state.phase === "finished") {
          this.broadcast();
          await this.scheduleAlarm();
        } else this.broadcastSoon();
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
      if (message.type === "start") {
        if (state.phase !== "lobby") throw new RoomError(409, "The race is already underway.");
        if (
          state.players.length < 2 ||
          state.players.some((item) => !item.ready || !this.connected(item.id))
        ) {
          throw new RoomError(
            409,
            "At least two racers must be connected, and everyone must be ready.",
          );
        }
        const choice = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
        state.passage = PASSAGES[choice % PASSAGES.length] ?? PASSAGES[0];
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
        state.passage = "";
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
    if (state.phase === "countdown" && state.startAt !== null && now >= state.startAt) {
      state.phase = "racing";
      this.commit(state);
      this.broadcast();
    }
    if (state.phase === "racing" && state.deadline !== null && now >= state.deadline) {
      state.phase = "finished";
      state.outcome = "timeout";
      this.commit(state);
      this.broadcast();
    }
    await this.scheduleAlarm();
  }
}
