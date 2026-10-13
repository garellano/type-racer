import type { Snapshot } from "../shared/protocol";

const SVG_NS = "http://www.w3.org/2000/svg";
const COLORS = [
  "#ff727f",
  "#6dcfff",
  "#ffd166",
  "#74e7b9",
  "#c59bff",
  "#ffa66e",
  "#ff97d6",
  "#92e5ec",
];
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = "",
): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag);
  item.className = className;
  item.textContent = text;
  return item;
}
function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const item = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, value);
  return item;
}
function setText(item: HTMLElement, value: string): void {
  if (item.textContent !== value) item.textContent = value;
}

export class BombScene {
  private readonly title = node("h2", "bomb-title");
  private readonly status = node("p", "bomb-status");
  private readonly timer = node("strong", "bomb-timer", "LOBBY");
  private readonly arena = node("div", "bomb-arena");
  private readonly wiring = svg("svg", { class: "bomb-wiring", "aria-hidden": "true" });
  private readonly paths = svg("g", {});
  private readonly players = node("div", "bomb-players");
  private readonly choices = node("div", "bomb-choices");
  private readonly choiceHelp = node("p", "bomb-choice-help");
  private readonly announcement = node("p", "bomb-announcement");
  private readonly motionButton = node("button", "bomb-motion", "Reduce motion");
  private readonly soundButton = node("button", "bomb-motion", "Sound off");
  private readonly preference = matchMedia("(prefers-reduced-motion: reduce)");
  private readonly cards = new Map<
    string,
    { card: HTMLElement; name: HTMLElement; badge: HTMLElement }
  >();
  private readonly wires = new Map<number, SVGPathElement>();
  private readonly plugs = new Map<number, HTMLButtonElement>();
  private state: Snapshot | undefined;
  private ownId = "";
  private round: string | null = null;
  private pending: number | null = null;
  private pendingUntil = 0;
  private feedback: string | null = null;
  private reduced = false;
  private sound = false;
  private audio: AudioContext | undefined;
  private lastSound = "";
  private lastSecond = "";
  private effectNow = 0;
  private effectMeasuredAt = performance.now();
  private connected = false;
  private arenaWidth = 1000;
  private arenaHeight = 560;
  private referenceHeight = 560;
  private readonly resize: ResizeObserver;

