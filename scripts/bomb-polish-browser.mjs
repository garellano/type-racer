import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WebSocket } from "ws";
import { format } from "prettier";

const { chromium } = await import(process.env.TYPE_RACER_PLAYWRIGHT_MODULE || "playwright");
const output = resolve("docs/evidence/bomb-polish");
const sockets = [];
const errors = [];
const levels = {};
let browser;
await mkdir(output, { recursive: true });

async function observe(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__sound = { levels: [], samples: [], recording: false };
    window.__raceFlash = 0;
    window.__auditEntry = true;
    const frame = () => {
      const game = document.querySelector("#game");
      if (window.__auditEntry && game?.checkVisibility() && game.dataset.mode !== "bomb")
        window.__raceFlash++;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const NativeContext = window.AudioContext;
    const connect = AudioNode.prototype.connect;
    window.AudioContext = class extends NativeContext {
      constructor(...args) {
        super(...args);
        // Measure real PCM at the final output, rather than merely counting oscillator calls.
        const probe = this.createScriptProcessor(1024, 1, 1);
        probe.onaudioprocess = (event) => {
          const samples = event.inputBuffer.getChannelData(0);
          let energy = 0;
          for (const value of samples) energy += value * value;
          window.__sound.levels.push({
            at: performance.now(),
            rms: Math.sqrt(energy / samples.length),
          });
          if (window.__sound.recording) window.__sound.samples.push(Array.from(samples));
        };
        connect.call(probe, this.destination);
        this.__probe = probe;
        window.__sound.sampleRate = this.sampleRate;
      }
    };
    AudioNode.prototype.connect = function (destination, ...args) {
      if (destination === this.context.destination && this.context.__probe)
        connect.call(this, this.context.__probe);
      return connect.call(this, destination, ...args);
    };
  });
}

async function delaySnapshots(page) {
  let queued = [];
  let holding = true;
  let route;
  await page.routeWebSocket(/\/socket$/, (socket) => {
    route = socket;
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (holding) queued.push([socket, message]);
      else socket.send(message);
    });
  });
  return {
    release() {
      holding = false;
      for (const [socket, message] of queued) socket.send(message);
      queued = [];
    },
    async disconnect() {
      holding = true;
      await route.close({ code: 1012, reason: "Audio recovery check" });
    },
    queued: () => queued.length,
  };
}

async function assertLoading(page, gate, label) {
  await page.locator("#room-loading").waitFor({ state: "visible" });
  await page.waitForTimeout(350);
  assert.equal(await page.locator("#game").isVisible(), false, `${label}: room stays hidden`);
  assert.equal(await page.locator(".race-layout").isVisible(), false, `${label}: no track flash`);
  gate.release();
  await page.locator("#bomb-panel").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => window.__raceFlash), 0, `${label}: no visible race frame`);
}

async function energy(page, label, duration = 1000, audible = true) {
  const since = await page.evaluate(() => performance.now());
  await page.waitForTimeout(duration);
  const peak = await page.evaluate(
    (since) =>
      Math.max(
        0,
        ...window.__sound.levels.filter((item) => item.at > since + 120).map((item) => item.rms),
      ),
    since,
  );
  levels[label] = Number(peak.toFixed(6));
  if (audible) assert(peak > 0.002, `${label}: expected audible PCM, got ${peak}`);
  else assert(peak < 0.00001, `${label}: expected silence, got ${peak}`);
}

