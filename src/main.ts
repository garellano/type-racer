import "./style.css";
import "./race-scene.css";
import { LANGUAGE_LABELS } from "../shared/passages";
import {
  admissionSchema,
  correctPrefix,
  languageSchema,
  MAX_PLAYERS,
  rankPlayers,
  roomIdSchema,
  sessionSchema,
  UPDATE_INTERVAL_MS,
  type Session,
  type Snapshot,
} from "../shared/protocol";
import { RaceConnection } from "./connection";
import { RaceScene } from "./race-scene";
import { renderResults } from "./results";

function element<E extends HTMLElement>(selector: string): E {
  const result = document.querySelector<E>(selector);
  if (!result) throw new Error(`Missing element: ${selector}`);
  return result;
}

const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8787";
const entry = element<HTMLElement>("#entry");
const game = element<HTMLElement>("#game");
const input = element<HTMLTextAreaElement>("#typing");
const errorLabel = element<HTMLParagraphElement>("#error");
const readyButton = element<HTMLButtonElement>("#ready");
const startButton = element<HTMLButtonElement>("#start");
const resetButton = element<HTMLButtonElement>("#reset");
const leaveButton = element<HTMLButtonElement>("#leave");
const languageSelect = element<HTMLSelectElement>("#language");
const scene = new RaceScene(element<HTMLElement>(".track-panel"));
const passage = element<HTMLElement>("#passage");
const requestedRoom = new URLSearchParams(location.hash.slice(1)).get("room");
const roomId = roomIdSchema.safeParse(requestedRoom);
let connection: RaceConnection | undefined;
let session: Session | undefined;
let state: Snapshot | undefined;
let sequence = 0;
let previousRace: string | null = null;
let progressTimer: ReturnType<typeof setTimeout> | undefined;
let lastSentText = "";
let focusedRace: string | null = null;

function showError(message: string): void {
  errorLabel.textContent = message;
  errorLabel.hidden = false;
}
function clearError(): void {
  errorLabel.hidden = true;
  errorLabel.textContent = "";
}

if (requestedRoom && !roomId.success)
  showError("That room link is invalid. Create a new room below.");
if (roomId.success) {
  element<HTMLButtonElement>("#enter").textContent = "Join the race ↗";
  element<HTMLElement>(".intro").textContent =
    "Your team has a lane waiting for you. Choose a name and join the starting grid.";
}

async function enterRoom(body: { name: string } | { session: Session }): Promise<void> {
  clearError();
  const endpoint = roomId.success ? `/rooms/${roomId.data}/join` : "/rooms";
  const response = await fetch(new URL(endpoint, apiUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Could not enter this room.";
    throw new Error(message);
  }
  const admission = admissionSchema.parse(payload);
  session = admission.session;
  sessionStorage.setItem(`type-racer:${admission.roomId}`, JSON.stringify(session));
  location.hash = new URLSearchParams({ room: admission.roomId }).toString();
  const invite = new URL(location.href);
  element<HTMLInputElement>("#invite").value = invite.toString();
  entry.hidden = true;
  game.hidden = false;
  connection?.close();
  connection = new RaceConnection(
    apiUrl,
    admission.roomId,
    session,
    receiveState,
    (status) => {
      element<HTMLElement>("#connection-label").textContent =
        status[0]?.toUpperCase() + status.slice(1);
      element<HTMLElement>("#connection-dot").dataset.status = status;
    },
    showError,
  );
}

element<HTMLFormElement>("#entry-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const button = element<HTMLButtonElement>("#enter");
  button.disabled = true;
  enterRoom({ name: element<HTMLInputElement>("#name").value.trim() })
    .catch((error: unknown) =>
      showError(error instanceof Error ? error.message : "Could not connect. Try again."),
    )
    .finally(() => {
      button.disabled = false;
    });
});

element<HTMLButtonElement>("#copy").addEventListener("click", () => {
  const button = element<HTMLButtonElement>("#copy");
  navigator.clipboard
    .writeText(element<HTMLInputElement>("#invite").value)
    .then(() => {
      button.textContent = "Copied!";
      setTimeout(() => {
        button.textContent = "Copy link";
      }, 1500);
    })
    .catch(() => {
      element<HTMLInputElement>("#invite").select();
      showError("Select and copy the invitation link.");
    });
});

