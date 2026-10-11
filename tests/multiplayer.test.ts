import { env, exports } from "cloudflare:workers";
import {
  abortAllDurableObjects,
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { PASSAGES, RACE_LANGUAGES } from "../shared/passages";
import {
  admissionSchema,
  serverMessageSchema,
  type Admission,
  type ClientMessage,
  type ServerMessage,
  type Snapshot,
} from "../shared/protocol";

const origin = "http://127.0.0.1:5173";
const clients: Probe[] = [];

class Probe {
  readonly messages: ServerMessage[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(readonly socket: WebSocket) {
    socket.accept();
    socket.addEventListener("message", (event: MessageEvent) => {
      const message = serverMessageSchema.parse(JSON.parse(String(event.data)));
      this.messages.push(message);
      for (const listener of this.listeners) listener();
    });
    clients.push(this);
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  waitFor(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    const existing = this.messages.findLast(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error("Timed out waiting for a server message."));
      }, 4000);
      const check = () => {
        const message = this.messages.findLast(predicate);
        if (message) {
          clearTimeout(timeout);
          this.listeners.delete(check);
          resolve(message);
        }
      };
      this.listeners.add(check);
    });
  }

  async snapshot(predicate: (state: Snapshot) => boolean): Promise<Snapshot> {
    const message = await this.waitFor((item) => item.type === "snapshot" && predicate(item.state));
    if (message.type !== "snapshot") throw new Error("Expected snapshot.");
    return message.state;
  }
}

async function request(path: string, body: unknown): Promise<Response> {
  return exports.default.fetch(`https://test.local${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function connect(admission: Admission): Promise<Probe> {
  const response = await exports.default.fetch(
    `https://test.local/rooms/${admission.roomId}/socket`,
    {
      headers: { Origin: origin, Upgrade: "websocket" },
    },
  );
  expect(response.status).toBe(101);
  if (!response.webSocket) throw new Error("Missing WebSocket.");
  const probe = new Probe(response.webSocket);
  probe.send({ type: "hello", session: admission.session });
  await probe.snapshot((state) =>
    state.players.some((player) => player.id === admission.session.playerId && player.connected),
  );
  return probe;
}

async function room(
  count: number,
): Promise<{ admissions: Admission[]; probes: Probe[]; roomId: string }> {
  const created = await request("/rooms", { name: "Host" });
  expect(created.status).toBe(201);
  const first = admissionSchema.parse(await created.json());
  const admissions = [first];
  for (let index = 1; index < count; index++) {
    const response = await request(`/rooms/${first.roomId}/join`, { name: `Racer ${index + 1}` });
    expect(response.status).toBe(200);
    admissions.push(admissionSchema.parse(await response.json()));
  }
  const probes: Probe[] = [];
  for (const admission of admissions) probes.push(await connect(admission));
  return { admissions, probes, roomId: first.roomId };
}

async function countdown(probes: Probe[]): Promise<Snapshot[]> {
  const host = probes[0];
  if (!host) throw new Error("Missing host.");
  const before = await host.snapshot(() => true);
  for (const probe of probes) probe.send({ type: "ready", ready: true });
  const ready = await host.snapshot(
    (state) =>
      state.version > before.version &&
      state.phase === "lobby" &&
      state.players.every((player) => player.ready && player.connected),
  );
  host.send({ type: "start" });
  return Promise.all(
    probes.map((probe) =>
      probe.snapshot((state) => state.version > ready.version && state.phase === "countdown"),
    ),
  );
}

const editableStateSchema = z
  .object({
    phase: z.string(),
    startAt: z.number().nullable(),
    deadline: z.number().nullable(),
    expiresAt: z.number(),
  })
  .passthrough();

async function changeTime(roomId: string, change: "start" | "deadline" | "expiry"): Promise<void> {
  const stub = env.ROOMS.getByName(roomId);
  await runInDurableObject(stub, (_instance, context) => {
    const row = context.storage.sql
      .exec<{ value: string }>("SELECT value FROM room WHERE id = 1")
      .one();
    const state = editableStateSchema.parse(JSON.parse(row.value));
    if (change === "start") state.startAt = Date.now() - 1;
    if (change === "deadline") state.deadline = Date.now() - 1;
    if (change === "expiry") state.expiresAt = Date.now() - 1;
    context.storage.sql.exec("UPDATE room SET value = ? WHERE id = 1", JSON.stringify(state));
  });
  await runDurableObjectAlarm(stub);
}

