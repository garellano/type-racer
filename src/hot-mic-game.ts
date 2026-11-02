import "./hot-mic-game.css";
import { z } from "zod";
import { CHARACTER_IDS, CHARACTERS, type CharacterId } from "../shared/characters";
import { DERBY_TEAM, type DerbyParticipant } from "../shared/derby";
import {
  HOT_MIC_ROUND_MS,
  createHotMicRound,
  hotMicExpired,
  hotMicRosterSchema,
  hotMicRoundSchema,
  hotMicSample,
  type HotMicRound,
} from "../shared/hot-mic";
import { HotMicAudio } from "./hot-mic-audio";

const SETUP_KEY = "type-racer:hot-mic:setup:v1";
const ROUND_KEY = "type-racer:hot-mic:round:v1";
const SOUND_ERROR = "Sound could not start. Use the Sound button to try again.";
const setupSchema = z.strictObject({
  version: z.literal(1),
  reducedMotion: z.boolean().nullable(),
  seats: z
    .array(
      z.strictObject({
        id: z.enum(CHARACTER_IDS),
        characterId: z.enum(CHARACTER_IDS),
        selected: z.boolean(),
      }),
    )
    .length(DERBY_TEAM.length)
    .refine((seats) => new Set(seats.map((seat) => seat.id)).size === DERBY_TEAM.length),
});

const APPEARANCES: Readonly<Record<CharacterId, { atlas: string; row: number }>> = {
  sunbeam: { atlas: "a", row: 0 },
  scout: { atlas: "a", row: 1 },
  clover: { atlas: "a", row: 2 },
  juno: { atlas: "b", row: 0 },
  ember: { atlas: "b", row: 1 },
  sol: { atlas: "b", row: 2 },
  rio: { atlas: "c", row: 0 },
  moss: { atlas: "c", row: 1 },
  orbit: { atlas: "c", row: 2 },
};

const CUES = {
  opening: "Here we go!",
  passing: "Keep it moving!",
  suspense: "Wait for it…",
  again: "Not yet…",
  final: "One last pass…",
  finished: "The mic is yours!",
} as const;

type Seat = DerbyParticipant & { selected: boolean };
type Point = { x: number; y: number };
type CircleSeat = { participant: DerbyParticipant; element: HTMLElement; point: Point };

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(text: string, className = ""): HTMLButtonElement {
  const element = node("button", className, text);
  element.type = "button";
  return element;
}

function portrait(id: CharacterId, className = ""): HTMLElement {
  const appearance = APPEARANCES[id];
  const element = node("span", `hot-mic-portrait ${className}`);
  element.style.backgroundImage = `url("${import.meta.env.BASE_URL}assets/derby/chair-${appearance.atlas}-v2.webp")`;
  element.style.backgroundPosition = `0% ${appearance.row * 50}%`;
  element.setAttribute("aria-hidden", "true");
  return element;
}

function microphone(): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const capsule = document.createElementNS(namespace, "rect");
  capsule.setAttribute("x", "9");
  capsule.setAttribute("y", "2");
  capsule.setAttribute("width", "6");
  capsule.setAttribute("height", "12");
  capsule.setAttribute("rx", "3");
  const stand = document.createElementNS(namespace, "path");
  stand.setAttribute("d", "M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8");
  svg.append(capsule, stand);
  return svg;
}

