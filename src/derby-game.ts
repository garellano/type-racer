import "./derby-game.css";
import { z } from "zod";
import { DerbyAudio } from "./derby-audio";
import { CHARACTER_IDS, CHARACTERS, chooseCharacter, type CharacterId } from "../shared/characters";
import {
  DERBY_TEAM,
  DERBY_COUNTDOWN_MS,
  createDerbyRound,
  derbyPhase,
  derbyPosition,
  derbyRosterSchema,
  derbyRoundSchema,
  type DerbyParticipant,
  type DerbyRound,
} from "../shared/derby";

const ROSTER_KEY = "type-racer:office-derby:roster:v1";
const ROUND_KEY = "type-racer:office-derby:round:v1";
const MAX_SEATS = 25;
const SOUND_ERROR = "Sound could not start. Use the Sound button to try again.";
const rosterStorageSchema = z.object({
  version: z.literal(1),
  reducedMotion: z.boolean().nullable(),
  seats: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(24),
        characterId: z.enum(CHARACTER_IDS),
        selected: z.boolean(),
        preset: z.boolean(),
      }),
    )
    .min(2)
    .max(MAX_SEATS),
});

type Seat = DerbyParticipant & { selected: boolean; preset: boolean };
type Sprite = { element: HTMLElement; row: number; pose: number };
type Lane = {
  participant: DerbyParticipant;
  marker: HTMLElement;
  sprite: Sprite;
  element: HTMLElement;
};

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

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function button(text: string, className = ""): HTMLButtonElement {
  const result = node("button", className, text);
  result.type = "button";
  return result;
}

function participant(seat: Seat): DerbyParticipant {
  return { id: seat.id, name: seat.name, characterId: seat.characterId };
}

function sprite(id: CharacterId, className = ""): Sprite {
  const appearance = APPEARANCES[id];
  const element = node("span", `derby-sprite ${className}`);
  element.style.backgroundImage = `url("${import.meta.env.BASE_URL}assets/derby/chair-${appearance.atlas}-v2.webp")`;
  element.style.backgroundPosition = `0% ${appearance.row * 50}%`;
  element.dataset.pose = "0";
  element.setAttribute("aria-hidden", "true");
  return { element, row: appearance.row, pose: 0 };
}

function setPose(target: Sprite, pose: number): void {
  if (target.pose === pose) return;
  target.pose = pose;
  target.element.style.backgroundPosition = `${(pose / 3) * 100}% ${target.row * 50}%`;
  target.element.dataset.pose = String(pose);
}

/** A screen-shared game hosted entirely in this browser; it never joins a multiplayer room. */
export class DerbyGame {
  private readonly audio = new DerbyAudio({
    applauseUrl: `${import.meta.env.BASE_URL}assets/derby/audio/office-applause-v1.mp3`,
    cheerUrl: `${import.meta.env.BASE_URL}assets/derby/audio/office-cheer-v1.mp3`,
  });
  private readonly abort = new AbortController();
  private rosterAbort = new AbortController();
  private readonly preference = matchMedia("(prefers-reduced-motion: reduce)");
  private seats: Seat[] = DERBY_TEAM.map((person) => ({
    ...person,
    id: crypto.randomUUID(),
    selected: true,
    preset: true,
  }));
  private round: DerbyRound | null = null;
  private lanes: Lane[] = [];
  private frame: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private celebrationTimer: ReturnType<typeof setTimeout> | null = null;
  private motionOverride: boolean | null = null;
  private active = false;
  private destroyed = false;
  private lastPhase = "";
  private lastSecond = -1;
  private soundEnabled = false;
  private soundRequested = false;
  private soundRevision = 0;
  private readonly heading = node("h1", "derby-title", "Office Derby");
  private readonly setup = node("details", "derby-setup");
  private readonly setupSummary = node("summary", "derby-setup-summary");
  private readonly setupFields = node("fieldset", "derby-setup-fields");
  private readonly roster = node("div", "derby-roster");
  private readonly count = node("span", "derby-count");
  private readonly start = button("Start derby ↗", "derby-start");
  private readonly motion = button("Reduce motion", "subtle derby-motion");
  private readonly sound = button("Sound off", "subtle derby-sound");
  private readonly sceneSound = button("Sound off", "derby-sound derby-scene-sound");
  private readonly notice = node("p", "derby-notice");
  private readonly clock = node("strong", "derby-clock", "Ready to roll");
  private readonly sceneClock = node("strong", "derby-scene-clock", "Chairs ready");
  private readonly status = node(
    "p",
    "derby-status",
    "Pick the team. The chairs take it from here.",
  );
  private readonly field = node("div", "derby-field");
  private readonly scene = node("section", "derby-scene");
  private readonly results = node("section", "derby-results");
  private readonly newName = node("input", "derby-new-name");
  private readonly add = button("Add teammate", "subtle");

