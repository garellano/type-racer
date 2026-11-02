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
import {
  admissionSchema,
  MAX_BOMB_PLAYERS,
  MAX_MESSAGE_BYTES,
  serverMessageSchema,
  type Admission,
  type ClientMessage,
  type ServerMessage,
  type Snapshot,
} from "../shared/protocol";

const origin = "http://127.0.0.1:5173";
const sockets: WebSocket[] = [];

class Client {
  readonly messages: ServerMessage[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly socket: WebSocket,
    allowHalfOpen = false,
  ) {
    sockets.push(socket);
    socket.accept({ allowHalfOpen });
    socket.addEventListener("message", (event: MessageEvent) => {
      this.messages.push(serverMessageSchema.parse(JSON.parse(String(event.data))));
      for (const listener of this.listeners) listener();
    });
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
        reject(new Error("Missing security regression response."));
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

  async state(predicate: (state: Snapshot) => boolean): Promise<Snapshot> {
    const message = await this.waitFor((item) => item.type === "snapshot" && predicate(item.state));
    if (message.type !== "snapshot") throw new Error("Expected snapshot.");
    return message.state;
  }
}

function closed(client: Client): Promise<CloseEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Socket was not closed.")), 4000);
    client.socket.addEventListener(
      "close",
      (event) => {
        clearTimeout(timeout);
        resolve(event);
      },
      { once: true },
    );
  });
}

async function create(): Promise<Admission> {
  const response = await exports.default.fetch("https://test.local/rooms", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Host" }),
  });
  expect(response.status).toBe(201);
  return admissionSchema.parse(await response.json());
}

async function open(roomId: string, allowHalfOpen = false): Promise<Client> {
  const response = await exports.default.fetch(`https://test.local/rooms/${roomId}/socket`, {
    headers: { Origin: origin, Upgrade: "websocket" },
  });
  expect(response.status).toBe(101);
  if (!response.webSocket) throw new Error("Missing socket.");
  return new Client(response.webSocket, allowHalfOpen);
}

async function connect(admission: Admission): Promise<Client> {
  const client = await open(admission.roomId);
  client.send({ type: "hello", session: admission.session });
  await client.state((state) => state.players[0]?.connected === true);
  return client;
}

afterEach(async () => {
  for (const socket of sockets.splice(0))
    if (socket.readyState === WebSocket.OPEN) socket.close(1000, "Test finished.");
  await abortAllDurableObjects();
  await reset();
});