readyButton.addEventListener("click", () => {
  clearError();
  const own = state?.players.find((player) => player.id === session?.playerId);
  connection?.send({ type: "ready", ready: !own?.ready });
});
languageSelect.addEventListener("change", () => {
  clearError();
  const language = languageSchema.parse(languageSelect.value);
  connection?.send({ type: "configure", language });
  // Show only the server-confirmed choice, including if the connection drops during this event.
  if (state) languageSelect.value = state.language;
});
startButton.addEventListener("click", () => {
  clearError();
  connection?.send({ type: "start" });
});
resetButton.addEventListener("click", () => {
  clearError();
  connection?.send({ type: "reset" });
});
leaveButton.addEventListener("click", () => {
  if (!state || !connection?.send({ type: "leave" })) return;
  sessionStorage.removeItem(`type-racer:${state.roomId}`);
  connection.close();
  location.hash = "";
  location.reload();
});

function receiveState(next: Snapshot): void {
  state = next;
  const own = next.players.find((player) => player.id === session?.playerId);
  if (!own) {
    showError("Your seat is no longer in this room. Reload to join again.");
    return;
  }
  const newRace = next.raceId !== previousRace;
  if (newRace) {
    previousRace = next.raceId;
    input.value = "";
    lastSentText = "";
    sequence = 0;
    focusedRace = null;
    window.scrollTo({ top: 0, behavior: "instant" });
    if (progressTimer !== undefined) clearTimeout(progressTimer);
    progressTimer = undefined;
  }
  sequence = Math.max(sequence, own.sequence);
  // Restore once on entry to a round. Later snapshots must not undo a user's deletion.
  if (newRace && own.progress > 0 && next.phase !== "lobby")
    input.value = next.passage.slice(0, own.progress);
  if (next.phase === "racing" && input.value !== lastSentText) sendProgress();
  renderState();
  renderTyping();
}

function renderState(): void {
  if (!state || !session) return;
  game.dataset.phase = state.phase;
  const own = state.players.find((player) => player.id === session?.playerId);
  const host = state.hostId === session.playerId;
  const lobby = state.phase === "lobby";
  languageSelect.value = state.language;
  languageSelect.disabled = !host || !lobby || connection?.status !== "connected";
  element<HTMLElement>("#language-help").textContent = !lobby
    ? "Locked for this round."
    : host
      ? "Changing this clears everyone's readiness."
      : "Chosen by the host before each round.";
  passage.classList.toggle("code-passage", state.language === "java");
  input.classList.toggle("code-passage", state.language === "java");
  passage.lang = state.language === "spanish" ? "es" : "en";
  input.lang = passage.lang;
  readyButton.hidden = !lobby;
  readyButton.textContent = own?.ready ? "Ready ✓" : "I'm ready";
  readyButton.dataset.ready = String(own?.ready ?? false);
  startButton.hidden = !host || !lobby;
  resetButton.hidden = !host || state.phase !== "finished";
  leaveButton.hidden = host || !lobby;
  const rank =
    rankPlayers(state.players).findIndex((player) => player.id === session?.playerId) + 1;
  element<HTMLElement>("#race-position").textContent = lobby
    ? `${state.players.length} / ${MAX_PLAYERS} racers`
    : `#${rank} / ${state.players.length}`;
  element<HTMLElement>("#room-title").textContent = lobby
    ? "The team is lining up."
    : state.phase === "finished"
      ? "That's a wrap."
      : "Make every letter count.";
  element<HTMLElement>("#challenge-heading").textContent = lobby
    ? "Get ready to race"
    : `${LANGUAGE_LABELS[state.language]} · your next few hundred meters`;
  element<HTMLElement>("#race-help").textContent = lobby
    ? state.language === "java"
      ? "A tiny Java class for everyone. Mark ready when you're happy with the mode."
      : "Everyone marks ready. The host starts the shared countdown."
    : state.language === "java"
      ? "Copy the code exactly, including spaces, case, and punctuation. No coding solution needed."
      : "Type the same text as your teammates. Correct mistakes to keep moving.";
  const prefix = correctPrefix(input.value, state.passage);
  scene.update(state, session.playerId, prefix, input.value.length > prefix);
  renderResults(state, session.playerId);
  if (state.phase === "finished") {
    const winner = state.players.find((player) => player.id === state?.winnerId);
    element<HTMLElement>("#winner").textContent = winner
      ? `${winner.name} takes the flag!`
      : "Time's up. Give it another go.";
    element<HTMLElement>("#winner-detail").textContent =
      winner && state.finishAt !== null && state.startAt !== null
        ? `${((state.finishAt - state.startAt) / 1000).toFixed(2)} seconds · confirmed for everyone · thanks for the lap, team`
        : "No racer finished within 90 seconds. The host can start a new round.";
  }
  element<HTMLElement>("#start-time").textContent =
    `Shared start: ${state.startAt !== null ? new Date(state.startAt).toISOString() : "—"}`;
  element<HTMLElement>("#state-version").textContent = `State version: ${state.version}`;
}