/** A host-operated, screen-shared picker. Participants do not join a room. */
export class HotMicGame {
  private readonly abort = new AbortController();
  private readonly preference = matchMedia("(prefers-reduced-motion: reduce)");
  private readonly audio = new HotMicAudio({
    applauseUrl: `${import.meta.env.BASE_URL}assets/derby/audio/office-applause-v1.mp3`,
    cheerUrl: `${import.meta.env.BASE_URL}assets/derby/audio/office-cheer-v1.mp3`,
  });
  private readonly seats: Seat[] = DERBY_TEAM.map((person) => ({
    ...person,
    id: person.characterId,
    selected: true,
  }));
  private round: HotMicRound | null = null;
  private circleSeats: CircleSeat[] = [];
  private frame: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private motionOverride: boolean | null = null;
  private active = false;
  private destroyed = false;
  private lastPhase = "";
  private lastCue = "";
  private lastHolder: string | null = null;
  private soundEnabled = false;
  private soundRequested = false;
  private soundRevision = 0;
  private readonly setup = node("details", "hot-mic-setup");
  private readonly setupFields = node("fieldset", "hot-mic-setup-fields");
  private readonly roster = node("div", "hot-mic-roster");
  private readonly count = node("span", "hot-mic-count");
  private readonly start = button("Start passing ↗", "hot-mic-start");
  private readonly motion = button("Reduce motion", "subtle hot-mic-motion");
  private readonly sound = button("Sound off", "hot-mic-sound");
  private readonly notice = node("p", "hot-mic-notice");
  private readonly scene = node("section", "hot-mic-scene");
  private readonly stage = node("div", "hot-mic-stage");
  private readonly circle = node("div", "hot-mic-circle");
  private readonly cue = node("strong", "hot-mic-cue", "Who gets the mic?");
  private readonly holderName = node("span", "hot-mic-holder-name");
  private readonly mic = node("div", "hot-mic-microphone");
  private readonly status = node("p", "hot-mic-status", "Ready when you are.");
  private readonly results = node("section", "hot-mic-results");

  constructor(
    private readonly root: HTMLElement,
    private readonly onExit: () => void,
  ) {
    this.root.classList.add("hot-mic-game");
    this.restore();
    this.build();
    document.addEventListener("visibilitychange", this.visibilityChanged, {
      signal: this.abort.signal,
    });
    this.preference.addEventListener("change", this.preferenceChanged, {
      signal: this.abort.signal,
    });
    window.addEventListener("pagehide", () => this.destroy(), { signal: this.abort.signal });
  }

  show(): void {
    if (this.destroyed) return;
    this.active = true;
    this.root.hidden = false;
    this.tick();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.active = false;
    ++this.soundRevision;
    this.soundRequested = false;
    this.soundEnabled = false;
    this.stopScheduling();
    this.audio.destroy();
    this.abort.abort();
  }

  private get reduced(): boolean {
    return this.motionOverride ?? this.preference.matches;
  }

  private get running(): boolean {
    return this.round !== null && Date.now() < this.round.finishAt;
  }

  private read(storage: Storage, key: string): unknown {
    const value = storage.getItem(key);
    return value ? (JSON.parse(value) as unknown) : null;
  }

  private restore(): void {
    try {
      const saved = setupSchema.safeParse(this.read(localStorage, SETUP_KEY));
      if (saved.success) {
        this.motionOverride = saved.data.reducedMotion;
        for (const seat of this.seats) {
          const stored = saved.data.seats.find((candidate) => candidate.id === seat.id);
          if (stored) {
            seat.selected = stored.selected;
            seat.characterId = stored.characterId;
          }
        }
      }
    } catch {
      // Unavailable storage leaves the in-memory setup usable.
    }
    try {
      const now = Date.now();
      const saved = hotMicRoundSchema.safeParse(this.read(sessionStorage, ROUND_KEY));
      if (
        saved.success &&
        !hotMicExpired(saved.data, now) &&
        saved.data.startAt <= now &&
        saved.data.participants.every((person) =>
          this.seats.some((seat) => seat.id === person.id && seat.name === person.name),
        )
      ) {
        this.round = saved.data;
      } else sessionStorage.removeItem(ROUND_KEY);
    } catch {
      // Only a validated saved draw can resume after a reload.
    }
  }

  private saveSetup(): void {
    try {
      localStorage.setItem(
        SETUP_KEY,
        JSON.stringify({
          version: 1,
          reducedMotion: this.motionOverride,
          seats: this.seats.map(({ id, characterId, selected }) => ({ id, characterId, selected })),
        }),
      );
    } catch {
      this.showNotice("Your browser could not save this team. You can still play in this tab.");
    }
  }

  private saveRound(): void {
    try {
      if (this.round) sessionStorage.setItem(ROUND_KEY, JSON.stringify(this.round));
      else sessionStorage.removeItem(ROUND_KEY);
    } catch {
      this.showNotice(
        "Your browser could not save this draw. Keep this tab open to keep its result.",
      );
    }
  }

