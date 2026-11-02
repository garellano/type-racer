import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

// Start a local Vite frontend and local-only Wrangler before running this script.
const { chromium } = await import(process.env.TYPE_RACER_PLAYWRIGHT_MODULE || "playwright");
const base = new URL(process.env.TYPE_RACER_BROWSER_URL || "http://127.0.0.1:5173/type-racer/");
assert(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Use a local frontend.");
const report = {
  passed: false,
  localOnly: true,
  games: {},
  pageErrors: [],
  blockedExternalRequests: 0,
};
const states = new WeakMap();
const network = new WeakMap();
let browser;

async function page(context, url = base.href) {
  const tab = await context.newPage();
  network.set(tab, { roomRequests: 0, sockets: 0 });
  tab.on("pageerror", (error) => report.pageErrors.push(error.message));
  tab.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/rooms")) network.get(tab).roomRequests++;
  });
  tab.on("websocket", (socket) => {
    // Vite's local development socket is separate from multiplayer transport.
    if (!new URL(socket.url()).pathname.startsWith("/rooms/")) return;
    network.get(tab).sockets++;
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      const message = JSON.parse(payload);
      if (message.type === "snapshot") states.set(tab, message.state);
    });
  });
  await tab.goto(url);
  return tab;
}

async function context(narrow = false) {
  const result = await browser.newContext({
    viewport: narrow ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    reducedMotion: narrow ? "reduce" : "no-preference",
  });
  await result.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) await route.continue();
    else {
      report.blockedExternalRequests++;
      await route.abort();
    }
  });
  return result;
}

async function until(predicate, label, timeout = 10000) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    assert(Date.now() < end, label);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

async function noOverflow(tab) {
  assert.equal(
    await tab.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    "Narrow layout overflows.",
  );
}

async function pair(mode) {
  const hostContext = await context();
  const guestContext = await context(true);
  const host = await page(hostContext);
  await host.locator(`input[value="${mode}"]`).check();
  await host.locator("#name").fill("Security Host");
  await host.locator("#enter").click();
  await host.locator(`#game[data-mode="${mode}"]`).waitFor({ state: "visible" });
  const invite = await host.locator("#invite").inputValue();
  assert.deepEqual([...new URLSearchParams(new URL(invite).hash.slice(1)).keys()], ["room"]);
  const guest = await page(guestContext, invite);
  await guest.locator("#name").fill("Security Guest");
  await guest.locator("#enter").click();
  await until(
    () => states.get(host)?.players.length === 2 && states.get(guest)?.players.length === 2,
    "Both players admitted.",
  );
  await noOverflow(guest);
  return { host, guest, hostContext, guestContext };
}

