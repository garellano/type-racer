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
  bombSchema,
  serverMessageSchema,
  type Admission,
  type ClientMessage,
  type ServerMessage,
  type Snapshot,
} from "../shared/protocol";
import {
  BOMB_COUNTDOWN_MS,
  BOMB_CUTS_MS,
  BOMB_FINALE_MS,
  BOMB_SELECTION_MS,
  cutTimes,
} from "../shared/bomb";
import { randomIndex, shuffled } from "../worker/bomb-random";

const origin = "http://127.0.0.1:5173";
const sockets: WebSocket[] = [];
async function post(path: string, body: unknown): Promise<Response> {
  return exports.default.fetch(`https://test.local${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
class Client {
  messages: ServerMessage[] = [];
  private listeners = new Set<() => void>();
  constructor(readonly socket: WebSocket) {
    sockets.push(socket);
    socket.accept();
    socket.addEventListener("message", (event: MessageEvent) => {
      this.messages.push(serverMessageSchema.parse(JSON.parse(String(event.data))));
      for (const listener of this.listeners) listener();
    });
  }
  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }
  async message(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    const existing = this.messages.findLast(predicate);
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      const check = () => {
        const found = this.messages.findLast(predicate);
        if (found) {
          clearTimeout(timeout);
          this.listeners.delete(check);
          resolve(found);
        }
      };
      const timeout = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error("Missing bomb event."));
      }, 4000);
      this.listeners.add(check);
    });
  }
  async state(predicate: (state: Snapshot) => boolean): Promise<Snapshot> {
    const message = await this.message((item) => item.type === "snapshot" && predicate(item.state));
    if (message.type !== "snapshot") throw new Error("Missing snapshot.");
    return message.state;
  }
}
async function connect(admission: Admission): Promise<Client> {
  const response = await exports.default.fetch(
    `https://test.local/rooms/${admission.roomId}/socket`,
    { headers: { Origin: origin, Upgrade: "websocket" } },
  );
  if (!response.webSocket) throw new Error("Missing socket.");
  const client = new Client(response.webSocket);
  client.send({ type: "hello", session: admission.session });
  await client.state((state) =>
    state.players.some((player) => player.id === admission.session.playerId && player.connected),
  );
  return client;
}
async function room(
  count: number,
): Promise<{ admissions: Admission[]; clients: Client[]; roomId: string }> {
  const response = await post("/rooms", { name: "Host", mode: "bomb" });
  expect(response.status).toBe(201);
  const host = admissionSchema.parse(await response.json());
  const admissions = [host];
  for (let index = 1; index < count; index++) {
    const joined = await post(`/rooms/${host.roomId}/join`, { name: `Teammate ${index + 1}` });
    expect(joined.status).toBe(200);
    admissions.push(admissionSchema.parse(await joined.json()));
  }
  const clients = [];
  for (const admission of admissions) clients.push(await connect(admission));
  return { admissions, clients, roomId: host.roomId };
}
const storedSchema = z
  .object({
    phase: z.string(),
    startAt: z.number().nullable(),
    deadline: z.number().nullable(),
    expiresAt: z.number(),
    bomb: bombSchema.nullable(),
    bombPlan: z.object({ order: z.array(z.int()), times: z.array(z.number()) }).nullable(),
  })
  .passthrough();
async function advance(
  roomId: string,
  event: "selection" | "countdown" | "cut" | "finish" | "expiry",
): Promise<void> {
  const stub = env.ROOMS.getByName(roomId);
  await runInDurableObject(stub, (_instance, context) => {
    const stored = storedSchema.parse(
      JSON.parse(
        context.storage.sql.exec<{ value: string }>("SELECT value FROM room WHERE id = 1").one()
          .value,
      ),
    );
    const now = Date.now() - 5;
    if (event === "selection" && stored.bomb) stored.bomb.selectionEndsAt = now;
    if (event === "countdown") stored.startAt = now;
    if (event === "cut" && stored.bombPlan && stored.bomb) {
      const index = stored.bomb.cables.filter((cable) => cable.cutAt !== null).length;
      stored.bombPlan.times[index] = now;
    }
    if (event === "finish") stored.deadline = now;
    if (event === "expiry") stored.expiresAt = now;
    context.storage.sql.exec("UPDATE room SET value = ? WHERE id = 1", JSON.stringify(stored));
  });
  await runDurableObjectAlarm(stub);
}
async function start(clients: Client[]): Promise<Snapshot> {
  clients[0]!.send({ type: "start" });
  return clients[0]!.state((state) => state.phase === "selecting");
}
afterEach(async () => {
  for (const socket of sockets.splice(0))
    if (socket.readyState === WebSocket.OPEN) socket.close(1000, "Test done.");
  await abortAllDurableObjects();
  await reset();
});