  private build(): void {
    this.root.replaceChildren();
    const header = node("div", "hot-mic-heading");
    const title = node("div");
    title.append(
      node("p", "eyebrow", "The microphone has a mind of its own"),
      node("h1", "hot-mic-title", "Hot Mic"),
      node(
        "p",
        "hot-mic-intro",
        "Pick the team. Share your screen. Whoever gets the mic opens standup.",
      ),
    );
    const back = button("← Back to games", "subtle hot-mic-back");
    back.addEventListener(
      "click",
      () => {
        this.destroy();
        this.onExit();
      },
      { signal: this.abort.signal },
    );
    header.append(title, back);

    this.setup.open = !this.running;
    const summary = node("summary", "hot-mic-setup-summary");
    summary.append(node("span", "hot-mic-setup-title", "Today's circle"), this.count);
    this.setupFields.append(
      node("legend", "hot-mic-sr-only", "Choose today's attendees and characters"),
      this.roster,
    );
    this.setup.append(summary, this.setupFields);
    this.renderRoster();

    const toolbar = node("div", "hot-mic-toolbar");
    toolbar.append(
      node(
        "span",
        "hot-mic-duration",
        `${HOT_MIC_ROUND_MS / 1000} seconds · everyone has the same chance`,
      ),
      this.motion,
      this.start,
    );
    this.start.addEventListener("click", () => this.startRound(), { signal: this.abort.signal });
    this.motion.addEventListener(
      "click",
      () => {
        this.motionOverride = !this.reduced;
        this.saveSetup();
        this.updateControls();
        this.tick();
      },
      { signal: this.abort.signal },
    );
    this.sound.addEventListener("click", () => void this.toggleSound(), {
      signal: this.abort.signal,
    });

    this.scene.setAttribute("aria-label", "Hot Mic meeting room");
    const sceneHeader = node("div", "hot-mic-scene-header");
    sceneHeader.append(
      node("span", "hot-mic-room-sign", "DAILY / THE MIC IS MAKING THE ROUNDS"),
      this.sound,
    );
    this.stage.setAttribute("role", "img");
    const ring = node("div", "hot-mic-ring");
    ring.setAttribute("aria-hidden", "true");
    const center = node("div", "hot-mic-center");
    center.setAttribute("aria-hidden", "true");
    center.append(this.cue, this.holderName);
    this.circle.setAttribute("aria-hidden", "true");
    this.mic.setAttribute("aria-hidden", "true");
    this.mic.append(microphone());
    this.stage.append(ring, this.circle, center, this.mic);
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.status.setAttribute("aria-atomic", "true");
    this.scene.append(sceneHeader, this.stage, this.status);

    this.notice.hidden = true;
    this.notice.setAttribute("role", "alert");
    this.results.hidden = true;
    this.results.setAttribute("aria-label", "Hot Mic result");
    this.root.append(
      header,
      this.notice,
      this.setup,
      toolbar,
      this.scene,
      this.results,
      node(
        "p",
        "hot-mic-local-note",
        "One host · 2–9 teammates · Everyone watches from the call. Your team stays in this browser.",
      ),
    );
    this.renderCircle(this.round?.participants ?? this.selectedParticipants());
    this.updateControls();
  }

  private renderRoster(): void {
    for (const seat of this.seats) {
      const card = node("div", "hot-mic-seat-choice");
      card.dataset.selected = String(seat.selected);
      const label = node("label", "hot-mic-seat-label");
      const checkbox = node("input", "hot-mic-seat-check");
      checkbox.type = "checkbox";
      checkbox.checked = seat.selected;
      const image = portrait(seat.characterId, "hot-mic-choice-portrait");
      label.append(checkbox, image, node("span", "hot-mic-choice-name", seat.name));
      const choice = node("select", "hot-mic-character-select");
      choice.setAttribute("aria-label", `Character for ${seat.name}`);
      for (const character of CHARACTERS) {
        const option = node("option", "", character.detail);
        option.value = character.id;
        choice.append(option);
      }
      choice.value = seat.characterId;
      checkbox.addEventListener(
        "change",
        () => {
          if (this.running) return;
          seat.selected = checkbox.checked;
          card.dataset.selected = String(seat.selected);
          this.setupChanged();
        },
        { signal: this.abort.signal },
      );
      choice.addEventListener(
        "change",
        () => {
          if (this.running) return;
          const id = CHARACTER_IDS.find((value) => value === choice.value);
          if (!id) return;
          seat.characterId = id;
          const replacement = portrait(id, "hot-mic-choice-portrait");
          const previous = label.querySelector(".hot-mic-choice-portrait");
          previous?.replaceWith(replacement);
          this.setupChanged();
        },
        { signal: this.abort.signal },
      );
      card.append(label, choice);
      this.roster.append(card);
    }
  }

