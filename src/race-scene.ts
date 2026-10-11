import { rankPlayers, TRACK_METERS, type Snapshot } from "../shared/protocol";
import {
  approachDistance,
  cameraPosition,
  cameraWindow,
  elapsedLabel,
  progressMeters,
  radarWindow,
  VIEW_SPAN_METERS,
} from "./race-math";

const COLORS = [
  "#ffc94a",
  "#5ad9c2",
  "#ff9378",
  "#86b9ff",
  "#cca0f2",
  "#b7df69",
  "#f5a9d1",
  "#b1dee4",
];
const ROAD_INSET = 34;

const CAR_SPRITE = `${import.meta.env.BASE_URL}assets/arcade-coupe.png`;

type RacerVisual = {
  marker: HTMLElement;
  label: HTMLElement;
  edge: HTMLElement;
  dot: HTMLElement;
  standing: HTMLLIElement;
  current: number;
  target: number;
  connected: boolean;
};

function find<E extends HTMLElement>(root: HTMLElement, selector: string): E {
  const result = root.querySelector<E>(selector);
  if (!result) throw new Error(`Missing race scene element: ${selector}`);
  return result;
}

function text(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

export class RaceScene {
  private readonly viewport: HTMLElement;
  private readonly world: HTMLElement;
  private readonly lanes: HTMLElement;
  private readonly edges: HTMLElement;
  private readonly dots: HTMLElement;
  private readonly window: HTMLElement;
  private readonly standings: HTMLElement;
  private readonly range: HTMLElement;
  private readonly signal: HTMLElement;
  private readonly signalText: HTMLElement;
  private readonly verdict: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly wpm: HTMLElement;
  private readonly elapsed: HTMLElement;
  private readonly motionButton: HTMLButtonElement;
  private readonly preference = matchMedia("(prefers-reduced-motion: reduce)");
  private readonly resize: ResizeObserver;
  private readonly racers = new Map<string, RacerVisual>();
  private state: Snapshot | undefined;
  private ownId = "";
  private raceId: string | null = null;
  private width = 1000;
  private height = 196;
  private frame: number | undefined;
  private lastFrame = 0;
  private now = 0;
  private connected = true;
  private clockReady = false;
  private reduced = false;
  private rank = 0;
  private toastUntil = 0;
  private ownCharacters = 0;

  constructor(private readonly root: HTMLElement) {
    this.viewport = find(root, "#race-viewport");
    this.world = find(root, "#track-world");
    this.lanes = find(root, "#lanes");
    this.edges = find(root, "#offscreen-racers");
    this.dots = find(root, "#mini-dots");
    this.window = find(root, "#mini-window");
    this.standings = find(root, "#standings");
    this.range = find(root, "#camera-range");
    this.signal = find(root, "#race-signal");
    this.signalText = find(root, "#signal-text");
    this.verdict = find(root, "#scene-verdict");
    this.toast = find(root, "#race-toast");
    this.wpm = find(root, "#wpm");
    this.elapsed = find(root, "#elapsed");
    this.motionButton = find(root, "#motion-toggle");
    for (let meter = -50; meter <= TRACK_METERS + 50; meter += 10) {
      const tick = document.createElement("div");
      tick.className = "meter-tick";
      tick.style.left = `${meter}%`;
      tick.dataset.major = String(meter % 50 === 0);
      tick.textContent = meter % 50 === 0 ? `${meter} m` : "";
      this.world.append(tick);
    }
    this.resize = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) {
        this.width = entry.contentRect.width;
        this.height = entry.contentRect.height;
        this.positionRows();
        this.draw();
      }
    });
    this.resize.observe(this.viewport);
    this.setReduced(this.preference.matches);
    this.motionButton.addEventListener("click", this.toggleMotion);
    this.preference.addEventListener("change", this.changePreference);
    document.addEventListener("visibilitychange", this.changeVisibility);
  }

  private readonly toggleMotion = () => this.setReduced(!this.reduced);
  private readonly changePreference = () => this.setReduced(this.preference.matches);
  private readonly changeVisibility = () => {
    this.stop();
    if (!document.hidden) this.settle();
  };

  private setReduced(value: boolean): void {
    this.reduced = value;
    this.root.dataset.reducedMotion = String(value);
    this.motionButton.setAttribute("aria-pressed", String(value));
    this.settle();
  }

  private settle(): void {
    for (const racer of this.racers.values()) racer.current = racer.target;
    this.stop();
    this.draw();
  }

  private stop(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.lastFrame = 0;
  }

  private positionRows(): void {
    if (!this.state) return;
    const laneHeight = (this.height - ROAD_INSET * 2) / Math.max(2, this.state.players.length);
    this.state.players.forEach((player, index) => {
      const racer = this.racers.get(player.id);
      if (!racer) return;
      const top = `${ROAD_INSET + (index + 0.5) * laneHeight}px`;
      racer.marker.style.top = top;
      racer.edge.style.top = top;
    });
  }

  private requestFrame(): void {
    if (this.frame === undefined && !document.hidden)
      this.frame = requestAnimationFrame(this.animate);
  }

  private readonly animate = (timestamp: number): void => {
    this.frame = undefined;
    const delta = this.lastFrame ? Math.min(64, timestamp - this.lastFrame) : 16;
    this.lastFrame = timestamp;
    let moving = false;
    for (const [id, racer] of this.racers) {
      const previous = racer.current;
      racer.current = approachDistance(previous, racer.target, delta, id === this.ownId ? 45 : 85);
      const inMotion = Math.abs(racer.current - previous) > 0.001;
      racer.marker.dataset.moving = String(inMotion && racer.connected && !this.reduced);
      moving ||= racer.current !== racer.target;
    }
    this.draw();
    if (moving) this.requestFrame();
    else this.stop();
  };

  update(state: Snapshot, ownId: string, localCharacters: number, mistake: boolean): void {
    const newRace = state.raceId !== this.raceId;
    const firstState = !this.state;
    this.state = state;
    this.ownId = ownId;
    this.ownCharacters =
      state.phase === "finished"
        ? (state.players.find((player) => player.id === ownId)?.progress ?? 0)
        : localCharacters;
    this.root.dataset.phase = state.phase;
    this.viewport.dataset.phase = state.phase;
    if (newRace) {
      this.raceId = state.raceId;
      this.rank = 0;
      this.toastUntil = 0;
      this.stop();
    }
    const ids = new Set(state.players.map((player) => player.id));
    for (const [id, racer] of this.racers) {
      if (!ids.has(id)) {
        racer.marker.remove();
        racer.edge.remove();
        racer.dot.remove();
        racer.standing.remove();
        this.racers.delete(id);
      }
    }
    this.viewport.style.setProperty("--lane-count", String(Math.max(2, state.players.length)));
    const laneHeight = state.players.length > 4 ? 50 : 64;
    this.viewport.style.setProperty("--lane-height", `${laneHeight}px`);
    this.viewport.dataset.field = state.players.length > 4 ? "full" : "small";
    const ranks = rankPlayers(state.players);
    const rank = ranks.findIndex((player) => player.id === ownId) + 1;
    if (this.rank && rank < this.rank && state.phase === "racing" && this.ownCharacters > 0) {
      text(this.toast, `Up to #${rank} ↗`);
      this.toastUntil = this.now + 1000;
    }
    this.rank = rank;
    state.players.forEach((player, index) => {
      let racer = this.racers.get(player.id);
      const own = player.id === ownId;
      const target = progressMeters(
        own && state.phase !== "finished" ? localCharacters : player.progress,
        state.passage.length,
      );
      if (!racer) {
        const marker = document.createElement("div");
        marker.className = "racer-marker";
        marker.innerHTML = `<span class="speed-streak"></span><div class="race-car"><img class="car-sprite" src="${CAR_SPRITE}" alt="" width="1774" height="887" draggable="false"/><span class="wheel wheel-rear"></span><span class="wheel wheel-front"></span><span class="rear-light"></span><span class="headlight-beam"></span></div><span class="car-tag"></span>`;
        const label = find(marker, ".car-tag");
        const edge = document.createElement("div");
        edge.className = "edge-racer";
        const dot = document.createElement("span");
        dot.className = "mini-dot";
        const standing = document.createElement("li");
        standing.className = "standing";
        this.lanes.append(marker);
        this.edges.append(edge);
        this.dots.append(dot);
        this.standings.append(standing);
        racer = {
          marker,
          label,
          edge,
          dot,
          standing,
          current: target,
          target,
          connected: player.connected,
        };
        this.racers.set(player.id, racer);
      }
      if (newRace || firstState || this.reduced || !player.connected || !this.connected)
        racer.current = target;
      racer.target = target;
      racer.connected = player.connected;
      for (const item of [racer.marker, racer.edge, racer.dot, racer.standing]) {
        item.style.setProperty("--car-color", COLORS[index % COLORS.length] ?? "#ffc94a");
        item.style.setProperty(
          "--paint-hue",
          `${[0, 115, 325, 175, 220, 50, 275, 145][index % COLORS.length] ?? 0}deg`,
        );
        item.dataset.own = String(own);
        item.dataset.connected = String(player.connected);
        item.dataset.winner = String(player.id === state.winnerId);
      }
      racer.marker.dataset.error = String(own && mistake && state.phase === "racing");
      racer.dot.style.top = `${((index + 0.5) / Math.max(2, state.players.length)) * 100}%`;
      text(racer.label, `${own ? "YOU · " : ""}${player.name}`);
      const status = !player.connected
        ? "Offline"
        : state.winnerId === player.id
          ? "Winner"
          : state.phase === "lobby"
            ? player.ready
              ? "Ready"
              : "Not ready"
            : "";
      const place = ranks.findIndex((item) => item.id === player.id) + 1;
      text(
        racer.standing,
        `${place}. ${player.name}${own ? " (you)" : ""} · ${Math.round(progressMeters(player.progress, state.passage.length))} m${status ? ` · ${status}` : ""}`,
      );
      racer.standing.style.order = String(place);
      racer.dot.title = racer.standing.textContent ?? player.name;
    });
    this.positionRows();
    if (state.phase === "finished") {
      const winner = state.players.find((player) => player.id === state.winnerId);
      text(
        this.verdict,
        winner
          ? winner.id === ownId
            ? "You take the flag!"
            : `${winner.name} takes the flag!`
          : "Time's up. Another lap?",
      );
    }
    this.draw();
    if (this.reduced || !this.connected) this.settle();
    else if ([...this.racers.values()].some((racer) => racer.current !== racer.target))
      this.requestFrame();
  }

  private draw(): void {
    const own = this.racers.get(this.ownId);
    const focus = own?.current ?? 0;
    const view = cameraWindow(focus);
    const radar = radarWindow(focus);
    this.viewport.dataset.cameraStart = view.start.toFixed(3);
    this.viewport.dataset.cameraEnd = view.end.toFixed(3);
    this.viewport.style.setProperty(
      "--road-offset",
      `${(-view.start * this.width) / VIEW_SPAN_METERS}px`,
    );
    this.world.style.transform = `translate3d(${(-view.start * this.width) / VIEW_SPAN_METERS}px, 0, 0)`;
    this.window.style.left = `${radar.left * 100}%`;
    this.window.style.width = `${radar.width * 100}%`;
    text(this.range, `${Math.round(view.start)}–${Math.round(view.end)} m`);
    for (const [id, racer] of this.racers) {
      const position = cameraPosition(racer.current, focus);
      racer.marker.style.transform = `translate3d(${position * this.width}px, 0, 0)`;
      racer.marker.hidden = position < 0 || position > 1;
      racer.marker.dataset.distance = racer.current.toFixed(3);
      racer.marker.dataset.targetDistance = racer.target.toFixed(3);
      racer.dot.style.left = `${(racer.current / TRACK_METERS) * 100}%`;
      racer.edge.hidden = id === this.ownId || (position >= 0 && position <= 1);
      racer.edge.dataset.direction = position > 1 ? "ahead" : "behind";
      text(
        racer.edge,
        `${position > 1 ? "" : "← "}${racer.label.textContent ?? ""} · ${Math.round(Math.abs(racer.current - focus))} m${position > 1 ? " →" : ""}`,
      );
      if (racer.current === racer.target) racer.marker.dataset.moving = "false";
    }
  }

  tick(now: number, connected: boolean, clockReady: boolean): void {
    this.now = now;
    if (this.connected && !connected) this.settle();
    this.connected = connected;
    this.clockReady = clockReady;
    const state = this.state;
    if (!state) return;
    const elapsed =
      state.startAt === null
        ? 0
        : Math.max(0, (state.finishAt ?? Math.min(now, state.deadline ?? now)) - state.startAt);
    text(this.elapsed, elapsedLabel(elapsed));
    const wpm = elapsed >= 1000 ? Math.round(this.ownCharacters / 5 / (elapsed / 60000)) : 0;
    text(this.wpm, String(Math.min(999, wpm)));
    const countdown = state.startAt === null ? 0 : Math.ceil((state.startAt - now) / 1000);
    const go = state.startAt !== null && now >= state.startAt && now < state.startAt + 1100;
    const showSignal =
      state.phase !== "finished" &&
      (state.phase === "lobby" || countdown > 0 || go || !connected || !this.clockReady);
    this.signal.dataset.visible = String(showSignal);
    this.signal.dataset.light =
      !connected || !this.clockReady || state.phase === "lobby" || countdown > 2
        ? "red"
        : countdown > 0
          ? "amber"
          : "green";
    text(
      this.signalText,
      !connected
        ? "Reconnecting…"
        : !this.clockReady
          ? "Syncing the grid…"
          : state.phase === "lobby"
            ? "Ready when you are"
            : countdown > 0
              ? `On your marks · ${countdown}`
              : "GO!",
    );
    this.toast.dataset.visible = String(
      state.phase === "racing" && connected && now < this.toastUntil,
    );
  }

  destroy(): void {
    this.stop();
    this.resize.disconnect();
    this.motionButton.removeEventListener("click", this.toggleMotion);
    this.preference.removeEventListener("change", this.changePreference);
    document.removeEventListener("visibilitychange", this.changeVisibility);
  }
}