describe("bomb rules and fair draws", () => {
  it.each([2, 5, 10, 25])(
    "keeps a %i-person timeline within 52 seconds, with faster cuts",
    (count) => {
      const times = cutTimes(count, 1000);
      expect(times).toHaveLength(count - 1);
      expect(times.at(-1)).toBe(1000 + BOMB_CUTS_MS);
      expect(BOMB_SELECTION_MS + BOMB_COUNTDOWN_MS + BOMB_CUTS_MS + BOMB_FINALE_MS).toBe(52000);
      const intervals = times.map((time, index) => time - (times[index - 1] ?? 1000));
      expect(
        intervals.every(
          (interval, index) => interval > 0 && interval <= (intervals[index - 1] ?? Infinity),
        ),
      ).toBe(true);
    },
  );
  it.each([2, 5, 10, 25])(
    "gives every index equal input space and rejects biased tail values for %i",
    (count) => {
      for (let index = 0; index < count; index++)
        expect(randomIndex(count, () => 100 * count + index)).toBe(index);
      if (0x100000000 % count) {
        const draws = [0xffffffff, 0];
        expect(randomIndex(count, () => draws.shift()!)).toBe(0);
        expect(draws).toHaveLength(0);
      }
    },
  );
  it("enumerates all six permutations of three players with equal last-position counts", () => {
    const orders: string[][] = [];
    for (let first = 0; first < 3; first++)
      for (let second = 0; second < 2; second++) {
        const draws = [first, second];
        orders.push(shuffled(["A", "B", "C"], () => draws.shift()!));
      }
    expect(new Set(orders.map((order) => order.join(""))).size).toBe(6);
    for (const player of ["A", "B", "C"])
      expect(orders.filter((order) => order.at(-1) === player)).toHaveLength(2);
  });
});

