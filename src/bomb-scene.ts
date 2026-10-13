import type { Snapshot } from "../shared/protocol";
import { BombAudio } from "./bomb-audio";

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
  private readonly flowPaths = svg("g", {});
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
  private readonly flows = new Map<number, SVGPathElement>();
  private readonly connections = new Map<number, number>();
  private readonly plugs = new Map<number, HTMLButtonElement>();
  private state: Snapshot | undefined;
  private ownId = "";
  private round: string | null = null;
  private pending: number | null = null;
  private pendingUntil = 0;
  private feedback: string | null = null;
  private reduced = false;
  private sound = false;
  private soundRevision = 0;
  private readonly audio = new BombAudio();
  private readonly soundHelp = node("p", "bomb-sound-help");
  private effectNow = 0;
  private effectMeasuredAt = performance.now();
  private countdownBeatUntil = 0;
  private countdownKey = "";
  private connected = false;
  private arenaWidth = 1000;
  private arenaHeight = 560;
  private referenceHeight = 560;
  private readonly resize: ResizeObserver;

  constructor(
    private readonly root: HTMLElement,
    private readonly choose: (id: number) => boolean,
  ) {
    root.dataset.active = root.dataset.online = "false";
    const header = node("div", "bomb-heading");
    const heading = node("div", "");
    heading.append(node("p", "bomb-eyebrow", "THE STANDUP SWITCHBOARD"), this.title);
    const controls = node("div", "bomb-controls");
    this.motionButton.type = this.soundButton.type = "button";
    this.motionButton.addEventListener("click", this.toggleMotion);
    this.soundButton.addEventListener("click", this.toggleSound);
    this.renderSoundButton();
    controls.append(this.motionButton, this.soundButton, this.timer);
    header.append(heading, controls);
    this.status.setAttribute("role", "status");
    this.announcement.setAttribute("role", "status");
    this.choices.setAttribute("role", "group");
    this.choices.setAttribute("aria-label", "Choose your cable");
    const body = svg("g", { class: "bomb-body" });
    // Animate around the socket inside the layout transform, keeping wire endpoints stable.
    const core = svg("g", { class: "bomb-core" });
    core.append(
      svg("image", {
        href: `${import.meta.env.BASE_URL}art/bomb/bomb-v2.webp`,
        x: "335",
        y: "100",
        width: "330",
        height: "330",
        class: "bomb-art",
      }),
      svg("circle", {
        cx: "582",
        cy: "133",
        r: "7",
        fill: "#fff0a5",
        class: "bomb-spark",
      }),
    );
    const embers = svg("g", { class: "bomb-embers" });
    for (let index = 0; index < 5; index++) {
      const ember = svg("circle", { cx: "582", cy: "133", r: "2", fill: "#ffd166" });
      ember.style.setProperty("--drift", `${(index - 2) * 7}px`);
      ember.style.animationDelay = `${index * -0.24}s`;
      embers.append(ember);
    }
    const display = svg("text", {
      x: "500",
      y: "286",
      "text-anchor": "middle",
      fill: "#ffd166",
      class: "bomb-digital",
    });
    display.textContent = "? ? ?";
    core.append(embers, display);
    body.append(core);
    this.wiring.append(body, this.paths, this.flowPaths);
    this.wiring.setAttribute("preserveAspectRatio", "none");
    const boom = node("div", "bomb-boom");
    boom.setAttribute("aria-hidden", "true");
    const burst = node("img", "bomb-burst");
    burst.src = `${import.meta.env.BASE_URL}art/bomb/boom-v2.webp`;
    burst.alt = "";
    burst.width = burst.height = 1280;
    boom.append(burst, node("strong", "bomb-boom-label", "BOOM!"));
    const aura = node("div", "bomb-aura");
    const shockwave = node("div", "bomb-shockwave");
    const particles = node("div", "bomb-particles");
    for (const effect of [aura, shockwave, particles]) effect.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 10; index++) {
      const spark = node("i", "bomb-particle");
      spark.style.setProperty("--angle", `${index * 36}deg`);
      spark.style.setProperty("--delay", `${(index % 3) * 35}ms`);
      particles.append(spark);
    }
    this.arena.append(aura, this.wiring, shockwave, particles, boom, this.players);
    this.soundHelp.hidden = true;
    this.soundHelp.setAttribute("role", "status");
    const footer = node(
      "p",
      "bomb-fairness",
      "Every person has the same chance. Your color and selection order make no difference.",
    );
    root.append(
      header,
      this.status,
      this.soundHelp,
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
    if (document.hidden) this.audio.pause();
  };
  private refreshEffects(now: number): void {
    this.effectNow = now;
    this.effectMeasuredAt = performance.now();
    for (const cable of this.state?.bomb?.cables ?? []) {
      const path = this.wires.get(cable.id);
      const freshCut = cable.cutAt !== null && now >= cable.cutAt && now - cable.cutAt < 900;
      const freshConnection = cable.cutAt === null && now < (this.connections.get(cable.id) ?? 0);
      if (path) path.dataset.fresh = String(freshCut);
      const flow = this.flows.get(cable.id);
      if (flow) flow.dataset.fresh = String(freshConnection);
      const card = cable.playerId ? this.cards.get(cable.playerId)?.card : undefined;
      if (card) {
        card.dataset.freshSafe = String(freshCut);
        card.dataset.freshConnected = String(freshConnection);
      }
      if (!freshConnection) this.connections.delete(cable.id);
    }
    this.timer.dataset.beat = String(
      this.state?.phase === "countdown" && now < this.countdownBeatUntil,
    );
    const finishAt = this.state?.finishAt;
    this.root.dataset.overdue = String(
      this.state?.phase !== "finished" &&
        this.state?.deadline != null &&
        now >= this.state.deadline,
    );
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
    const revision = ++this.soundRevision;
    const requested = !this.sound;
    this.sound = requested;
    this.renderSoundButton();
    this.soundHelp.hidden = true;
    void this.audio.setEnabled(requested).then((enabled) => {
      if (revision !== this.soundRevision) return;
      this.sound = enabled;
      this.renderSoundButton();
      if (requested && !enabled) {
        this.soundHelp.textContent =
          "Sound could not start. Try again or check your browser's audio settings.";
        this.soundHelp.hidden = false;
      }
    });
  };
  private renderSoundButton(): void {
    this.soundButton.textContent = this.sound ? "Sound on" : "Sound off";
    this.soundButton.setAttribute("aria-pressed", String(this.sound));
    this.soundButton.setAttribute(
      "aria-label",
      this.sound ? "Turn suspense sound off" : "Turn suspense sound on",
    );
  }

  setActive(active: boolean): void {
    this.root.dataset.active = String(active);
    this.audio.setActive(active);
  }

  pauseSound(): void {
    this.audio.pause();
  }

  reject(message: string): void {
    this.pending = null;
    if (this.state?.phase === "selecting") this.feedback = message;
  }

  update(state: Snapshot, ownId: string, now: number): void {
    const previous = this.state;
    this.state = state;
    this.ownId = ownId;
    this.root.dataset.phase = state.phase;
    const remaining =
      state.bomb?.cables.filter((cable) => cable.cutAt === null).length ?? state.players.length;
    const pulse =
      state.phase === "finale"
        ? 650
        : 650 + 950 * (remaining / Math.max(1, state.bomb?.cables.length ?? state.players.length));
    this.root.style.setProperty("--pulse-time", `${Math.round(pulse)}ms`);
    if (this.round !== state.raceId) {
      this.round = state.raceId;
      this.pending = null;
      this.feedback = null;
      this.connections.clear();
      this.countdownKey = "";
      this.countdownBeatUntil = 0;
    }
    const height = Math.max(560, Math.ceil(state.players.length / 2) * 59 + 100);
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
        this.flows.get(id)?.remove();
        this.flows.delete(id);
        this.connections.delete(id);
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
        const flow = svg("path", {
          class: "bomb-wire-flow",
          fill: "none",
          stroke: "#fff5bf",
          "stroke-width": "3",
          "stroke-linecap": "round",
          pathLength: "100",
        });
        this.flowPaths.append(flow);
        this.flows.set(cable.id, flow);
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
      path.dataset.state = cable.cutAt !== null ? "cut" : cable.playerId ? "connected" : "tangled";
      if (
        this.connected &&
        !document.hidden &&
        !this.root.hidden &&
        previous?.raceId === state.raceId &&
        cable.playerId !== null &&
        previous?.bomb?.cables.find((item) => item.id === cable.id)?.playerId === null
      )
        this.connections.set(cable.id, now + 1500);
    }
    this.positionWires();
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
    this.positionWires();
  }

  private positionWires(): void {
    const state = this.state;
    if (!state) return;
    const height = this.referenceHeight;
    const center = height / 2;
    const size = this.arenaWidth < 600 ? 1.4 : 1;
    const scaleY = (this.arenaWidth * height) / (1000 * this.arenaHeight);
    for (const cable of state.bomb?.cables ?? []) {
      const path = this.wires.get(cable.id);
      if (!path) continue;
      const startX = 500 + (-14 + (cable.id % 7) * 4) * size;
      const startY = center + 70 * scaleY * size;
      const playerIndex = state.players.findIndex((player) => player.id === cable.playerId);
      if (playerIndex < 0) {
        const offset = ((cable.id * 17) % 38) - 19;
        const lower = center + 90 * scaleY * size;
        path.setAttribute(
          "d",
          `M${startX} ${startY} C${475 + offset} ${lower} ${525 - offset} ${lower} ${500 + offset} ${center + 68 * scaleY * size}`,
        );
      } else {
        const left = playerIndex % 2 === 0;
        const sideCount = Math.ceil((state.players.length - (left ? 0 : 1)) / 2);
        const y = 65 + ((Math.floor(playerIndex / 2) + 0.5) / sideCount) * (height - 130);
        const mobile = this.arenaWidth < 600;
        path.setAttribute(
          "d",
          `M${startX} ${startY} C${left ? 360 : 640} ${center + 115 * scaleY * size} ${left ? 325 : 675} ${y} ${left ? (mobile ? 280 : 237) : mobile ? 720 : 763} ${y}`,
        );
      }
      this.flows.get(cable.id)?.setAttribute("d", path.getAttribute("d")!);
    }
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
    this.root.dataset.online = String(this.connected);
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
    const countdownKey = `${state.raceId}:${state.phase}:${seconds}`;
    if (countdownKey !== this.countdownKey) {
      this.countdownKey = countdownKey;
      if (state.phase === "countdown" && seconds > 0 && this.connected && !document.hidden)
        this.countdownBeatUntil = now + 500;
    }
    this.refreshEffects(now);
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
    this.audio.update(state, now, this.connected && !this.root.hidden);
  }

  destroy(): void {
    ++this.soundRevision;
    this.setActive(false);
    this.resize.disconnect();
    this.motionButton.removeEventListener("click", this.toggleMotion);
    this.soundButton.removeEventListener("click", this.toggleSound);
    this.preference.removeEventListener("change", this.changePreference);
    document.removeEventListener("visibilitychange", this.changeVisibility);
    this.audio.destroy();
  }
}