  constructor(
    private readonly root: HTMLElement,
    private readonly onExit: () => void,
  ) {
    this.root.classList.add("derby-game");
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
    if (this.running) this.scene.scrollIntoView({ block: "start", behavior: "instant" });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.active = false;
    ++this.soundRevision;
    this.soundRequested = false;
    this.soundEnabled = false;
    this.audio.destroy();
    this.stopScheduling();
    this.freezePoses();
    if (this.celebrationTimer !== null) clearTimeout(this.celebrationTimer);
    this.root.dataset.celebrate = "false";
    this.abort.abort();
    this.rosterAbort.abort();
  }

  private get reduced(): boolean {
    return this.motionOverride ?? this.preference.matches;
  }

  private get running(): boolean {
    return this.round !== null && derbyPhase(this.round, Date.now()) !== "finished";
  }

  private read(storage: Storage, key: string): unknown {
    const value = storage.getItem(key);
    return value ? (JSON.parse(value) as unknown) : null;
  }

  private restore(): void {
    try {
      const saved = rosterStorageSchema.safeParse(this.read(localStorage, ROSTER_KEY));
      if (saved.success && derbyRosterSchema.safeParse(saved.data.seats.map(participant)).success) {
        this.seats = saved.data.seats;
        this.motionOverride = saved.data.reducedMotion;
      }
    } catch {
      /* A private or unavailable storage area leaves the in-memory defaults usable. */
    }
    try {
      const saved = derbyRoundSchema.safeParse(this.read(sessionStorage, ROUND_KEY));
      if (
        saved.success &&
        saved.data.expiresAt > Date.now() &&
        saved.data.startAt <= Date.now() + DERBY_COUNTDOWN_MS
      )
        this.round = saved.data;
      else sessionStorage.removeItem(ROUND_KEY);
    } catch {
      /* An invalid saved round must never become an unvalidated race. */
    }
  }

  private saveRoster(): void {
    try {
      localStorage.setItem(
        ROSTER_KEY,
        JSON.stringify({ version: 1, reducedMotion: this.motionOverride, seats: this.seats }),
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
        "Your browser could not save this round. Keep this tab open to keep its result.",
      );
    }
  }

  private renderSoundControls(): void {
    const pending = this.soundRequested && !this.soundEnabled;
    const label = pending ? "Starting sound…" : this.soundEnabled ? "Sound on" : "Sound off";
    for (const control of [this.sound, this.sceneSound]) {
      control.textContent = label;
      control.setAttribute("aria-pressed", String(this.soundEnabled));
      control.setAttribute("aria-busy", String(pending));
      control.setAttribute(
        "aria-label",
        pending
          ? "Cancel sound activation"
          : this.soundEnabled
            ? "Mute office cheers and finish fanfare"
            : "Enable office cheers and finish fanfare",
      );
    }
    this.root.dataset.sound = pending ? "starting" : this.soundEnabled ? "on" : "off";
  }