afterEach(async () => {
  for (const probe of clients.splice(0)) {
    if (probe.socket.readyState === WebSocket.OPEN) probe.socket.close(1000, "Test complete.");
  }
  await abortAllDurableObjects();
  await reset();
});

describe("authoritative multiplayer races", () => {
  it("gives eight Java racers the same start and exactly one durable winner for concurrent finishes", async () => {
    const { admissions, probes, roomId } = await room(8);
    probes[0]?.send({ type: "configure", language: "java" });
    await Promise.all(probes.map((probe) => probe.snapshot((state) => state.language === "java")));
    const starts = await countdown(probes);
    expect(new Set(starts.map((state) => state.startAt)).size).toBe(1);
    expect(new Set(starts.map((state) => state.raceId)).size).toBe(1);
    expect(new Set(starts.map((state) => state.passage)).size).toBe(1);
    expect(starts.every((state) => PASSAGES.java.includes(state.passage))).toBe(true);
    const start = starts[0];
    if (!start?.raceId) throw new Error("Missing race.");
    probes.forEach((probe) =>
      probe.send({
        type: "progress",
        raceId: start.raceId ?? "",
        sequence: 1,
        text: start.passage,
      }),
    );
    probes[0]?.send({ type: "ping", sentAt: 1 });
    await probes[0]?.waitFor((message) => message.type === "pong" && message.sentAt === 1);
    const before = await probes[0]?.snapshot((state) => state.phase === "countdown");
    expect(before?.players.every((player) => player.progress === 0)).toBe(true);
    await changeTime(roomId, "start");
    await Promise.all(probes.map((probe) => probe.snapshot((state) => state.phase === "racing")));
    for (const probe of probes)
      probe.send({
        type: "progress",
        raceId: start.raceId,
        sequence: 2,
        text: start.passage.slice(0, -1),
      });
    await probes[0]?.snapshot((state) =>
      state.players.every((player) => player.progress === start.passage.length - 1),
    );
    for (const probe of probes)
      probe.send({ type: "progress", raceId: start.raceId, sequence: 3, text: start.passage });
    const results = await Promise.all(
      probes.map((probe) => probe.snapshot((state) => state.phase === "finished")),
    );
    expect(new Set(results.map((state) => state.winnerId)).size).toBe(1);
    expect(results[0]?.winnerId).not.toBeNull();
    expect(new Set(results.map((state) => state.standupStarterId)).size).toBe(1);
    expect(results[0]?.standupStarterId).not.toBeNull();
    expect(results[0]?.standupStarterId).not.toBe(results[0]?.winnerId);
    expect(results.every((state) => state.standupTieCount === 7)).toBe(true);
    expect(results.every((state) => state.outcome === "completed")).toBe(true);
    expect(
      results[0]?.players.filter((player) => player.progress === start.passage.length),
    ).toHaveLength(1);
    await evictDurableObject(env.ROOMS.getByName(roomId));
    const restored = await connect(admissions[0]!);
    const persisted = await restored.snapshot((state) => state.phase === "finished");
    expect(persisted.winnerId).toBe(results[0]?.winnerId);
    expect(persisted.standupStarterId).toBe(results[0]?.standupStarterId);
    expect(persisted.standupTieCount).toBe(7);
    expect(persisted.language).toBe("java");
    expect(persisted.passage).toBe(start.passage);
    for (const probe of probes) {
      const winnerIds = probe.messages.flatMap((message) =>
        message.type === "snapshot" && message.state.winnerId ? [message.state.winnerId] : [],
      );
      expect(new Set(winnerIds).size).toBe(1);
    }
  });

  it.each(RACE_LANGUAGES)(
    "shares and freezes the %s choice, retaining it after reset and recovery",
    async (language) => {
      const { admissions, probes, roomId } = await room(2);
      const host = probes[0];
      if (!host) throw new Error("Missing host.");
      // Begin in a different mode so every selection exercises readiness invalidation.
      host.send({ type: "configure", language: language === "english" ? "spanish" : "english" });
      for (const probe of probes) probe.send({ type: "ready", ready: true });
      const ready = await host.snapshot((state) => state.players.every((player) => player.ready));
      host.send({ type: "configure", language });
      const selections = await Promise.all(
        probes.map((probe) =>
          probe.snapshot((state) => state.version > ready.version && state.language === language),
        ),
      );
      expect(selections.every((state) => state.players.every((player) => !player.ready))).toBe(
        true,
      );
      host.send({ type: "start" });
      expect(await host.waitFor((message) => message.type === "error")).toMatchObject({
        code: "409",
      });
      const starts = await countdown(probes);
      expect(starts.every((state) => state.language === language)).toBe(true);
      expect(new Set(starts.map((state) => state.passage)).size).toBe(1);
      const start = starts[0];
      if (!start) throw new Error("Missing race.");
      expect(PASSAGES[language]).toContain(start.passage);
      host.send({ type: "configure", language: language === "java" ? "spanish" : "java" });
      expect(
        await host.waitFor(
          (message) => message.type === "error" && message.message.includes("Change the language"),
        ),
      ).toMatchObject({ code: "409" });
      await changeTime(roomId, "start");
      await changeTime(roomId, "deadline");
      const ended = await host.snapshot((state) => state.phase === "finished");
      expect(ended.language).toBe(language);
      expect(ended.passage).toBe(start.passage);
      host.send({ type: "reset" });
      await host.snapshot((state) => state.phase === "lobby" && state.version > ended.version);
      await evictDurableObject(env.ROOMS.getByName(roomId));
      const restored = await connect(admissions[0]!);
      const recovered = await restored.snapshot((state) => state.phase === "lobby");
      expect(recovered.language).toBe(language);
      expect(recovered.passage).toBe("");
      expect(recovered.players.every((player) => !player.ready)).toBe(true);
      expect(recovered.standupStarterId).toBeNull();
      // The next round and new connection retain the day's no-repeat deck.
      const next = await countdown([restored, probes[1]!]);
      expect(next[0]?.passage).not.toBe(start.passage);
    },
  );

  it("restores older rooms with safe defaults for language, deck, and opener", async () => {
    const { admissions, roomId } = await room(2);
    const stub = env.ROOMS.getByName(roomId);
    await runInDurableObject(stub, (_instance, context) => {
      const row = context.storage.sql
        .exec<{ value: string }>("SELECT value FROM room WHERE id = 1")
        .one();
      const stored = z.record(z.string(), z.unknown()).parse(JSON.parse(row.value));
      delete stored.language;
      delete stored.passageDay;
      delete stored.passageHistory;
      delete stored.standupStarterId;
      delete stored.standupTieCount;
      context.storage.sql.exec("UPDATE room SET value = ? WHERE id = 1", JSON.stringify(stored));
    });
    await evictDurableObject(stub);
    const restored = await connect(admissions[0]!);
    const recovered = await restored.snapshot((state) => state.phase === "lobby");
    expect(recovered.language).toBe("english");
    expect(recovered.standupStarterId).toBeNull();
    expect(recovered.standupTieCount).toBe(0);
    restored.send({ type: "ready", ready: true });
    await restored.snapshot((state) => state.players[0]?.ready === true);
    const saved = await runInDurableObject(
      stub,
      (_instance, context) =>
        context.storage.sql
          .exec<{
            language: string;
          }>("SELECT json_extract(value, '$.language') AS language FROM room WHERE id = 1")
          .one().language,
    );
    expect(saved).toBe("english");
  });

  it("validates correct prefixes, ignores old packets, and recovers progress after hibernation", async () => {
    const { admissions, probes, roomId } = await room(2);
    const [start] = await countdown(probes);
    if (!start?.raceId || !probes[0]) throw new Error("Missing race.");
    await changeTime(roomId, "start");
    probes[0].send({
      type: "progress",
      raceId: start.raceId,
      sequence: 5,
      text: start.passage.slice(0, 10) + "!",
    });
    await probes[1]?.snapshot((state) => state.players[0]?.progress === 10);
    probes[0].send({ type: "progress", raceId: start.raceId, sequence: 4, text: start.passage });
    probes[0].send({
      type: "progress",
      raceId: crypto.randomUUID(),
      sequence: 6,
      text: start.passage,
    });
    await evictDurableObject(env.ROOMS.getByName(roomId));
    probes[0].send({ type: "ping", sentAt: 999 });
    await probes[0].waitFor((message) => message.type === "pong" && message.sentAt === 999);
    const reconnected = await connect(admissions[0]!);
    const recovered = await reconnected.snapshot((state) => state.players[0]?.sequence === 5);
    expect(recovered.players[0]?.progress).toBe(10);
    expect(recovered.phase).toBe("racing");
    reconnected.send({ type: "progress", raceId: start.raceId, sequence: 6, text: start.passage });
    expect((await reconnected.snapshot((state) => state.phase === "finished")).winnerId).toBe(
      admissions[0]?.session.playerId,
    );
  });

  it("enforces capacity, host control, session authentication, and request boundaries", async () => {
    const { admissions, probes, roomId } = await room(8);
    expect((await request(`/rooms/${roomId}/join`, { name: "Ninth" })).status).toBe(409);
    expect(
      (
        await request(`/rooms/${roomId}/join`, {
          session: { playerId: admissions[0]?.session.playerId, secret: crypto.randomUUID() },
        })
      ).status,
    ).toBe(403);
    probes[1]?.send({ type: "configure", language: "java" });
    const denied = await probes[1]?.waitFor((message) => message.type === "error");
    expect(denied).toMatchObject({ type: "error", code: "403" });
    probes[2]?.send({ type: "start" });
    expect(await probes[2]?.waitFor((message) => message.type === "error")).toMatchObject({
      code: "403",
    });
    expect((await probes[0]?.snapshot((state) => state.phase === "lobby"))?.language).toBe(
      "english",
    );
    probes[3]?.socket.send(JSON.stringify({ type: "configure", language: "python" }));
    expect(await probes[3]?.waitFor((message) => message.type === "error")).toMatchObject({
      code: "invalid_message",
    });
    expect((await request("/rooms", { name: "<script>" })).status).toBe(400);
    expect((await request("/rooms", { name: "x".repeat(1100) })).status).toBe(413);
    expect(
      (await exports.default.fetch("https://test.local/rooms", { method: "POST", body: "{}" }))
        .status,
    ).toBe(403);
    const response = await exports.default.fetch(`https://test.local/rooms/${roomId}/socket`, {
      headers: { Origin: origin, Upgrade: "websocket" },
    });
    if (!response.webSocket) throw new Error("Missing WebSocket.");
    const unauthenticated = new Probe(response.webSocket);
    unauthenticated.send({ type: "start" });
    expect(await unauthenticated.waitFor((message) => message.type === "error")).toMatchObject({
      code: "403",
    });
    const snapshots = probes[0]?.messages.filter((message) => message.type === "snapshot");
    expect(JSON.stringify(snapshots)).not.toContain(admissions[0]?.session.secret);
    expect(JSON.stringify(snapshots)).not.toContain("secretHash");
  });

  it("ends unfinished races, isolates rooms, resets epochs, and deletes expired room data", async () => {
    const { probes, roomId } = await room(2);
    const other = await room(2);
    await countdown(probes);
    await changeTime(roomId, "start");
    await changeTime(roomId, "deadline");
    const ended = await probes[0]?.snapshot((state) => state.phase === "finished");
    expect(ended).toMatchObject({ outcome: "timeout", winnerId: null });
    expect(ended?.standupStarterId).not.toBeNull();
    expect(ended?.standupTieCount).toBe(2);
    const isolated = await other.probes[0]?.snapshot((state) => state.phase === "lobby");
    expect(isolated?.raceId).toBeNull();
    probes[0]?.send({ type: "reset" });
    const resetState = await probes[0]?.snapshot(
      (state) => state.phase === "lobby" && state.version > (ended?.version ?? 0),
    );
    expect(resetState?.players.every((player) => player.progress === 0 && !player.ready)).toBe(
      true,
    );
    expect(resetState?.raceId).toBeNull();
    expect(resetState?.standupStarterId).toBeNull();
    await changeTime(roomId, "expiry");
    const rows = await runInDurableObject(env.ROOMS.getByName(roomId), (_instance, context) =>
      context.storage.sql
        .exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'room'")
        .toArray(),
    );
    expect(rows).toHaveLength(0);
  });
});