function renderTyping(): void {
  if (!state) return;
  const prefix = correctPrefix(input.value, state.passage);
  passage.replaceChildren();
  if (!state.passage) passage.textContent = "The race text will appear when the countdown begins.";
  else {
    const correct = document.createElement("span");
    correct.className = "correct";
    correct.textContent = state.passage.slice(0, prefix);
    const wrong = document.createElement("span");
    wrong.className = "wrong";
    wrong.textContent = state.passage.slice(prefix, Math.max(prefix, input.value.length));
    const remaining = document.createElement("span");
    remaining.textContent = state.passage.slice(Math.max(prefix, input.value.length));
    passage.append(correct, wrong, remaining);
  }
  const hasMistake = input.value.length > prefix;
  input.setAttribute("aria-invalid", String(hasMistake));
  element<HTMLElement>("#typing-feedback").textContent = hasMistake
    ? "Correct the highlighted letters to move forward"
    : state.phase === "lobby"
      ? "Waiting at the starting line"
      : state.phase === "finished"
        ? "Round complete"
        : "Steady hands. Keep going.";
  element<HTMLElement>("#typed-count").textContent = state.passage
    ? `${prefix} / ${state.passage.length} characters`
    : "0 characters";
}

function sendProgress(): void {
  progressTimer = undefined;
  if (!state?.raceId || !connection || state.phase === "finished") return;
  const text = input.value;
  if (text === lastSentText) return;
  if (connection.send({ type: "progress", raceId: state.raceId, sequence: ++sequence, text }))
    lastSentText = text;
}

input.addEventListener("input", () => {
  clearError();
  renderTyping();
  renderState();
  if (!state?.passage) return;
  if (correctPrefix(input.value, state.passage) === state.passage.length) {
    if (progressTimer !== undefined) clearTimeout(progressTimer);
    sendProgress();
  } else if (progressTimer === undefined)
    progressTimer = setTimeout(sendProgress, UPDATE_INTERVAL_MS);
});
input.addEventListener("paste", (event) => {
  event.preventDefault();
  showError("Use your keyboard for this race. Pasting is disabled.");
});
input.addEventListener("drop", (event) => event.preventDefault());

function updateClock(): void {
  if (!connection || !state) return;
  const now = connection.now();
  scene.tick(now, connection.status === "connected", connection.clockReady);
  const racing = state.startAt !== null && now >= state.startAt && state.phase !== "finished";
  input.disabled = !racing || connection.status !== "connected" || !connection.clockReady;
  if (racing && !input.disabled && focusedRace !== state.raceId) {
    focusedRace = state.raceId;
    input.focus({ preventScroll: true });
  }
  readyButton.disabled = connection.status !== "connected";
  languageSelect.disabled =
    state.hostId !== session?.playerId ||
    state.phase !== "lobby" ||
    connection.status !== "connected";
  startButton.disabled =
    !connection.clockReady ||
    state.players.length < 2 ||
    state.players.some((player) => !player.ready || !player.connected);
  element<HTMLElement>("#countdown").textContent =
    state.phase === "finished"
      ? "FINISH"
      : state.startAt === null
        ? "LOBBY"
        : now < state.startAt
          ? String(Math.ceil((state.startAt - now) / 1000))
          : `${Math.max(0, Math.ceil(((state.deadline ?? now) - now) / 1000))}s`;
  element<HTMLElement>("#latency").textContent = `Round trip: ${connection.latency ?? "…"} ms`;
  element<HTMLElement>("#state-age").textContent =
    `Last update: ${Math.round(performance.now() - connection.lastSnapshotAt)} ms ago`;
}

const clockTimer = setInterval(updateClock, 50);
window.addEventListener("pagehide", () => {
  clearInterval(clockTimer);
  if (progressTimer !== undefined) clearTimeout(progressTimer);
  connection?.close();
  scene.destroy();
});

if (roomId.success) {
  const saved = sessionStorage.getItem(`type-racer:${roomId.data}`);
  if (saved) {
    try {
      const restored = sessionSchema.parse(JSON.parse(saved));
      enterRoom({ session: restored }).catch((error: unknown) => {
        sessionStorage.removeItem(`type-racer:${roomId.data}`);
        showError(error instanceof Error ? error.message : "Could not restore this session.");
      });
    } catch {
      sessionStorage.removeItem(`type-racer:${roomId.data}`);
    }
  }
}
