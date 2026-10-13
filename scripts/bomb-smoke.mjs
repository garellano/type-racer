import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";

const api = process.argv[2] || "http://127.0.0.1:8787";
const origin = process.argv[3] || "http://127.0.0.1:5173";
const count = Number(process.argv[4] || 25);
assert(Number.isInteger(count) && count >= 2 && count <= 25, "Choose 2–25 participants.");
const sockets = [];
async function post(path, body) {
  const response = await fetch(new URL(path, api), {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  assert(response.ok, `HTTP ${response.status}: ${payload.error}`);
  return payload;
}
async function connect(admission) {
  const url = new URL(`/rooms/${admission.roomId}/socket`, api);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url, { headers: { Origin: origin }, handshakeTimeout: 10000 });
  sockets.push(socket);
  const messages = [];
  socket.on("message", (raw) => messages.push(JSON.parse(String(raw))));
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const client = {
    socket,
    messages,
    send(message) {
      socket.send(JSON.stringify(message));
    },
    async state(predicate, timeout = 65000) {
      const until = Date.now() + timeout;
      while (Date.now() < until) {
        const error = messages.findLast((message) => message.type === "error");
        if (error) throw new Error(error.message);
        const snapshot = messages.findLast(
          (message) => message.type === "snapshot" && predicate(message.state),
        );
        if (snapshot) return snapshot.state;
        await delay(20);
      }
      throw new Error("Timed out waiting for bomb state.");
    },
  };
  client.send({ type: "hello", session: admission.session });
  await client.state((state) =>
    state.players.some((player) => player.id === admission.session.playerId && player.connected),
  );
  return client;
}
try {
  const host = await post("/rooms", { name: "Smoke Host", mode: "bomb" });
  const admissions = [host];
  for (let index = 1; index < count; index++)
    admissions.push(
      await post(`/rooms/${host.roomId}/join`, { name: `Smoke Teammate ${index + 1}` }),
    );
  const clients = [];
  for (const admission of admissions) clients.push(await connect(admission));
  const beganAt = Date.now();
  clients[0].send({ type: "start" });
  const selection = await clients[0].state((state) => state.phase === "selecting");
  assert.equal(selection.bomb.cables.length, count);
  // Keep one participant offline through timeout; they remain equally eligible.
  clients.at(-1).socket.close(1000, "Testing an absent participant.");
  for (let index = 0; index < count - 1; index++)
    clients[index].send({ type: "wire", raceId: selection.raceId, cableId: index });
  const active = clients.slice(0, -1);
  const countdowns = await Promise.all(
    active.map((client) => client.state((state) => state.phase === "countdown")),
  );
  assert.equal(new Set(countdowns.map((state) => JSON.stringify(state.bomb))).size, 1);
  assert.equal(new Set(countdowns[0].bomb.cables.map((cable) => cable.playerId)).size, count);
  assert(countdowns[0].bomb.cables.every((cable) => cable.playerId));
  assert.equal(countdowns[0].standupStarterId, null);
  assert(!JSON.stringify(countdowns).includes("bombPlan"));
  for (let cuts = 1; cuts < count; cuts++) {
    const snapshots = await Promise.all(
      active.map((client) =>
        client.state(
          (state) => state.bomb?.cables.filter((cable) => cable.cutAt !== null).length === cuts,
        ),
      ),
    );
    assert.equal(new Set(snapshots.map((state) => JSON.stringify(state.bomb))).size, 1);
    assert(snapshots.every((state) => state.standupStarterId === null));
  }
  const finals = await Promise.all(
    active.map((client) => client.state((state) => state.phase === "finished")),
  );
  const final = finals[0];
  assert.equal(new Set(finals.map((state) => state.standupStarterId)).size, 1);
  assert.equal(final.bomb.cables.filter((cable) => cable.cutAt === null).length, 1);
  assert.equal(
    final.standupStarterId,
    final.bomb.cables.find((cable) => cable.cutAt === null).playerId,
  );
  const elapsed = Date.now() - beganAt;
  assert(elapsed < 60000, "Normal round should end within one minute.");
  const recovered = await connect(admissions.at(-1));
  assert.equal(
    (await recovered.state((state) => state.phase === "finished")).standupStarterId,
    final.standupStarterId,
  );
  console.log(
    JSON.stringify(
      {
        status: "passed",
        clients: count,
        elapsedMs: elapsed,
        timeoutAssignment: true,
        sharedCuts: true,
        oneOpeningSpeaker: true,
        offlineRecovery: true,
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(
    sockets.map(
      (socket) =>
        new Promise((resolve) => {
          if (socket.readyState === WebSocket.CLOSED) {
            resolve();
            return;
          }
          const timeout = setTimeout(() => {
            socket.terminate();
            resolve();
          }, 1000);
          socket.once("close", () => {
            clearTimeout(timeout);
            resolve();
          });
          socket.close(1000, "Smoke check complete.");
        }),
    ),
  );
}
