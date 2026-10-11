import { describe, expect, it } from "vitest";
import { finalStandings, selectStandupStarter } from "../shared/results";
import type { Player } from "../shared/protocol";

const player = (id: string, progress: number): Player => ({
  id,
  name: id,
  progress,
  ready: true,
  connected: true,
  sequence: 1,
});

describe("the opening standup update", () => {
  it("chooses the least distance, independently of the winner or input order", () => {
    const racers = [player("c", 240), player("a", 50), player("b", 100)];
    expect(selectStandupStarter(racers, 99)).toEqual({ id: "a", tieCount: 1 });
    expect(finalStandings(racers).map((row) => [row.player.id, row.place])).toEqual([
      ["c", 1],
      ["b", 2],
      ["a", 3],
    ]);
  });
  it("shares places for exact distance ties and makes a stable draw among the final tied group", () => {
    const racers = [player("c", 240), player("b", 50), player("a", 50)];
    expect(finalStandings(racers).map((row) => [row.place, row.tied])).toEqual([
      [1, false],
      [2, true],
      [2, true],
    ]);
    expect(selectStandupStarter(racers, 0)).toEqual({ id: "a", tieCount: 2 });
    expect(selectStandupStarter([...racers].reverse(), 0)).toEqual({ id: "a", tieCount: 2 });
    expect(selectStandupStarter(racers, 1)).toEqual({ id: "b", tieCount: 2 });
    expect(selectStandupStarter([], 1)).toEqual({ id: null, tieCount: 0 });
  });
});