describe("room security boundaries", () => {
  it("reclaims idle unauthenticated sockets after hibernation without changing room state", async () => {
    const admission = await create();
    const host = await connect(admission);
    const before = await host.state(() => true);
    const pending = await open(admission.roomId);
    const close = closed(pending);
    const stub = env.ROOMS.getByName(admission.roomId);
    await runInDurableObject(stub, (_instance, context) => {
      for (const socket of context.getWebSockets()) {
        const attachment = z
          .object({ playerId: z.string().nullable() })
          .passthrough()
          .parse(socket.deserializeAttachment());
        if (attachment.playerId === null)
          socket.serializeAttachment({ ...attachment, authenticateBy: Date.now() - 1 });
      }
    });
    await evictDurableObject(stub);
    await runDurableObjectAlarm(stub);
    expect((await close).code).toBe(1008);
    host.send({ type: "ping", sentAt: 11 });
    await host.waitFor((message) => message.type === "pong" && message.sentAt === 11);
    const version = await runInDurableObject(
      stub,
      (_instance, context) =>
        context.storage.sql
          .exec<{ version: number }>(
            "SELECT json_extract(value, '$.version') AS version FROM room WHERE id = 1",
          )
          .one().version,
    );
    expect(version).toBe(before.version);
    expect(pending.messages).toHaveLength(0);
  });

  it("keeps authenticated reconnects available when pending handshakes fill their budget", async () => {
    const admission = await create();
    const oldest = await open(admission.roomId);
    const close = closed(oldest);
    for (let index = 1; index < MAX_BOMB_PLAYERS; index++) await open(admission.roomId);
    const host = await connect(admission);
    expect((await close).code).toBe(1008);
    expect((await host.state(() => true)).hostId).toBe(admission.session.playerId);
    const pendingCount = await runInDurableObject(
      env.ROOMS.getByName(admission.roomId),
      (_instance, context) =>
        context.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN).length,
    );
    expect(pendingCount).toBeLessThanOrEqual(MAX_BOMB_PLAYERS);
  });

  it("bounds tracked connections even when hostile clients ignore close frames", async () => {
    const admission = await create();
    for (let index = 0; index < MAX_BOMB_PLAYERS * 2; index++) await open(admission.roomId, true);
    const rejected = await exports.default.fetch(
      `https://test.local/rooms/${admission.roomId}/socket`,
      { headers: { Origin: origin, Upgrade: "websocket" } },
    );
    expect(rejected.status).toBe(429);
    const tracked = await runInDurableObject(
      env.ROOMS.getByName(admission.roomId),
      (_instance, context) => context.getWebSockets().length,
    );
    expect(tracked).toBe(MAX_BOMB_PLAYERS * 2);
  });

  it("rejects message flooding and retains the remaining budget through hibernation", async () => {
    const admission = await create();
    const host = await connect(admission);
    for (let index = 1; index <= 20; index++) host.send({ type: "ping", sentAt: index });
    await host.waitFor((message) => message.type === "pong" && message.sentAt === 20);
    await evictDurableObject(env.ROOMS.getByName(admission.roomId));
    const close = closed(host);
    for (let index = 21; index <= 60; index++) host.send({ type: "ping", sentAt: index });
    expect(await host.waitFor((message) => message.type === "error")).toMatchObject({
      code: "429",
    });
    expect((await close).code).toBe(1008);
    // Eviction cannot restore a fresh 40-message burst on the same connection.
    expect(host.messages.filter((message) => message.type === "pong").length).toBeLessThan(55);
  });

  it("keeps the synchronized start alarm ahead of pending authentication deadlines", async () => {
    const admission = await create();
    const stub = env.ROOMS.getByName(admission.roomId);
    const guestAdmission = admissionSchema.parse(await stub.join("Guest"));
    const host = await connect(admission);
    const guest = await connect(guestAdmission);
    host.send({ type: "ready", ready: true });
    guest.send({ type: "ready", ready: true });
    await host.state((state) => state.players.every((player) => player.ready));
    host.send({ type: "start" });
    const countdown = await host.state((state) => state.phase === "countdown");
    await open(admission.roomId);
    expect(await runInDurableObject(stub, (_instance, context) => context.storage.getAlarm())).toBe(
      countdown.startAt,
    );
    await runInDurableObject(stub, (_instance, context) => {
      context.storage.sql.exec(
        "UPDATE room SET value = json_set(value, '$.startAt', ?) WHERE id = 1",
        Date.now() - 1,
      );
    });
    await runDurableObjectAlarm(stub);
    expect((await host.state((state) => state.phase === "racing")).raceId).toBe(countdown.raceId);
    const nextAlarm = await runInDurableObject(stub, (_instance, context) =>
      context.storage.getAlarm(),
    );
    expect(nextAlarm).toBeLessThan(countdown.deadline!);
  });

  it("accepts legacy authenticated attachments after hibernation", async () => {
    const admission = await create();
    const host = await connect(admission);
    const stub = env.ROOMS.getByName(admission.roomId);
    await runInDurableObject(stub, (_instance, context) => {
      for (const socket of context.getWebSockets())
        socket.serializeAttachment({ playerId: admission.session.playerId });
    });
    await evictDurableObject(stub);
    host.send({ type: "ping", sentAt: 33 });
    expect(await host.waitFor((message) => message.type === "pong")).toMatchObject({ sentAt: 33 });
  });

  it("ignores duplicate readiness without another state write or broadcast", async () => {
    const admission = await create();
    const host = await connect(admission);
    host.send({ type: "ready", ready: true });
    const ready = await host.state((state) => state.players[0]?.ready === true);
    host.send({ type: "ready", ready: true });
    host.send({ type: "ping", sentAt: 22 });
    await host.waitFor((message) => message.type === "pong" && message.sentAt === 22);
    const state = await runInDurableObject(
      env.ROOMS.getByName(admission.roomId),
      (_instance, context) =>
        context.storage.sql
          .exec<{ version: number }>(
            "SELECT json_extract(value, '$.version') AS version FROM room WHERE id = 1",
          )
          .one(),
    );
    expect(state.version).toBe(ready.version);
    expect(host.messages.filter((message) => message.type === "snapshot")).toHaveLength(2);
  });

  it.each(["binary", "oversized", "utf8"] as const)(
    "closes %s frames before parsing commands",
    async (kind) => {
      const admission = await create();
      const host = await connect(admission);
      const close = closed(host);
      const payload =
        kind === "binary"
          ? new Uint8Array(1)
          : kind === "utf8"
            ? "é".repeat(MAX_MESSAGE_BYTES)
            : "x".repeat(MAX_MESSAGE_BYTES + 1);
      host.socket.send(payload);
      expect((await close).code).toBe(1009);
    },
  );
});