  private selectedParticipants(): DerbyParticipant[] {
    return this.seats
      .filter((seat) => seat.selected)
      .map(({ id, name, characterId }) => ({ id, name, characterId }));
  }

  private setupChanged(): void {
    this.audio.pause();
    this.round = null;
    this.lastPhase = "";
    this.lastCue = "";
    this.lastHolder = null;
    this.results.hidden = true;
    this.notice.hidden = true;
    this.saveSetup();
    this.saveRound();
    this.renderCircle(this.selectedParticipants());
    this.tick();
  }

  private renderCircle(people: readonly DerbyParticipant[]): void {
    this.circle.replaceChildren();
    this.circleSeats = people.map((person, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / people.length;
      const point = { x: 50 + Math.cos(angle) * 36, y: 50 + Math.sin(angle) * 35 };
      const seat = node("div", "hot-mic-circle-seat");
      seat.style.left = `${point.x}%`;
      seat.style.top = `${point.y}%`;
      seat.append(portrait(person.characterId), node("span", "hot-mic-person-name", person.name));
      this.circle.append(seat);
      return { participant: person, element: seat, point };
    });
    this.stage.setAttribute(
      "aria-label",
      `Hot Mic circle: ${people.map((person) => person.name).join(", ") || "No attendees selected"}.`,
    );
    this.holderName.textContent = `${people.length} in the circle`;
    this.lastHolder = null;
  }

  private updateControls(): void {
    this.setupFields.disabled = this.running;
    const count = this.selectedParticipants().length;
    this.count.textContent = `${count} selected · 2–9 can play`;
    this.start.disabled =
      this.running || !hotMicRosterSchema.safeParse(this.selectedParticipants()).success;
    this.start.textContent = this.running
      ? "Passing…"
      : this.round
        ? "Pass it again ↗"
        : "Start passing ↗";
    this.motion.setAttribute("aria-pressed", String(this.reduced));
    this.root.dataset.reducedMotion = String(this.reduced);
    this.renderSoundControl();
  }

  private renderSoundControl(): void {
    const pending = this.soundRequested && !this.soundEnabled;
    this.sound.textContent = pending
      ? "Starting sound…"
      : this.soundEnabled
        ? "Sound on"
        : "Sound off";
    this.sound.setAttribute("aria-pressed", String(this.soundEnabled));
    this.sound.setAttribute("aria-busy", String(pending));
    this.sound.setAttribute(
      "aria-label",
      pending
        ? "Cancel sound activation"
        : this.soundEnabled
          ? "Mute microphone notes and office applause"
          : "Enable microphone notes and office applause",
    );
    this.root.dataset.sound = pending ? "starting" : this.soundEnabled ? "on" : "off";
  }

  private async toggleSound(): Promise<void> {
    if (this.notice.textContent === SOUND_ERROR) this.notice.hidden = true;
    const requested = !this.soundRequested;
    const revision = ++this.soundRevision;
    this.soundRequested = requested;
    this.soundEnabled = false;
    this.renderSoundControl();
    const enabled = await this.audio.setEnabled(requested);
    if (this.destroyed || revision !== this.soundRevision) return;
    this.soundEnabled = enabled;
    this.soundRequested = enabled;
    this.renderSoundControl();
    if (requested && !enabled) this.showNotice(SOUND_ERROR);
    this.audio.update(this.round, Date.now(), this.active && !document.hidden);
  }

  private showNotice(message: string): void {
    this.notice.textContent = message;
    this.notice.hidden = false;
  }

  private startRound(): void {
    if (this.running) return;
    const roster = hotMicRosterSchema.safeParse(this.selectedParticipants());
    if (!roster.success) {
      this.showNotice("Select at least two teammates to start.");
      return;
    }
    this.notice.hidden = true;
    this.audio.pause();
    this.round = createHotMicRound(roster.data);
    this.saveSetup();
    this.saveRound();
    this.lastPhase = "";
    this.lastCue = "";
    this.lastHolder = null;
    this.setup.open = false;
    this.results.hidden = true;
    this.renderCircle(this.round.participants);
    this.tick();
    this.scene.scrollIntoView({ block: "start", behavior: "instant" });
  }