async function typing(mode) {
  const { host, guest, hostContext, guestContext } = await pair(mode);
  try {
    await host.locator("#ready").click();
    await guest.locator("#ready").click();
    await host.locator("#start").click();
    await until(() => states.get(host)?.startAt && states.get(guest)?.startAt, "Shared countdown.");
    assert.equal(states.get(host).startAt, states.get(guest).startAt);
    assert.equal(states.get(host).passage, states.get(guest).passage);
    const raceId = states.get(host).raceId;
    await guest.reload();
    await until(
      () =>
        states.get(guest)?.raceId === raceId &&
        states.get(guest).players.every((person) => person.connected),
      "Countdown refresh recovered.",
    );
    await guest.locator("#typing").waitFor({ state: "visible" });
    await guest.waitForFunction(() => !document.querySelector("#typing").disabled);
    await guest.locator("#typing").fill(states.get(host).passage.slice(0, 20));
    await until(
      () =>
        states
          .get(host)
          ?.players.some((person) => person.name === "Security Guest" && person.progress === 20),
      "Guest progress shared.",
    );
    await host.locator("#typing").fill(states.get(host).passage);
    await host.locator('#game[data-phase="finished"]').waitFor();
    await guest.locator('#game[data-phase="finished"]').waitFor();
    assert.equal(states.get(host).winnerId, states.get(guest).winnerId);
    assert.equal(states.get(host).standupStarterId, states.get(guest).standupStarterId);
    const winner = await host.locator("#winner").textContent();
    const opener = await host.locator("#standup-opener").textContent();
    assert.match(winner, /Security Host/);
    assert.match(opener, /Security Guest/);
    states.delete(host);
    await host.reload();
    await host.locator('#game[data-phase="finished"]').waitFor();
    assert.equal(await host.locator("#winner").textContent(), winner);
    assert.equal(await host.locator("#standup-opener").textContent(), opener);
    await noOverflow(guest);
    report.games[mode] = {
      sharedStart: true,
      sharedProgress: true,
      sharedResult: true,
      countdownRefresh: true,
      resultRefresh: true,
      narrowReducedMotion: true,
      inviteContainsRoomOnly: true,
    };
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
}

async function bomb() {
  const { host, guest, hostContext, guestContext } = await pair("bomb");
  try {
    await host.locator("#start").click();
    await host.locator('#bomb-panel[data-phase="selecting"]').waitFor();
    await host.locator(".bomb-plug").first().click();
    await guest.locator(".bomb-plug").nth(1).click();
    await host.locator('#bomb-panel[data-phase="countdown"]').waitFor();
    assert.equal(states.get(host).startAt, states.get(guest).startAt);
    states.delete(host);
    await host.reload();
    await until(
      () => states.get(host)?.bomb?.cables.every((cable) => cable.playerId),
      "Wire selections survived refresh.",
    );
    await host.locator('#bomb-panel[data-phase="finished"]').waitFor({ timeout: 45000 });
    await guest.locator('#bomb-panel[data-phase="finished"]').waitFor();
    assert.equal(states.get(host).winnerId, null);
    assert.equal(states.get(host).standupStarterId, states.get(guest).standupStarterId);
    const announcement = await host.locator(".bomb-announcement").textContent();
    assert.equal(await guest.locator(".bomb-announcement").textContent(), announcement);
    states.delete(guest);
    await guest.reload();
    await guest.locator('#bomb-panel[data-phase="finished"]').waitFor();
    assert.equal(await guest.locator(".bomb-announcement").textContent(), announcement);
    await noOverflow(guest);
    report.games.bomb = {
      sharedStart: true,
      wiresRecovered: true,
      sharedOpeningSpeaker: true,
      resultRefresh: true,
      narrowReducedMotion: true,
    };
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
}

async function automatic(mode) {
  const browserContext = await context(true);
  const tab = await page(browserContext, `${base.href}#game=${mode}`);
  const prefix = mode === "derby" ? "derby" : "hot-mic";
  const key = mode === "derby" ? "type-racer:office-derby:round:v1" : "type-racer:hot-mic:round:v1";
  try {
    await tab.locator(`.${prefix}-start`).click();
    const frozen = await tab.evaluate((key) => sessionStorage.getItem(key), key);
    assert(frozen, "Round saved before animation.");
    await tab.reload();
    await tab.locator(`.${prefix}-start`).waitFor();
    assert.equal(await tab.evaluate((key) => sessionStorage.getItem(key), key), frozen);
    await tab.locator(`.${prefix}-results`).waitFor({ state: "visible", timeout: 30000 });
    const result = await tab.locator(`.${prefix}-results h2`).textContent();
    await tab.reload();
    await tab.locator(`.${prefix}-results`).waitFor({ state: "visible" });
    assert.equal(await tab.locator(`.${prefix}-results h2`).textContent(), result);
    assert.equal(await tab.evaluate((key) => sessionStorage.getItem(key), key), frozen);
    await noOverflow(tab);
    assert.deepEqual(network.get(tab), { roomRequests: 0, sockets: 0 });
    report.games[mode] = {
      savedFrozenPlan: true,
      runningRefresh: true,
      sameResultAfterRefresh: true,
      noRoomRequests: true,
      noRoomSockets: true,
      narrowReducedMotion: true,
    };
  } finally {
    await browserContext.close();
  }
}

try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.TYPE_RACER_CHROMIUM ? { executablePath: process.env.TYPE_RACER_CHROMIUM } : {}),
  });
  // Separate contexts keep all five games' storage and multiplayer sessions isolated.
  const results = await Promise.allSettled([
    typing("cars"),
    typing("sacks"),
    bomb(),
    automatic("derby"),
    automatic("hot-mic"),
  ]);
  const failures = results.filter((result) => result.status === "rejected");
  assert.equal(failures.length, 0, failures.map((failure) => failure.reason.message).join("\n"));
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
} finally {
  if (browser) await browser.close();
  const output = JSON.stringify(report, null, 2);
  if (process.env.TYPE_RACER_BROWSER_REPORT)
    await writeFile(process.env.TYPE_RACER_BROWSER_REPORT, `${output}\n`);
  console.log(output);
}