  private async toggleSound(): Promise<void> {
    if (this.notice.textContent === SOUND_ERROR) this.notice.hidden = true;
    const requested = !this.soundRequested;
    const revision = ++this.soundRevision;
    this.soundRequested = requested;
    this.soundEnabled = false;
    this.renderSoundControls();
    // Keep the unlock call in this button's gesture; async loading happens inside DerbyAudio.
    const enabled = await this.audio.setEnabled(requested);
    if (revision !== this.soundRevision || this.destroyed) return;
    this.soundEnabled = enabled;
    this.soundRequested = enabled;
    this.renderSoundControls();
    if (requested && !enabled) this.showNotice(SOUND_ERROR);
    this.audio.update(this.round, Date.now(), this.active && !document.hidden);
  }

  private build(): void {
    this.root.replaceChildren();
    const header = node("div", "derby-heading");
    const title = node("div");
    title.append(
      node("p", "eyebrow", "The standup office circuit"),
      this.heading,
      node("p", "derby-intro", "You pick the team. Share your screen. The winner opens standup."),
    );
    const back = button("← Back to games", "subtle derby-back");
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
    this.setupSummary.append(node("span", "derby-setup-title", "Today's team"), this.count);
    this.setup.append(this.setupSummary, this.setupFields);
    this.setupFields.append(
      node("legend", "derby-sr-only", "Choose today's participants"),
      this.roster,
    );
    const custom = node("div", "derby-add");
    const label = node("label", "derby-add-label", "Add someone to the lineup");
    this.newName.id = "derby-new-name";
    this.newName.maxLength = 24;
    this.newName.placeholder = "Teammate's name";
    this.newName.autocomplete = "off";
    label.htmlFor = this.newName.id;
    const controls = node("div", "derby-add-controls");
    controls.append(this.newName, this.add);
    custom.append(label, controls);
    this.setupFields.append(custom);
    this.newName.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.addSeat();
        }
      },
      { signal: this.abort.signal },
    );
    this.add.addEventListener("click", () => this.addSeat(), { signal: this.abort.signal });
    this.start.addEventListener("click", () => this.startRound(), { signal: this.abort.signal });
    this.motion.addEventListener(
      "click",
      () => {
        this.motionOverride = !this.reduced;
        this.saveRoster();
        this.root.dataset.celebrate = "false";
        this.freezePoses();
        this.updateControls();
        this.tick();
      },
      { signal: this.abort.signal },
    );
    for (const control of [this.sound, this.sceneSound])
      control.addEventListener("click", () => void this.toggleSound(), {
        signal: this.abort.signal,
      });
    const toolbar = node("div", "derby-toolbar");
    const timing = node("div", "derby-timing");
    timing.append(node("span", "derby-time-label", "Office hours, race pace"), this.clock);
    toolbar.append(timing, this.sound, this.motion, this.start);
    this.notice.hidden = true;
    this.notice.setAttribute("role", "alert");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    const scene = this.scene;
    scene.setAttribute("aria-label", "Office Derby race");
    const sceneHeader = node("div", "derby-scene-header");
    const sceneTools = node("div", "derby-scene-tools");
    sceneTools.append(this.sceneSound, this.sceneClock);
    sceneHeader.append(
      node("span", "derby-office-sign", "DAILY / MEETING ROOM →"),
      node("span", "derby-course-label", "THE OFFICE HALLWAY"),
      sceneTools,
    );
    const courseCaption = node("div", "derby-course-caption");
    courseCaption.append(node("span", "", "START"), node("span", "", "THE MIC ▦"));
    this.field.setAttribute("role", "img");
    scene.append(sceneHeader, courseCaption, this.field);
    this.results.hidden = true;
    this.results.setAttribute("aria-label", "Office Derby result");
    this.root.append(
      header,
      this.notice,
      this.setup,
      toolbar,
      this.status,
      scene,
      this.results,
      node(
        "p",
        "derby-local-note",
        "One host · 2–25 teammates · Everyone watches from the call. Your team stays in this browser.",
      ),
    );
    this.renderRoster();
    this.renderLanes(this.round?.participants ?? this.selectedParticipants());
    this.updateControls();
  }

  private showNotice(message: string): void {
    this.notice.textContent = message;
    this.notice.hidden = false;
  }

  private selectedParticipants(): DerbyParticipant[] {
    return this.seats.filter((seat) => seat.selected).map(participant);
  }

  private clearResult(): void {
    if (!this.round || this.running) return;
    this.audio.pause();
    this.round = null;
    this.lastPhase = "";
    this.results.hidden = true;
    this.root.dataset.celebrate = "false";
    this.saveRound();
  }

  private rosterChanged(): void {
    this.audio.pause();
    this.clearResult();
    this.notice.hidden = true;
    this.saveRoster();
    this.renderLanes(this.selectedParticipants());
    this.tick();
  }

  private renderRoster(): void {
    this.rosterAbort.abort();
    this.rosterAbort = new AbortController();
    this.roster.replaceChildren();
    for (const seat of this.seats) {
      const card = node("div", "derby-seat");
      card.dataset.selected = String(seat.selected);
      const label = node("label", "derby-seat-label");
      const checkbox = node("input", "derby-seat-check");
      checkbox.type = "checkbox";
      checkbox.checked = seat.selected;
      const portrait = sprite(seat.characterId, "derby-seat-portrait");
      const name = node("span", "derby-seat-name", seat.name);
      label.append(checkbox, portrait.element, name);
      const choice = node("select", "derby-character-select");
      choice.setAttribute("aria-label", `Character for ${seat.name}`);
      for (const avatar of CHARACTERS) {
        const option = node("option", "", avatar.detail);
        option.value = avatar.id;
        choice.append(option);
      }
      choice.value = seat.characterId;
      checkbox.addEventListener(
        "change",
        () => {
          if (this.running) return;
          seat.selected = checkbox.checked;
          card.dataset.selected = String(seat.selected);
          this.rosterChanged();
        },
        { signal: this.rosterAbort.signal },
      );
      choice.addEventListener(
        "change",
        () => {
          if (this.running) return;
          const id = CHARACTER_IDS.find((value) => value === choice.value);
          if (!id) return;
          seat.characterId = id;
          const appearance = APPEARANCES[id];
          portrait.element.style.backgroundImage = `url("${import.meta.env.BASE_URL}assets/derby/chair-${appearance.atlas}-v2.webp")`;
          portrait.element.style.backgroundPosition = `0% ${appearance.row * 50}%`;
          this.rosterChanged();
        },
        { signal: this.rosterAbort.signal },
      );
      card.append(label, choice);
      if (!seat.preset) {
        const remove = button("Remove", "subtle derby-remove");
        remove.setAttribute("aria-label", `Remove ${seat.name}`);
        remove.addEventListener(
          "click",
          () => {
            if (this.running) return;
            this.seats = this.seats.filter((candidate) => candidate.id !== seat.id);
            this.renderRoster();
            this.rosterChanged();
            this.newName.focus();
          },
          { signal: this.rosterAbort.signal },
        );
        card.append(remove);
      }
      this.roster.append(card);
    }
  }

  private addSeat(): void {
    if (this.running) return;
    const name = this.newName.value.trim();
    if (!name || name.length > 24) {
      this.showNotice("Use a name between 1 and 24 characters.");
      this.newName.focus();
      return;
    }
    if (this.seats.length >= MAX_SEATS) {
      this.showNotice("This lineup has space for 25 teammates.");
      return;
    }
    const candidate: Seat = {
      id: crypto.randomUUID(),
      name,
      characterId: chooseCharacter(
        name,
        this.seats.map((seat) => seat.characterId),
      ),
      selected: true,
      preset: false,
    };
    const validation = derbyRosterSchema.safeParse([
      ...this.seats.map(participant),
      participant(candidate),
    ]);
    if (!validation.success) {
      this.showNotice("That name is already in the lineup. Choose a distinct name.");
      this.newName.focus();
      return;
    }
    this.seats.push(candidate);
    this.newName.value = "";
    this.renderRoster();
    this.rosterChanged();
    this.newName.focus();
  }

  private renderLanes(people: readonly DerbyParticipant[]): void {
    this.field.replaceChildren();
    this.lanes = people.map((person) => {
      const lane = node("div", "derby-lane");
      const label = node("span", "derby-racer-name", person.name);
      const track = node("div", "derby-track");
      const runway = node("div", "derby-runway");
      const marker = node("div", "derby-marker");
      marker.setAttribute("aria-hidden", "true");
      const image = sprite(person.characterId);
      marker.append(image.element);
      runway.append(marker);
      track.append(node("span", "derby-finish-line"), runway);
      lane.append(label, track);
      this.field.append(lane);
      return { participant: person, marker, sprite: image, element: lane };
    });
    this.field.setAttribute(
      "aria-label",
      `Starting lineup: ${people.map((person) => person.name).join(", ") || "Select at least two teammates"}.`,
    );
  }

  private updateControls(): void {
    const running = this.running;
    const count = this.selectedParticipants().length;
    this.setupFields.disabled = running;
    this.add.disabled = running || this.seats.length >= MAX_SEATS;
    this.start.disabled =
      running || !derbyRosterSchema.safeParse(this.selectedParticipants()).success;
    this.start.textContent = running
      ? "Derby in progress"
      : this.round
        ? "Race again ↗"
        : "Start derby ↗";
    this.count.textContent = `${count} selected · 2–25 can race`;
    this.motion.setAttribute("aria-pressed", String(this.reduced));
    this.root.dataset.reducedMotion = String(this.reduced);
    this.renderSoundControls();
  }

  private startRound(): void {
    if (this.running) return;
    const roster = derbyRosterSchema.safeParse(this.selectedParticipants());
    if (!roster.success) {
      this.showNotice("Select between 2 and 25 teammates with distinct names.");
      return;
    }
    this.notice.hidden = true;
    this.audio.pause();
    this.round = createDerbyRound(roster.data, Date.now());
    this.saveRound();
    this.saveRoster();
    this.results.hidden = true;
    this.root.dataset.celebrate = "false";
    if (this.celebrationTimer !== null) clearTimeout(this.celebrationTimer);
    this.lastPhase = "";
    this.lastSecond = -1;
    this.setup.open = false;
    this.renderLanes(this.round.participants);
    this.tick();
    this.scene.scrollIntoView({ block: "start", behavior: "instant" });
  }

  private stopScheduling(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    if (this.timer !== null) clearTimeout(this.timer);
    this.frame = null;
    this.timer = null;
  }

  private freezePoses(): void {
    for (const lane of this.lanes) setPose(lane.sprite, 0);
  }

  private tick = (): void => {
    this.stopScheduling();
    if (!this.active || this.destroyed) return;
    const now = Date.now();
    this.audio.update(this.round, now, !document.hidden);
    if (!this.round) {
      this.updateControls();
      this.root.dataset.phase = "lobby";
      this.clock.textContent = "21 seconds · pure chance";
      this.sceneClock.textContent = `${this.selectedParticipants().length} chairs ready`;
      this.status.textContent =
        this.selectedParticipants().length < 2
          ? "Select at least two teammates to start."
          : "Pick the team. The chairs take it from here.";
      return;
    }
    const phase = derbyPhase(this.round, now);
    const changed = phase !== this.lastPhase;
    if (changed) this.updateControls();
    const second =
      Math.ceil((phase === "countdown" ? this.round.startAt : this.round.finishAt) - now) / 1000;
    this.root.dataset.phase = phase;
    if (changed || Math.ceil(second) !== this.lastSecond) {
      this.lastSecond = Math.ceil(second);
      this.clock.textContent =
        phase === "countdown"
          ? String(Math.max(1, this.lastSecond))
          : phase === "racing"
            ? `${Math.max(0, this.lastSecond)}s to the mic`
            : "Checkered flag";
      this.sceneClock.textContent =
        phase === "countdown"
          ? `Starts in ${Math.max(1, this.lastSecond)}`
          : phase === "racing"
            ? `${Math.max(0, this.lastSecond)}s to the mic`
            : "Checkered flag";
      if (phase === "countdown")
        this.status.textContent = `Chairs ready. Starting in ${Math.max(1, this.lastSecond)}…`;
      else if (phase === "racing" && changed)
        this.status.textContent = "The chairs are rolling. Everyone has the same chance!";
    }
    for (const [index, lane] of this.lanes.entries()) {
      lane.marker.style.left = `${derbyPosition(this.round, lane.participant.id, now) * 100}%`;
      const pose =
        phase === "racing" && !this.reduced && !document.hidden
          ? (Math.floor((now - this.round.startAt) / 150) + index) % 4
          : 0;
      setPose(lane.sprite, pose);
    }
    if (phase === "finished") {
      if (changed) this.renderResult(this.lastPhase === "racing" || this.lastPhase === "countdown");
      this.freezePoses();
      this.lastPhase = phase;
      return;
    }
    this.lastPhase = phase;
    if (document.hidden) {
      this.freezePoses();
      return;
    }
    if (phase === "racing" && !this.reduced) this.frame = requestAnimationFrame(this.tick);
    else this.timer = setTimeout(this.tick, 150);
  };

  private renderResult(celebrate: boolean): void {
    if (!this.round) return;
    const round = this.round;
    const winner = round.participants.find((person) => person.id === round.winnerId);
    if (!winner) return;
    this.results.replaceChildren();
    const hero = node("div", "derby-winner");
    const portrait = sprite(winner.characterId, "derby-winner-portrait");
    const copy = node("div", "derby-winner-copy");
    copy.append(
      node("p", "eyebrow", "The opening update is yours"),
      node("h2", "", `${winner.name}, the mic is yours.`),
      node("p", "", "Thanks for getting the team started. Let's hear your update!"),
    );
    hero.append(portrait.element, copy, node("span", "derby-winner-flag", "▦"));
    this.results.append(hero);
    const standings = node("details", "derby-final-standings");
    standings.append(node("summary", "", "Final standings"));
    const list = node("ol", "derby-final-list");
    const ranked = round.participants
      .map((person, index) => ({
        person,
        index,
        progress: derbyPosition(round, person.id, round.finishAt),
      }))
      .sort((left, right) => right.progress - left.progress || left.index - right.index);
    for (const item of ranked) {
      const row = node("li");
      row.append(
        node("span", "", item.person.name),
        node(
          "span",
          "",
          item.person.id === round.winnerId
            ? "The opening speaker"
            : `${Math.round(item.progress * 100)}% at the flag`,
        ),
      );
      list.append(row);
    }
    standings.append(list);
    this.results.append(standings);
    this.results.hidden = false;
    for (const lane of this.lanes)
      lane.element.dataset.winner = String(lane.participant.id === round.winnerId);
    this.status.textContent = `${winner.name} wins Office Derby and opens standup.`;
    this.field.setAttribute(
      "aria-label",
      `${winner.name} wins Office Derby and opens standup. Final positions are frozen.`,
    );
    this.setup.open = false;
    this.root.dataset.celebrate = String(celebrate && !this.reduced && !document.hidden);
    if (celebrate && !this.reduced && !document.hidden)
      this.celebrationTimer = setTimeout(() => {
        this.root.dataset.celebrate = "false";
        this.celebrationTimer = null;
      }, 3000);
    if (!document.hidden) this.results.scrollIntoView({ block: "nearest", behavior: "instant" });
  }

  private visibilityChanged = (): void => {
    this.audio.pause();
    this.stopScheduling();
    this.freezePoses();
    this.root.dataset.celebrate = "false";
    if (this.celebrationTimer !== null) {
      clearTimeout(this.celebrationTimer);
      this.celebrationTimer = null;
    }
    if (!document.hidden) {
      if (this.round && this.round.expiresAt <= Date.now()) {
        this.round = null;
        this.saveRound();
        this.lastPhase = "";
        this.results.hidden = true;
        this.renderLanes(this.selectedParticipants());
      }
      this.tick();
    }
  };

  private preferenceChanged = (): void => {
    if (this.motionOverride !== null) return;
    this.freezePoses();
    this.root.dataset.celebrate = "false";
    this.updateControls();
    this.tick();
  };
}