  private pointFor(id: string | null): Point {
    const seat = this.circleSeats.find((candidate) => candidate.participant.id === id);
    return seat ? { x: seat.point.x + 5, y: seat.point.y - 5 } : { x: 50, y: 32 };
  }

  private moveMic(point: Point, rotation = 0): void {
    this.mic.style.left = `${point.x}%`;
    this.mic.style.top = `${point.y}%`;
    this.mic.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
  }

  private markHolder(id: string | null, finished = false): void {
    if (id === this.lastHolder && !finished) return;
    this.lastHolder = id;
    for (const seat of this.circleSeats) {
      const selected = seat.participant.id === id;
      seat.element.dataset.holder = String(selected);
      seat.element.dataset.winner = String(selected && finished);
    }
    const person = this.circleSeats.find(
      (candidate) => candidate.participant.id === id,
    )?.participant;
    this.holderName.textContent = person?.name ?? `${this.circleSeats.length} in the circle`;
  }

  private stopScheduling(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    if (this.timer !== null) clearTimeout(this.timer);
    this.frame = null;
    this.timer = null;
  }

  private tick = (): void => {
    this.stopScheduling();
    if (!this.active || this.destroyed) return;
    const now = Date.now();
    this.audio.update(this.round, now, !document.hidden);
    if (!this.round) {
      this.root.dataset.phase = "ready";
      this.cue.textContent = "Who gets the mic?";
      this.holderName.textContent = `${this.circleSeats.length} in the circle`;
      this.status.textContent =
        this.circleSeats.length < 2
          ? "Select at least two teammates to start."
          : "Ready when you are.";
      this.moveMic(this.pointFor(null));
      this.updateControls();
      return;
    }
    const sample = hotMicSample(this.round, now);
    const phaseChanged = sample.phase !== this.lastPhase;
    this.root.dataset.phase = sample.phase;
    if (phaseChanged) {
      this.updateControls();
      if (sample.phase === "passing")
        this.status.textContent = "The microphone is making the rounds…";
    }
    if (sample.cue !== this.lastCue) {
      this.cue.textContent = CUES[sample.cue];
      this.lastCue = sample.cue;
    }
    if (sample.phase === "finished") {
      this.markHolder(this.round.winnerId, true);
      this.moveMic(this.pointFor(this.round.winnerId), -12);
      if (phaseChanged) this.renderResult();
      this.lastPhase = sample.phase;
      return;
    }
    const from = this.pointFor(sample.fromId);
    const to = this.pointFor(sample.toId);
    const passing = this.round.segments[sample.segmentIndex]?.kind === "pass";
    if (this.reduced || document.hidden || !passing) this.moveMic(to);
    else {
      const eased = sample.progress * sample.progress * (3 - 2 * sample.progress);
      const arc = Math.sin(Math.PI * sample.progress);
      this.moveMic(
        { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased - arc * 10 },
        arc * 35,
      );
    }
    this.markHolder(this.reduced || sample.progress > 0.9 ? sample.toId : sample.fromId);
    this.lastPhase = sample.phase;
    if (document.hidden) return;
    if (this.reduced) this.timer = setTimeout(this.tick, 140);
    else this.frame = requestAnimationFrame(this.tick);
  };

  private renderResult(): void {
    const winner = this.round?.participants.find((person) => person.id === this.round?.winnerId);
    if (!winner) return;
    this.results.replaceChildren();
    const copy = node("div", "hot-mic-winner-copy");
    copy.append(
      node("p", "eyebrow", "The opening update is yours"),
      node("h2", "", `${winner.name}, the mic is yours.`),
      node("p", "", "Thanks for getting the team started. Let's hear your update!"),
    );
    this.results.append(portrait(winner.characterId, "hot-mic-winner-portrait"), copy);
    this.results.hidden = false;
    this.status.textContent = `${winner.name}, open standup!`;
    this.stage.setAttribute("aria-label", `Hot Mic result: ${winner.name} opens standup.`);
  }

  private visibilityChanged = (): void => {
    if (document.hidden) {
      this.stopScheduling();
      this.audio.pause();
      return;
    }
    this.tick();
  };

  private preferenceChanged = (): void => {
    this.updateControls();
    this.tick();
  };
}
