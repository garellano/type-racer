import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";

const api = process.argv[2] || "http://127.0.0.1:8787";
const origin = process.argv[3] || "http://127.0.0.1:5173";
const language = process.argv[4] || "english";
assert(["english", "spanish", "java"].includes(language), "Choose english, spanish, or java.");
const sockets = [];

async function post(path, body) {
  const response = await fetch(new URL(path, api), {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get("Content-Type") || "";
  assert(
    contentType.includes("application/json"),
    `HTTP ${response.status}: expected JSON. The endpoint may still be propagating.`,
  );
  const payload = await response.json();
  assert(response.ok, `HTTP ${response.status}: ${payload.error}`);
  assert(payload.session?.secret && payload.roomId, "Missing admission data.");
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
    messages,
    send(message) {
      socket.send(JSON.stringify(message));
    },
    async state(predicate) {
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        const error = messages.findLast((message) => message.type === "error");
        if (error) throw new Error(error.message);
        const message = messages.findLast(
          (item) => item.type === "snapshot" && predicate(item.state),
        );
        if (message) return message.state;
        await delay(20);
      }
      throw new Error("Timed out waiting for shared state.");
    },
  };
  client.send({ type: "hello", session: admission.session });
  await client.state((state) =>
    state.players.some((player) => player.id === admission.session.playerId && player.connected),
  );
  return client;
}

try {
  const host = await post("/rooms", { name: "Smoke Host" });
  const admissions = [host];
  for (let index = 1; index < 8; index++)
    admissions.push(await post(`/rooms/${host.roomId}/join`, { name: `Smoke Racer ${index + 1}` }));
  const clients = [];
  for (const admission of admissions) clients.push(await connect(admission));
  if (language !== "english") clients[0].send({ type: "configure", language });
  await Promise.all(clients.map((client) => client.state((state) => state.language === language)));
  for (const client of clients) client.send({ type: "ready", ready: true });
  await clients[0].state((state) =>
    state.players.every((player) => player.ready && player.connected),
  );
  clients[0].send({ type: "start" });
  const starts = await Promise.all(
    clients.map((client) => client.state((state) => state.phase === "countdown")),
  );
  assert.equal(new Set(starts.map((state) => state.startAt)).size, 1);
  assert.equal(new Set(starts.map((state) => state.raceId)).size, 1);
  assert.equal(new Set(starts.map((state) => state.passage)).size, 1);
  assert(
    starts.every((state) => state.language === language),
    "Shared language must match.",
  );
  const start = starts[0];
  assert(start.startAt > Date.now(), "Countdown must be scheduled in the future.");
  clients[0].send({ type: "progress", raceId: start.raceId, sequence: 1, text: start.passage });
  await delay(200);
  assert.equal(
    clients[0].messages.findLast((message) => message.type === "snapshot").state.phase,
    "countdown",
  );
  await delay(Math.max(0, start.startAt - Date.now()) + 150);
  await Promise.all(clients.map((client) => client.state((state) => state.phase === "racing")));
  clients.forEach((client, index) =>
    client.send({
      type: "progress",
      raceId: start.raceId,
      sequence: 2,
      text: start.passage.slice(0, 10 + index * 10),
    }),
  );
  const progress = await clients[0].state((state) =>
    state.players.every((player, index) => player.progress === 10 + index * 10),
  );
  assert.equal(progress.winnerId, null);
  for (const client of clients)
    client.send({ type: "progress", raceId: start.raceId, sequence: 3, text: start.passage });
  const finals = await Promise.all(
    clients.map((client) => client.state((state) => state.phase === "finished")),
  );
  assert.equal(new Set(finals.map((state) => state.winnerId)).size, 1);
  assert(finals[0].winnerId, "Exactly one winner is required.");
  assert.equal(new Set(finals.map((state) => state.standupStarterId)).size, 1);
  assert(finals[0].standupStarterId, "One shared opening speaker is required.");
  const least = Math.min(...finals[0].players.map((player) => player.progress));
  const starter = finals[0].players.find((player) => player.id === finals[0].standupStarterId);
  assert.equal(starter?.progress, least);
  assert.notEqual(starter?.id, finals[0].winnerId);
  assert.equal(
    finals[0].players.filter((player) => player.progress === start.passage.length).length,
    1,
  );
  const resumed = await connect(host);
  const recovered = await resumed.state((state) => state.phase === "finished");
  assert.equal(recovered.winnerId, finals[0].winnerId);
  assert.equal(recovered.standupStarterId, finals[0].standupStarterId);
  assert.equal(recovered.standupTieCount, finals[0].standupTieCount);
  assert.equal(recovered.language, language);
  assert.equal(recovered.passage, start.passage);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        clients: 8,
        language,
        sharedStart: new Date(start.startAt).toISOString(),
        sharedWinner: true,
        sharedStandupOpener: true,
        progressVerified: true,
        resumeVerified: true,
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
          socket.close(1000, "Smoke test complete.");
        }),
    ),
  );
}
