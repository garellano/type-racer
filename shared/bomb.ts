// All timestamps are server timestamps. The client receives only already revealed cuts.
export const BOMB_SELECTION_MS = 20000;
export const BOMB_COUNTDOWN_MS = 3000;
export const BOMB_CUTS_MS = 26000;
export const BOMB_FINALE_MS = 3000;

export function cutTimes(count: number, startAt: number): number[] {
  if (!Number.isInteger(count) || count < 2 || count > 25) throw new Error("Invalid bomb field.");
  const weights = Array.from({ length: count - 1 }, (_, index) => 1.8 - index / (count - 1));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let accumulated = 0;
  return weights.map((weight) => {
    accumulated += weight;
    return startAt + Math.round((accumulated / total) * BOMB_CUTS_MS);
  });
}