  constructor(
    private readonly root: HTMLElement,
    private readonly choose: (id: number) => boolean,
  ) {
    const header = node("div", "bomb-heading");
    const heading = node("div", "");
    heading.append(node("p", "bomb-eyebrow", "THE STANDUP SWITCHBOARD"), this.title);
    const controls = node("div", "bomb-controls");
    this.motionButton.type = this.soundButton.type = "button";
    this.motionButton.addEventListener("click", this.toggleMotion);
    this.soundButton.addEventListener("click", this.toggleSound);
    this.soundButton.setAttribute("aria-pressed", "false");
    controls.append(this.motionButton, this.soundButton, this.timer);
    header.append(heading, controls);
    this.status.setAttribute("role", "status");
    this.announcement.setAttribute("role", "status");
    this.choices.setAttribute("role", "group");
    this.choices.setAttribute("aria-label", "Choose your cable");
    const body = svg("g", { class: "bomb-body" });
    // Original vector artwork, authored for this game. No external images or references.
    body.append(
      svg("ellipse", { cx: "500", cy: "350", rx: "114", ry: "25", fill: "#000", opacity: ".3" }),
      svg("path", {
        d: "M490 210 Q470 150 535 156 Q570 156 560 130",
        fill: "none",
        stroke: "#f7d38a",
        "stroke-width": "9",
        "stroke-linecap": "round",
      }),
      svg("circle", { cx: "560", cy: "126", r: "10", fill: "#ffd166", class: "bomb-spark" }),
      svg("rect", {
        x: "477",
        y: "198",
        width: "46",
        height: "30",
        rx: "8",
        fill: "#758594",
        transform: "rotate(-8 500 215)",
      }),
      svg("circle", {
        cx: "500",
        cy: "280",
        r: "96",
        fill: "#263646",
        stroke: "#8193a0",
        "stroke-width": "3",
      }),
      svg("path", {
        d: "M434 252 Q447 217 480 216",
        fill: "none",
        stroke: "#b3c2ce",
        "stroke-width": "9",
        "stroke-linecap": "round",
        opacity: ".35",
      }),
      svg("rect", {
        x: "448",
        y: "247",
        width: "104",
        height: "47",
        rx: "9",
        fill: "#0d1725",
        stroke: "#627284",
        "stroke-width": "2",
      }),
    );
    const display = svg("text", {
      x: "500",
      y: "280",
      "text-anchor": "middle",
      fill: "#ffd166",
      class: "bomb-digital",
    });
    display.textContent = "? ? ?";
    body.append(
      display,
      svg("rect", {
        x: "458",
        y: "307",
        width: "84",
        height: "37",
        rx: "8",
        fill: "#101d2a",
        stroke: "#6d7b8a",
        "stroke-width": "2",
      }),
    );
    this.wiring.append(body, this.paths);
    this.wiring.setAttribute("preserveAspectRatio", "none");
    const boom = node("div", "bomb-boom", "BOOM!");
    boom.setAttribute("aria-hidden", "true");
    const smoke = node("div", "bomb-smoke");
    smoke.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 8; index++) {
      const puff = node("i", "");
      puff.style.setProperty("--i", String(index));
      smoke.append(puff);
    }
    this.arena.append(this.wiring, this.players, smoke, boom);
    const footer = node(
      "p",
      "bomb-fairness",
      "Every person has the same chance. Your color and selection order make no difference.",
    );
    root.append(
      header,
      this.status,
      this.arena,
      this.announcement,
      this.choiceHelp,
      this.choices,
      footer,
    );
    this.resize = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width <= 0) return;
      this.arenaWidth = entry.contentRect.width;
      this.arenaHeight = entry.contentRect.height;
      this.positionBomb();
    });
    this.resize.observe(this.arena);
    this.preference.addEventListener("change", this.changePreference);
    document.addEventListener("visibilitychange", this.changeVisibility);
    this.setReduced(this.preference.matches);
    this.changeVisibility();
  }

  private readonly toggleMotion = () => this.setReduced(!this.reduced);
  private readonly changePreference = () => this.setReduced(this.preference.matches);
  private readonly changeVisibility = () => {
    // Clear expired effects before resuming CSS animations after a hidden interval.
    this.refreshEffects(this.effectNow + performance.now() - this.effectMeasuredAt);
    this.root.dataset.hidden = String(document.hidden);
  };
  private refreshEffects(now: number): void {
    this.effectNow = now;
    this.effectMeasuredAt = performance.now();
    for (const cable of this.state?.bomb?.cables ?? []) {
      const path = this.wires.get(cable.id);
      if (path)
        path.dataset.fresh = String(
          cable.cutAt !== null && now >= cable.cutAt && now - cable.cutAt < 900,
        );
    }
    const finishAt = this.state?.finishAt;
    this.root.dataset.freshFinish = String(
      this.state?.phase === "finished" &&
        finishAt != null &&
        now >= finishAt &&
        now - finishAt < 1800,
    );
  }
  private setReduced(value: boolean): void {
    this.reduced = value;
    this.root.dataset.reduced = String(value);
    this.motionButton.setAttribute("aria-pressed", String(value));
  }
  private readonly toggleSound = () => {
    this.sound = !this.sound;
    if (this.sound) {
      this.audio ??= new AudioContext();
      void this.audio.resume().catch(() => {
        this.sound = false;
      });
    }
    this.soundButton.textContent = this.sound ? "Sound on" : "Sound off";
    this.soundButton.setAttribute("aria-pressed", String(this.sound));
  };
  private tone(frequency: number, duration = 0.08): void {
    if (!this.sound || !this.audio || document.hidden || !this.connected) return;
    const oscillator = this.audio.createOscillator();
    const gain = this.audio.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.04, this.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + duration);
    oscillator.connect(gain).connect(this.audio.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start();
    oscillator.stop(this.audio.currentTime + duration);
  }

  reject(message: string): void {
    this.pending = null;
    if (this.state?.phase === "selecting") this.feedback = message;
  }

  update(state: Snapshot, ownId: string, now: number): void {
    this.state = state;
    this.ownId = ownId;
    this.root.dataset.phase = state.phase;
    const remaining =
      state.bomb?.cables.filter((cable) => cable.cutAt === null).length ?? state.players.length;
    this.root.style.setProperty("--pulse-time", `${Math.max(500, remaining * 100)}ms`);
    if (this.round !== state.raceId) {
      this.round = state.raceId;
      this.pending = null;
      this.lastSound = "";
      this.feedback = null;
    }
    const height = Math.max(560, Math.ceil(state.players.length / 2) * 59 + 100);
    const center = height / 2;
    this.arena.style.setProperty("--arena-ratio", `1000 / ${height}`);
    this.wiring.setAttribute("viewBox", `0 0 1000 ${height}`);
    this.referenceHeight = height;
    this.arena.style.setProperty(
      "--mobile-height",
      `${Math.max(570, Math.ceil(state.players.length / 2) * 60 + 120)}px`,
    );
    this.positionBomb();
    for (const [id, item] of this.cards) {
      if (!state.players.some((player) => player.id === id)) {
        item.card.remove();
        this.cards.delete(id);
      }
    }
    for (const [index, player] of state.players.entries()) {
      let visual = this.cards.get(player.id);
      if (!visual) {
        const card = node("div", "bomb-player");
        const avatar = node("span", "bomb-avatar", player.name.slice(0, 1).toUpperCase());
        const name = node("strong", "bomb-player-name");
        const badge = node("span", "bomb-player-badge");
        card.append(avatar, name, badge);
        this.players.append(card);
        visual = { card, name, badge };
        this.cards.set(player.id, visual);
      }
      const left = index % 2 === 0;
      const sideCount = Math.ceil((state.players.length - (left ? 0 : 1)) / 2);
      const y = 65 + ((Math.floor(index / 2) + 0.5) / sideCount) * (height - 130);
      visual.card.style.top = `${(y / height) * 100}%`;
      visual.card.style.left = left ? "2%" : "76%";
      visual.card.dataset.own = String(player.id === ownId);
      const cable = state.bomb?.cables.find((item) => item.playerId === player.id);
      const starter = state.phase === "finished" && state.standupStarterId === player.id;
      visual.card.dataset.state = starter
        ? "starter"
        : cable?.cutAt !== null && cable
          ? "safe"
          : cable
            ? "connected"
            : "waiting";
      visual.card.style.setProperty(
        "--wire",
        cable ? COLORS[cable.id % COLORS.length]! : "#718090",
      );
      visual.name.textContent = `${player.name}${player.id === ownId ? " · you" : ""}`;
      visual.name.title = player.name;
      setText(
        visual.badge,
        starter
          ? "🎤 Opens standup"
          : cable?.cutAt !== null && cable
            ? "✓ Safe!"
            : cable
              ? `Wire ${cable.id + 1}${player.connected ? " · connected" : " · offline"}`
              : player.connected
                ? "Choosing a wire…"
                : "Offline · auto-pick",
      );
    }
    const cables = state.bomb?.cables ?? [];
    for (const [id, path] of this.wires)
      if (!cables.some((cable) => cable.id === id)) {
        path.remove();
        this.wires.delete(id);
        this.plugs.get(id)?.remove();
        this.plugs.delete(id);
      }
    for (const cable of cables) {
      let path = this.wires.get(cable.id);
      if (!path) {
        path = svg("path", {
          class: "bomb-wire",
          fill: "none",
          "stroke-width": "5",
          "stroke-linecap": "round",
          pathLength: "100",
        });
        this.paths.append(path);
        this.wires.set(cable.id, path);
        const plug = node("button", "bomb-plug");
        plug.type = "button";
        plug.style.setProperty("--wire", COLORS[cable.id % COLORS.length]!);
        plug.addEventListener("click", () => {
          if (this.pending !== null) return;
          this.feedback = null;
          this.pending = cable.id;
          this.pendingUntil = Date.now() + 3000;
          if (!this.choose(cable.id)) this.pending = null;
          else setText(this.choiceHelp, "Connecting your wire…");
          this.refreshChoices();
        });
        this.choices.append(plug);
        this.plugs.set(cable.id, plug);
      }
      path.setAttribute("stroke", COLORS[cable.id % COLORS.length]!);
      const startX = 473 + (cable.id % 7) * 9;
      const startY = center + 49;
      const playerIndex = state.players.findIndex((player) => player.id === cable.playerId);
      if (playerIndex < 0) {
        const offset = ((cable.id * 17) % 65) - 32;
        path.setAttribute(
          "d",
          `M${startX} ${startY} C${440 + offset} ${center + 110} ${565 - offset} ${center + 125} ${490 + offset} ${center + 67}`,
        );
      } else {
        const left = playerIndex % 2 === 0;
        const sideCount = Math.ceil((state.players.length - (left ? 0 : 1)) / 2);
        const y = 65 + ((Math.floor(playerIndex / 2) + 0.5) / sideCount) * (height - 130);
        path.setAttribute(
          "d",
          `M${startX} ${startY} C${left ? 360 : 640} ${center + 115} ${left ? 325 : 675} ${y} ${left ? 237 : 763} ${y}`,
        );
      }
      path.dataset.state = cable.cutAt !== null ? "cut" : cable.playerId ? "connected" : "tangled";
    }
    const cuts = cables.filter((cable) => cable.cutAt !== null).sort((a, b) => a.cutAt! - b.cutAt!);
    const last = cuts.at(-1);
    const saved = state.players.find((player) => player.id === last?.playerId);
    const starter = state.players.find((player) => player.id === state.standupStarterId);
    setText(this.title, state.phase === "finished" ? "The mic is yours." : "Defuse the bomb");
    setText(
      this.status,
      state.phase === "lobby"
        ? `${state.players.length} teammates on the switchboard. The host starts when the team is here.`
        : state.phase === "selecting"
          ? "Pick a wire. Watch it connect to your name."
          : state.phase === "countdown"
            ? "All wires connected. Take a breath…"
            : state.phase === "finale"
              ? "One wire left. One shared breath…"
              : state.phase === "finished"
                ? `${starter?.name ?? "Your teammate"}, kick off today's standup. We're ready to listen.`
                : `${cables.length - cuts.length} wires still connected. Who's safe next?`,
    );
    setText(
      this.announcement,
      state.phase === "finished"
        ? `🎤 ${starter?.name ?? "Your teammate"} opens standup today`
        : saved
          ? `✓ ${saved.name} is safe!`
          : "One wire per person. One shared result.",
    );
    this.refreshEffects(now);
    if (last && now - last.cutAt! < 900 && this.lastSound !== `${state.raceId}:${last.id}`) {
      this.lastSound = `${state.raceId}:${last.id}`;
      this.tone(660, 0.13);
    }
    this.refreshChoices();
  }

  private positionBomb(): void {
    const scaleY = (this.arenaWidth * this.referenceHeight) / (1000 * this.arenaHeight);
    const size = this.arenaWidth < 600 ? 1.4 : 1;
    this.wiring
      .querySelector(".bomb-body")
      ?.setAttribute(
        "transform",
        `translate(500 ${this.referenceHeight / 2}) scale(${size} ${scaleY * size}) translate(-500 -280)`,
      );
  }

  private refreshChoices(): void {
    const state = this.state;
    if (!state) return;
    const own = state.bomb?.cables.find((cable) => cable.playerId === this.ownId);
    if (own || Date.now() > this.pendingUntil) this.pending = null;
    if (own) this.feedback = null;
    this.choiceHelp.hidden = this.choices.hidden = state.phase !== "selecting";
    if (this.pending === null)
      setText(
        this.choiceHelp,
        this.feedback ??
          (own
            ? `Wire ${own.id + 1} is yours. Waiting for the team…`
            : "Choose any numbered plug below. Unclaimed wires are assigned when time runs out."),
      );
    for (const cable of state.bomb?.cables ?? []) {
      const plug = this.plugs.get(cable.id)!;
      const owner = state.players.find((player) => player.id === cable.playerId);
      plug.disabled =
        !this.connected ||
        state.phase !== "selecting" ||
        !!own ||
        cable.playerId !== null ||
        this.pending !== null;
      plug.dataset.claimed = String(cable.playerId !== null);
      plug.setAttribute(
        "aria-label",
        `Wire ${cable.id + 1}${owner ? `, claimed by ${owner.name}` : ", available"}`,
      );
      setText(plug, `${cable.id + 1}${owner ? " ✓" : ""}`);
    }
  }

  tick(now: number, connected: boolean, clockReady: boolean): void {
    this.connected = connected && clockReady;
    this.root.dataset.online = String(connected);
    this.refreshEffects(now);
    this.refreshChoices();
    const state = this.state;
    if (!state) return;
    const target =
      state.phase === "selecting"
        ? state.bomb?.selectionEndsAt
        : state.phase === "countdown"
          ? state.startAt
          : state.phase === "finale"
            ? state.deadline
            : state.bomb?.nextCutAt;
    const seconds = target == null ? 0 : Math.max(0, Math.ceil((target - now) / 1000));
    const label = !connected
      ? "RECONNECTING"
      : state.phase === "lobby"
        ? "LOBBY"
        : state.phase === "finished"
          ? "BOOM!"
          : !clockReady
            ? "SYNCING"
            : state.phase === "countdown"
              ? String(seconds)
              : `${seconds}s`;
    setText(this.timer, label);
    const display = this.wiring.querySelector(".bomb-digital");
    if (display)
      display.textContent =
        state.phase === "finished"
          ? "BOOM"
          : state.phase === "lobby"
            ? "? ? ?"
            : !this.connected
              ? "…"
              : String(seconds).padStart(2, "0");
    const secondKey = `${state.raceId}:${state.phase}:${seconds}`;
    if (secondKey !== this.lastSecond) {
      this.lastSecond = secondKey;
      if (state.phase === "countdown" && seconds > 0) this.tone(350);
    }
  }

  destroy(): void {
    this.resize.disconnect();
    this.motionButton.removeEventListener("click", this.toggleMotion);
    this.soundButton.removeEventListener("click", this.toggleSound);
    this.preference.removeEventListener("change", this.changePreference);
    document.removeEventListener("visibilitychange", this.changeVisibility);
    void this.audio?.close();
  }
}
