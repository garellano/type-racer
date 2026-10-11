import { finalStandings } from "../shared/results";
import type { Snapshot } from "../shared/protocol";
import { progressMeters } from "./race-math";

export function renderResults(state: Snapshot, ownId: string): void {
  const result = document.querySelector<HTMLElement>("#result");
  const rows = document.querySelector<HTMLTableSectionElement>("#result-rows");
  const opener = document.querySelector<HTMLElement>("#standup-opener");
  const detail = document.querySelector<HTMLElement>("#standup-detail");
  if (!result || !rows || !opener || !detail) throw new Error("Missing result elements.");
  result.hidden = state.phase !== "finished";
  if (state.phase !== "finished") {
    result.dataset.raceId = "";
    return;
  }
  // Keep the reveal and announcement stable across presence updates and reconnection.
  if (result.dataset.raceId === state.raceId) return;
  result.dataset.raceId = state.raceId ?? "";
  rows.replaceChildren();
  const standings = finalStandings(state.players);
  const starter = state.players.find((player) => player.id === state.standupStarterId);
  for (const { player, place, tied } of standings) {
    const row = document.createElement("tr");
    row.dataset.starter = String(player.id === starter?.id);
    row.dataset.own = String(player.id === ownId);
    const values = [
      `${tied ? "= " : ""}${place}`,
      `${player.name}${player.id === ownId ? " (you)" : ""}`,
      `${progressMeters(player.progress, state.passage.length).toFixed(1)} m`,
      player.id === state.winnerId
        ? "Race winner"
        : player.id === starter?.id
          ? "Opens standup"
          : "",
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    rows.append(row);
  }
  opener.textContent = starter
    ? `${starter.name}, the opening lap is yours.`
    : "Ready for our first update?";
  detail.textContent = starter
    ? `Kick off our standup with your update. The team is ready to listen.${state.standupTieCount > 1 ? " A shared draw settled the distance tie." : ""}`
    : "This earlier round has no saved opening speaker. The host can hand the mic to a teammate.";
}