describe("authoritative bomb rounds in Workers", () => {
  it.each([2, 5, 10, 25])(
    "shares every selection, cut and one persistent result for %i participants",
    async (count) => {
      const { admissions, clients, roomId } = await room(count);
      const selecting = await start(clients);
      expect(selecting.bomb?.cables).toHaveLength(count);
      expect(selecting.standupStarterId).toBeNull();
      expect((await post(`/rooms/${roomId}/join`, { name: "Late arrival" })).status).toBe(409);

      clients.forEach((client, cableId) =>
        client.send({ type: "wire", raceId: selecting.raceId!, cableId }),
      );
      const countdowns = await Promise.all(
        clients.map((client) => client.state((state) => state.phase === "countdown")),
      );
      expect(new Set(countdowns.map((state) => JSON.stringify(state.bomb))).size).toBe(1);
      expect(countdowns[0]!.bomb!.cables.map((cable) => cable.playerId)).toEqual(
        admissions.map((admission) => admission.session.playerId),
      );
      expect(JSON.stringify(countdowns)).not.toContain("bombPlan");
      expect(JSON.stringify(countdowns)).not.toContain("secretHash");
      expect(countdowns.every((state) => state.standupStarterId === null)).toBe(true);
      await evictDurableObject(env.ROOMS.getByName(roomId));
      const restored = await connect(admissions[0]!);
      clients[0] = restored;
      expect((await restored.state((state) => state.phase === "countdown")).bomb).toEqual(
        countdowns[0]!.bomb,
      );
      await advance(roomId, "countdown");
      for (let cut = 1; cut < count; cut++) {
        await advance(roomId, "cut");
        const shared = await Promise.all(
          clients.map((client) =>
            client.state(
              (state) => state.bomb?.cables.filter((cable) => cable.cutAt !== null).length === cut,
            ),
          ),
        );
        expect(new Set(shared.map((state) => JSON.stringify(state.bomb))).size).toBe(1);
        expect(shared.every((state) => state.standupStarterId === null)).toBe(true);
        if (cut === count - 1) expect(shared[0]!.phase).toBe("finale");
      }
      await advance(roomId, "finish");
      const finals = await Promise.all(
        clients.map((client) => client.state((state) => state.phase === "finished")),
      );
      const result = finals[0]!;
      expect(new Set(finals.map((state) => state.standupStarterId)).size).toBe(1);
      expect(result.standupStarterId).toBe(
        result.bomb!.cables.find((cable) => cable.cutAt === null)!.playerId,
      );
      expect(result.winnerId).toBeNull();
      expect(result.outcome).toBe("completed");
      await evictDurableObject(env.ROOMS.getByName(roomId));
      const recovered = await connect(admissions[0]!);

      expect((await recovered.state((state) => state.phase === "finished")).standupStarterId).toBe(
        result.standupStarterId,
      );
      await runDurableObjectAlarm(env.ROOMS.getByName(roomId));
      recovered.send({ type: "reset" });
      const resetState = await recovered.state(
        (state) => state.phase === "lobby" && state.version > result.version,
      );
      expect(resetState.bomb).toBeNull();
      expect(resetState.standupStarterId).toBeNull();
      if (count <= 9) {
        recovered.send({ type: "configure", mode: "cars" });
        await recovered.state((state) => state.mode === "cars");
      } else {
        recovered.send({ type: "configure", mode: "cars" });
        expect(await recovered.message((message) => message.type === "error")).toMatchObject({
          code: "409",
        });
      }
    },
  );
  it("resolves simultaneous claims atomically, locks choices, and ignores duplicate and stale packets", async () => {
    const { clients } = await room(5);
    const selecting = await start(clients);
    for (const client of clients)
      client.send({ type: "wire", raceId: selecting.raceId!, cableId: 0 });
    const assigned = await clients[0]!.state((state) => !!state.bomb?.cables[0]?.playerId);
    const chosenId = assigned.bomb!.cables[0]!.playerId;
    expect(assigned.bomb!.cables.filter((cable) => cable.playerId !== null)).toHaveLength(1);
    const winnerIndex = assigned.players.findIndex((player) => player.id === chosenId);
    const successful = clients[winnerIndex]!;
    const denied = clients.filter((_client, index) => index !== winnerIndex);
    for (const client of denied)
      expect(await client.message((message) => message.type === "error")).toMatchObject({
        code: "409",
        message: "That cable was just taken. Choose another cable.",
      });
    successful.send({ type: "wire", raceId: selecting.raceId!, cableId: 0 });
    successful.send({ type: "wire", raceId: selecting.raceId!, cableId: 1 });
    expect(await successful.message((message) => message.type === "error")).toMatchObject({
      message: "Your cable is locked for this round.",
    });
    denied[0]!.send({ type: "wire", raceId: crypto.randomUUID(), cableId: 1 });
    denied[0]!.send({ type: "ping", sentAt: 12 });
    await denied[0]!.message((message) => message.type === "pong" && message.sentAt === 12);
    expect(
      denied[0]!.messages.filter((message) => message.type === "snapshot").at(-1),
    ).toMatchObject({ state: { phase: "selecting" } });
  });
  it("auto-assigns absent players, recovers mid-sequence, catches delayed alarms up and expires", async () => {
    const { clients, admissions, roomId } = await room(5);
    const selecting = await start(clients);
    clients[0]!.send({ type: "wire", raceId: selecting.raceId!, cableId: 3 });
    await clients[0]!.state(
      (state) => state.bomb?.cables[3]?.playerId === admissions[0]!.session.playerId,
    );
    clients[4]!.socket.close(1000, "Temporarily offline.");
    await advance(roomId, "selection");
    const countdown = await clients[0]!.state((state) => state.phase === "countdown");
    expect(new Set(countdown.bomb!.cables.map((cable) => cable.playerId)).size).toBe(5);
    expect(countdown.bomb!.cables.every((cable) => cable.playerId !== null)).toBe(true);
    await advance(roomId, "countdown");
    await advance(roomId, "cut");
    const before = await clients[0]!.state(
      (state) => state.bomb?.cables.filter((cable) => cable.cutAt !== null).length === 1,
    );
    await evictDurableObject(env.ROOMS.getByName(roomId));
    const restored = await connect(admissions[4]!);
    expect((await restored.state((state) => state.phase === "defusing")).bomb).toEqual(before.bomb);
    const stub = env.ROOMS.getByName(roomId);
    await runInDurableObject(stub, (_instance, context) => {
      const stored = storedSchema.parse(
        JSON.parse(
          context.storage.sql.exec<{ value: string }>("SELECT value FROM room WHERE id = 1").one()
            .value,
        ),
      );
      stored.bombPlan!.times = stored.bombPlan!.times.map(
        (_time, index) => Date.now() - 500 + index,
      );
      stored.deadline = Date.now() - 1;
      context.storage.sql.exec("UPDATE room SET value = ? WHERE id = 1", JSON.stringify(stored));
    });
    await runDurableObjectAlarm(stub);
    const final = await restored.state((state) => state.phase === "finished");
    expect(final.bomb!.cables.filter((cable) => cable.cutAt === null)).toHaveLength(1);
    await runDurableObjectAlarm(stub);
    const retained = await connect(admissions[4]!);
    expect((await retained.state((state) => state.phase === "finished")).standupStarterId).toBe(
      final.standupStarterId,
    );
    await advance(roomId, "expiry");
    expect((await post(`/rooms/${roomId}/join`, { session: admissions[0]!.session })).status).toBe(
      410,
    );
  });
  it("enforces bomb capacity and host control and rejects client identity and outcome claims", async () => {
    const { clients, roomId } = await room(25);
    expect((await post(`/rooms/${roomId}/join`, { name: "Overflow" })).status).toBe(409);
    clients[1]!.send({ type: "start" });
    expect(await clients[1]!.message((message) => message.type === "error")).toMatchObject({
      code: "403",
    });
    const selecting = await start(clients);
    clients[2]!.socket.send(
      JSON.stringify({
        type: "wire",
        raceId: selecting.raceId,
        cableId: 0,
        playerId: selecting.hostId,
      }),
    );
    expect(await clients[2]!.message((message) => message.type === "error")).toMatchObject({
      code: "invalid_message",
    });
    clients[0]!.send({ type: "progress", raceId: selecting.raceId!, sequence: 1, text: "" });
    clients[0]!.send({ type: "configure", mode: "cars" });
    expect(await clients[0]!.message((message) => message.type === "error")).toMatchObject({
      code: "409",
    });
  });
});
