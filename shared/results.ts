import { rankPlayers, type Player } from "./protocol";

export function finalStandings(
  players: readonly Player[],
): { player: Player; place: number; tied: boolean }[] {
  const ranked = rankPlayers(players);
  return ranked.map((player) => ({
    player,
    place: ranked.findIndex((item) => item.progress === player.progress) + 1,
    tied: ranked.filter((item) => item.progress === player.progress).length > 1,
  }));
}

export function selectStandupStarter(
  players: readonly Pick<Player, "id" | "progress">[],
  random: number,
): { id: string | null; tieCount: number } {
  if (!players.length) return { id: null, tieCount: 0 };
  const minimum = Math.min(...players.map((player) => player.progress));
  const candidates = players
    .filter((player) => player.progress === minimum)
    .sort((a, b) => a.id.localeCompare(b.id));
  return { id: candidates[random % candidates.length]?.id ?? null, tieCount: candidates.length };
}
