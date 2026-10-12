import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WebSocket } from "ws";
const { chromium } = await import(process.env.TYPE_RACER_PLAYWRIGHT_MODULE || "playwright");
const output = resolve("docs/evidence/bomb");
await mkdir(output, { recursive: true });
const sockets = [];
let browser;
const errors = [];
async function post(path, body) {
  const res = await fetch(`http://127.0.0.1:8787${path}`, {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  assert(res.ok, JSON.stringify(result));
  return result;
}
async function connect(admission) {
  const socket = new WebSocket(`ws://127.0.0.1:8787/rooms/${admission.roomId}/socket`, {
    headers: { Origin: "http://127.0.0.1:5173" },
  });
  sockets.push(socket);
  const states = [];
  socket.on("message", (raw) => {
    const item = JSON.parse(String(raw));
    if (item.type === "snapshot") states.push(item.state);
    if (item.type === "error") errors.push(item.message);
  });
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  socket.send(JSON.stringify({ type: "hello", session: admission.session }));
  while (!states.length) await new Promise((resolve) => setTimeout(resolve, 20));
  return { socket, states };
}
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const host = await context.newPage();
  host.on("pageerror", (error) => errors.push(error.message));
  await host.goto("http://127.0.0.1:5173/type-racer/");
  await host.locator('input[value="bomb"]').check();
  await host.locator("#name").fill("Julio");
  await host.locator("#enter").click();
  await host.locator("#bomb-panel").waitFor({ state: "visible" });
  const invite = await host.locator("#invite").inputValue();
  const roomId = new URLSearchParams(new URL(invite).hash.slice(1)).get("room");
  const team = [
    "Carlos",
    "Rocío",
    "Eduardo",
    "Sam",
    "Gary",
    "Wil",
    "Kate",
    "Devan",
    "Gerardo",
    "Fabián",
    "Emanuel Medrano",
    "Arath",
    "Alex",
    "Morgan",
    "Taylor",
    "Jordan",
    "Casey",
    "Robin",
    "Charlie",
    "Drew",
    "Avery",
    "Quinn",
    "Cameron",
  ];
  const clients = [];
  for (const name of team)
    clients.push(await connect(await post(`/rooms/${roomId}/join`, { name })));
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await guestContext.newPage();
  guest.on("pageerror", (error) => errors.push(error.message));
  await guest.goto(invite);
  await guest.locator("#name").fill("Alexandra Longlastname");
  await guest.locator("#enter").click();
  await guest.locator(".bomb-player").nth(24).waitFor();
  await host.locator("#start").click();
  await host.locator('#bomb-panel[data-phase="selecting"]').waitFor();
  await host.locator(".bomb-plug").first().focus();
  await host.keyboard.press("Enter");
  await host.locator('.bomb-player[data-own="true"][data-state="connected"]').waitFor();
  const initial = clients[0].states.at(-1);
  const raceId = initial.raceId;
  clients
    .slice(0, 7)
    .forEach((client, index) =>
      client.socket.send(JSON.stringify({ type: "wire", raceId, cableId: index + 1 })),
    );
  await host.locator('.bomb-player[data-state="connected"]').nth(7).waitFor();
  await host.waitForTimeout(650);
  await host.locator("#bomb-panel").screenshot({ path: `${output}/selection-25.png` });
  await guest.locator("#bomb-panel").screenshot({ path: `${output}/selection-mobile-25.png` });
  const overflow = await guest.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(overflow, false, "Mobile page overflow");
  const overlap = await guest.locator(".bomb-player").evaluateAll((cards) =>
    cards.some((card, index) => {
      const next = cards[index + 2];
      return next && card.getBoundingClientRect().bottom > next.getBoundingClientRect().top;
    }),
  );
  assert.equal(overlap, false, "Mobile cards must not overlap");
  clients
    .slice(7)
    .forEach((client, index) =>
      client.socket.send(JSON.stringify({ type: "wire", raceId, cableId: index + 8 })),
    );
  await guest.locator(".bomb-plug").nth(24).click();
  await host.locator('#bomb-panel[data-phase="countdown"]').waitFor();
  await host.locator("#bomb-panel").screenshot({ path: `${output}/countdown-25.png` });
  const late = await fetch(`http://127.0.0.1:8787/rooms/${roomId}/join`, {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Late guest" }),
  });
  assert.equal(late.status, 409);
  await host.reload({ waitUntil: "domcontentloaded" });
  await host.locator('.bomb-player[data-own="true"][data-state="connected"]').waitFor();

  await host.locator('.bomb-player[data-state="safe"]').nth(9).waitFor({ timeout: 35000 });
  await host.locator("#bomb-panel").screenshot({ path: `${output}/cuts-25.png` });
  await guest.reload();
  await guest.locator('.bomb-player[data-own="true"]').waitFor();
  assert(
    (await guest.locator('.bomb-player[data-state="safe"]').count()) >= 10,
    "Refresh must recover revealed cuts",
  );
  await host.locator('#bomb-panel[data-phase="finale"]').waitFor({ timeout: 35000 });
  await host.locator("#bomb-panel").screenshot({ path: `${output}/finale-25.png` });
  await host.locator('#bomb-panel[data-phase="finished"]').waitFor();
  await guest.locator('#bomb-panel[data-phase="finished"]').waitFor();
  assert.equal(await host.locator('.bomb-player[data-state="safe"]').count(), 24);
  assert.equal(await host.locator('.bomb-player[data-state="starter"]').count(), 1);
  assert.equal(
    await host.locator(".bomb-announcement").textContent(),
    await guest.locator(".bomb-announcement").textContent(),
  );
  await host.locator("#bomb-panel").screenshot({ path: `${output}/result-25.png` });
  await guest.locator("#bomb-panel").screenshot({ path: `${output}/result-mobile-25.png` });
  await host.locator(".bomb-motion").first().click();
  assert.equal(await host.locator("#bomb-panel").getAttribute("data-reduced"), "true");
  await host.locator("#reset").click();
  await host.locator('#bomb-panel[data-phase="lobby"]').waitFor();
  assert.equal(await host.locator('.bomb-player[data-state="safe"]').count(), 0);
  assert.equal(await host.locator(".bomb-plug").count(), 0);

  for (const count of [2, 5]) {
    const smallContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await smallContext.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5173/type-racer/");
    await page.locator('input[value="bomb"]').check();
    await page.locator("#name").fill("Small Field Host");
    await page.locator("#enter").click();
    await page.locator("#bomb-panel").waitFor({ state: "visible" });
    const url = await page.locator("#invite").inputValue();
    const smallId = new URLSearchParams(new URL(url).hash.slice(1)).get("room");
    const smallClients = [];
    for (let index = 1; index < count; index++)
      smallClients.push(
        await connect(await post(`/rooms/${smallId}/join`, { name: `Teammate ${index + 1}` })),
      );
    await page.locator("#start").click();
    await page.locator('#bomb-panel[data-phase="selecting"]').waitFor();
    await page.locator(".bomb-plug").first().click();
    const smallRace = smallClients[0].states.at(-1).raceId;
    smallClients.forEach((client, index) =>
      client.socket.send(JSON.stringify({ type: "wire", raceId: smallRace, cableId: index + 1 })),
    );
    await page.locator('#bomb-panel[data-phase="countdown"]').waitFor();
    await page.waitForTimeout(650);
    await page.locator("#bomb-panel").screenshot({ path: `${output}/countdown-${count}.png` });
    assert.equal(await page.locator('.bomb-player[data-state="connected"]').count(), count);
    await smallContext.close();
  }
  assert.deepEqual(errors, []);
  const report = {
    clients: 25,
    keyboardSelection: true,
    lateJoinRejectedAndHostRecovered: true,
    smallFieldVisuals: [2, 5],
    sharedSelection: true,
    sharedCuts: true,
    refreshRecovery: true,
    sharedFinalSpeaker: true,
    mobileOverflow: false,
    mobileCardOverlap: false,
    reducedMotion: true,
    reset: true,
    pageErrors: errors,
  };
  await writeFile(`${output}/browser-report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  for (const socket of sockets) socket.close(1000, "Visual check complete");
  await browser?.close();
}