async function teammate(roomId, name) {
  const response = await fetch(`http://127.0.0.1:8787/rooms/${roomId}/join`, {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  assert(response.ok);
  const admission = await response.json();
  const socket = new WebSocket(`ws://127.0.0.1:8787/rooms/${roomId}/socket`, {
    headers: { Origin: "http://127.0.0.1:5173" },
  });
  sockets.push(socket);
  let state;
  socket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type === "snapshot") state = message.state;
    if (message.type === "error") errors.push(message.message);
  });
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  socket.send(JSON.stringify({ type: "hello", session: admission.session }));
  const joinDeadline = Date.now() + 5000;
  while (!state) {
    assert(Date.now() < joinDeadline, "Teammate authentication timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return { socket, state: () => state };
}

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const host = await context.newPage();
  await observe(host);
  const gate = await delaySnapshots(host);
  await host.goto("http://127.0.0.1:5173/type-racer/");
  await host.locator('input[value="bomb"]').check();
  await host.locator("#name").fill("Julio");
  await host.locator("#enter").click();
  await assertLoading(host, gate, "Create");
  await host.locator("#bomb-panel").screenshot({ path: `${output}/lobby-desktop.png` });
  await host.getByRole("button", { name: "Turn suspense sound on", exact: true }).click();
  await energy(host, "toggleConfirmation", 450);
  await host.waitForTimeout(400);
  await energy(host, "lobbySettles", 500, false);

  const invite = await host.locator("#invite").inputValue();
  const roomId = new URLSearchParams(new URL(invite).hash.slice(1)).get("room");
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await mobileContext.newPage();
  await observe(guest);
  const guestGate = await delaySnapshots(guest);
  await guest.goto(invite);
  await guest.locator("#name").fill("Alexandra Longlastname");
  await guest.locator("#enter").click();
  await assertLoading(guest, guestGate, "Join");
  // A new page route holds the restored seat's first authenticated snapshot as well.
  const restoreGate = await delaySnapshots(guest);
  await guest.reload();
  await assertLoading(guest, restoreGate, "Restore");
  const clients = [];
  for (const name of ["Rocío", "Carlos", "Eduardo"]) clients.push(await teammate(roomId, name));
  await host.locator(".bomb-player").nth(4).waitFor();
  await host.locator("#start").click();
  await host.locator('#bomb-panel[data-phase="selecting"]').waitFor();
  await energy(host, "selection");
  await host.getByRole("button", { name: "Turn suspense sound off", exact: true }).click();
  await energy(host, "muted", 600, false);
  await host.getByRole("button", { name: "Turn suspense sound on", exact: true }).click();
  await energy(host, "unmuted");
  await host.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await energy(host, "hidden", 600, false);
  await host.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await energy(host, "visibleAgain");
  await gate.disconnect();
  await energy(host, "disconnected", 700, false);
  const reconnectDeadline = Date.now() + 5000;
  while (!gate.queued()) {
    assert(Date.now() < reconnectDeadline, "Host reconnection timed out");
    await host.waitForTimeout(50);
  }
  gate.release();
  await host.waitForFunction(
    () => document.querySelector("#connection-label").textContent === "Connected",
  );
  await energy(host, "reconnected");
  await host.locator(".bomb-plug").first().click();
  await guest.locator(".bomb-plug").nth(1).click();
  const raceId = clients[0].state().raceId;
  clients.forEach((client, index) =>
    client.socket.send(JSON.stringify({ type: "wire", raceId, cableId: index + 2 })),
  );
  await host.locator('#bomb-panel[data-phase="countdown"]').waitFor();
  await host.waitForTimeout(650);
  await host.locator("#bomb-panel").screenshot({ path: `${output}/countdown-desktop.png` });
  await guest.locator("#bomb-panel").screenshot({ path: `${output}/countdown-mobile.png` });
  for (const page of [host, guest]) {
    const gaps = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".bomb-player")];
      return [...document.querySelectorAll(".bomb-wire")].map((path, index) => {
        const end = path
          .getPointAtLength(path.getTotalLength())
          .matrixTransform(path.getScreenCTM());
        const card = cards[index].getBoundingClientRect();
        return {
          x: Math.abs(end.x - (index % 2 ? card.left : card.right)),
          y: Math.abs(end.y - (card.top + card.height / 2)),
        };
      });
    });
    assert(
      gaps.every((gap) => gap.x <= 6 && gap.y <= 2),
      "Every wire reaches its owner's card",
    );
  }
  await energy(host, "countdown");
  await host.locator('#bomb-panel[data-phase="defusing"]').waitFor();
  await host.evaluate(() => {
    window.__sound.recording = true;
  });
  await energy(host, "defusing");
  await host.locator('#bomb-panel[data-phase="finale"]').waitFor({ timeout: 35000 });
  await energy(host, "finale", 700);
  await host.locator('#bomb-panel[data-phase="finished"]').waitFor();
  await energy(host, "explosion", 850);
  await host.waitForTimeout(1000);
  await host.evaluate(() => {
    window.__sound.recording = false;
  });
  await energy(host, "resultSettles", 600, false);
  await host.locator("#bomb-panel").screenshot({ path: `${output}/result-desktop.png` });
  await guest.locator("#bomb-panel").screenshot({ path: `${output}/result-mobile.png` });
  assert.equal(
    await guest.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  const burst = await guest.locator(".bomb-boom").boundingBox();
  const cards = await guest.locator(".bomb-player").evaluateAll((cards) =>
    cards.map((card) => {
      const { x, y, width, height } = card.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
  assert(
    cards.every(
      (card) =>
        burst.x + burst.width <= card.x ||
        card.x + card.width <= burst.x ||
        burst.y + burst.height <= card.y ||
        card.y + card.height <= burst.y,
    ),
    "Burst must keep every name visible",
  );
  const pcm = await host.evaluate(() => ({
    sampleRate: window.__sound.sampleRate,
    samples: window.__sound.samples.flat(),
  }));
  // Store a listenable excerpt without sessions or player data.
  const wav = Buffer.alloc(44 + pcm.samples.length * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(pcm.sampleRate, 24);
  wav.writeUInt32LE(pcm.sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.samples.length * 2, 40);
  pcm.samples.forEach((sample, index) =>
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + index * 2),
  );
  await writeFile(`${output}/suspense-preview.wav`, wav);
  await host.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await energy(host, "finishedReturn", 700, false);
  await host.locator("#reset").click();
  await host.locator('#bomb-panel[data-phase="lobby"]').waitFor();
  await host.evaluate(() => {
    window.__auditEntry = false;
  });
  await host.locator("#mode").selectOption("cars");
  await host.locator('#game[data-mode="cars"]').waitFor();
  assert.equal(await host.locator(".race-layout").isVisible(), true);
  await energy(host, "otherMode", 600, false);

  const denied = await context.newPage();
  denied.on("pageerror", (error) => errors.push(error.message));
  await denied.addInitScript(() => {
    window.__nativeResume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = () => Promise.reject(new Error("Audio unavailable"));
  });
  await denied.goto("http://127.0.0.1:5173/type-racer/");
  await denied.locator('input[value="bomb"]').check();
  await denied.locator("#name").fill("Sound recovery");
  await denied.locator("#enter").click();
  await denied.locator("#bomb-panel").waitFor({ state: "visible" });
  await denied.getByRole("button", { name: "Turn suspense sound on", exact: true }).click();
  await denied.locator(".bomb-sound-help").waitFor({ state: "visible" });
  assert.equal(
    await denied.locator(".bomb-controls button").nth(1).getAttribute("aria-pressed"),
    "false",
  );
  await denied.evaluate(() => {
    window.__resumes = [];
    AudioContext.prototype.resume = function () {
      const result = window.__nativeResume.call(this);
      return new Promise((resolve, reject) =>
        window.__resumes.push(() => result.then(resolve, reject)),
      );
    };
  });
  const soundButton = denied.locator(".bomb-controls button").nth(1);
  await soundButton.click();
  await soundButton.click();
  await soundButton.click();
  await denied.evaluate(() => window.__resumes[0]());
  assert.equal(
    await soundButton.getAttribute("aria-pressed"),
    "true",
    "An old resume cannot undo a newer click",
  );
  await denied.evaluate(() => window.__resumes[1]());
  assert.equal(await soundButton.getAttribute("aria-pressed"), "true");

  const failedEntry = await context.newPage();
  await failedEntry.route(/http:\/\/127\.0\.0\.1:8787\/rooms$/, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Please try again." }),
    }),
  );
  await failedEntry.goto("http://127.0.0.1:5173/type-racer/");
  await failedEntry.locator("#name").fill("Retry");
  await failedEntry.locator("#enter").click();
  await failedEntry.locator("#error").waitFor({ state: "visible" });
  assert.equal(await failedEntry.locator("#entry").isVisible(), true);
  assert.equal(await failedEntry.locator("#room-loading").isVisible(), false);
  assert.deepEqual(errors, []);
  const report = {
    createJoinRestoreWithoutTrackFlash: true,
    audiblePCM: levels,
    mutedAndPausedSilence: true,
    failedAudioFeedback: true,
    rapidSoundToggle: true,
    failedEntryCanRetry: true,
    wiresReachCards: true,
    mobileOverflow: false,
    burstLeavesNamesVisible: true,
    pageErrors: errors,
  };
  await writeFile(
    `${output}/browser-report.json`,
    await format(JSON.stringify(report), { parser: "json" }),
  );
  console.log(JSON.stringify(report));
} finally {
  for (const socket of sockets) socket.close(1000, "Polish check complete");
  await browser?.close();
}
