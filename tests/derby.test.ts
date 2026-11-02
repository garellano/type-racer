import { describe, expect, it } from "vitest";
import {
  createDerbyRound,
  DERBY_COUNTDOWN_MS,
  DERBY_RACE_MS,
  DERBY_TEAM,
  DERBY_TTL_MS,
  derbyExpired,
  derbyParticipantSchema,
  derbyPhase,
  derbyPosition,
  derbyRandomIndex,
  derbyRosterSchema,
  derbyRoundSchema,
  type DerbyParticipant,
  type DerbyRound,
} from "../shared/derby";

const now = 1_800_000_000_000;
function roster(count = 3): DerbyParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `racer-${index}`,
    name: DERBY_TEAM[index % DERBY_TEAM.length]!.name + (index >= 9 ? ` ${index}` : ""),
    characterId: DERBY_TEAM[index % DERBY_TEAM.length]!.characterId,
  }));
}
function mutable(round: DerbyRound): DerbyRound {
  return JSON.parse(JSON.stringify(round)) as DerbyRound;
}
const fixedDraw = (count: number): number => count - 1;

describe("Office Derby draws and recovery", () => {
  it("keeps the nine requested team presets and their exact character mappings", () => {
    expect(DERBY_TEAM.map((participant) => participant.name)).toEqual([
      "Sam",
      "Gary",
      "Wil",
      "Kate",
      "Devan",
      "Gerardo",
      "Fabián",
      "Emanuel Medrano",
      "Arath",
    ]);
    expect(DERBY_TEAM.find((participant) => participant.name === "Kate")?.characterId).toBe("juno");
    expect(DERBY_TEAM.find((participant) => participant.name === "Devan")?.characterId).toBe(
      "ember",
    );
  });

  it("rejects the incomplete uint32 tail rather than favoring an index", () => {
    const values = [0xffffffff, 7];
    expect(derbyRandomIndex(3, () => values.shift()!)).toBe(1);
    expect(values).toEqual([]);
    // For three choices, only the last uint32 value is rejected.
    expect(derbyRandomIndex(3, () => 0xfffffffe)).toBe(2);
  });

  it("maps a complete accepted range to equally many occurrences of every index", () => {
    const counts = [0, 0, 0, 0, 0];
    for (let value = 0; value < 100; value++) counts[derbyRandomIndex(5, () => value)]!++;
    expect(counts).toEqual([20, 20, 20, 20, 20]);
  });

  it("gives every racer the same number of winning permutations", () => {
    const permutations = new Set<string>();
    const wins = new Map<string, number>();
    for (let first = 0; first < 3; first++) {
      for (let second = 0; second < 2; second++) {
        const choices = [first, second];
        const round = createDerbyRound(roster(), now, () => choices.shift() ?? 0);
        permutations.add(round.plans.map((plan) => plan.participantId).join(","));
        wins.set(round.winnerId, (wins.get(round.winnerId) ?? 0) + 1);
      }
    }
    expect(permutations.size).toBe(6);
    expect([...wins.values()]).toEqual([2, 2, 2]);
  });

  it("copies and freezes the roster, character choices and outcome for the round", () => {
    const participants = roster();
    const round = createDerbyRound(participants, now, fixedDraw);
    participants[0]!.name = "Changed later";
    participants[0]!.characterId = "orbit";
    participants.pop();
    expect(round.participants).toHaveLength(3);
    expect(round.participants[0]).toMatchObject({ name: "Sam", characterId: "sunbeam" });
    expect(Object.isFrozen(round)).toBe(true);
    expect(Object.isFrozen(round.participants)).toBe(true);
    expect(Object.isFrozen(round.plans[0]!.weights)).toBe(true);
  });

  it.each([2, 9, 25])(
    "keeps %i racers inside the course with exactly one first finisher",
    (count) => {
      const round = createDerbyRound(roster(count), now, fixedDraw);
      for (const participant of round.participants) {
        let previous = 0;
        for (let elapsed = 0; elapsed <= DERBY_RACE_MS; elapsed += 250) {
          const position = derbyPosition(round, participant.id, round.startAt + elapsed);
          expect(position).toBeGreaterThanOrEqual(previous);
          expect(position).toBeLessThanOrEqual(1);
          if (elapsed < DERBY_RACE_MS) expect(position).toBeLessThan(1);
          previous = position;
        }
      }
      const finishers = round.participants.filter(
        (participant) => derbyPosition(round, participant.id, round.finishAt) === 1,
      );
      expect(finishers.map((participant) => participant.id)).toEqual([round.winnerId]);
    },
  );

  it("uses the scheduled countdown and freezes everyone's final position", () => {
    const round = createDerbyRound(roster(), now, fixedDraw);
    expect(round.startAt).toBe(now + DERBY_COUNTDOWN_MS);
    expect(derbyPhase(round, now)).toBe("countdown");
    expect(derbyPhase(round, round.startAt - 1)).toBe("countdown");
    expect(derbyPhase(round, round.startAt)).toBe("racing");
    expect(derbyPhase(round, round.finishAt - 1)).toBe("racing");
    expect(derbyPhase(round, round.finishAt)).toBe("finished");
    for (const participant of round.participants) {
      expect(derbyPosition(round, participant.id, now)).toBe(0);
      expect(derbyPosition(round, participant.id, round.finishAt + 60_000)).toBe(
        derbyPosition(round, participant.id, round.finishAt),
      );
    }
    expect(derbyPosition(round, "absent", round.startAt + 1000)).toBe(0);
  });

  it("restores the same result and trajectories without drawing again", () => {
    const round = createDerbyRound(roster(9), now);
    const restored = derbyRoundSchema.parse(JSON.parse(JSON.stringify(round)));
    expect(restored).toEqual(round);
    expect(restored.winnerId).toBe(round.winnerId);
    for (const participant of round.participants)
      for (const time of [now, round.startAt + 8000, round.finishAt, round.finishAt + 5000])
        expect(derbyPosition(restored, participant.id, time)).toBe(
          derbyPosition(round, participant.id, time),
        );
  });

  it("expires the saved round exactly two hours after its creation", () => {
    const round = createDerbyRound(roster(), now);
    expect(round.expiresAt).toBe(now + DERBY_TTL_MS);
    expect(derbyExpired(round, round.expiresAt - 1)).toBe(false);
    expect(derbyExpired(round, round.expiresAt)).toBe(true);
    expect(derbyExpired(derbyRoundSchema.parse(mutable(round)), round.expiresAt + 1)).toBe(true);
  });
});

describe("Office Derby untrusted data", () => {
  it("trims names while rejecting blank, long, duplicate or unknown character selections", () => {
    expect(derbyParticipantSchema.parse({ ...roster()[0], name: "  Sam  " }).name).toBe("Sam");
    for (const name of ["", "   ", "x".repeat(25)])
      expect(derbyParticipantSchema.safeParse({ ...roster()[0], name }).success).toBe(false);
    expect(
      derbyParticipantSchema.safeParse({ ...roster()[0], characterId: "unknown" }).success,
    ).toBe(false);
    expect(derbyRosterSchema.safeParse([roster()[0]]).success).toBe(false);
    expect(derbyRosterSchema.safeParse(roster(26)).success).toBe(false);
    expect(
      derbyRosterSchema.safeParse([roster()[0], { ...roster()[1], name: "sam" }]).success,
    ).toBe(false);
    expect(
      derbyRosterSchema.safeParse([roster()[0], { ...roster()[1], id: "racer-0" }]).success,
    ).toBe(false);
  });

  it("allows any participant to choose any existing character", () => {
    const participants = roster();
    participants[0]!.characterId = "juno";
    participants[1]!.characterId = "juno";
    expect(
      createDerbyRound(participants, now)
        .participants.slice(0, 2)
        .map((person) => person.characterId),
    ).toEqual(["juno", "juno"]);
  });

  it("rejects saved outcomes with missing, duplicate or foreign race plans", () => {
    const base = createDerbyRound(roster(), now, fixedDraw);
    const missing = mutable(base);
    missing.plans.pop();
    const duplicate = mutable(base);
    duplicate.plans[1]!.participantId = duplicate.plans[0]!.participantId;
    const foreign = mutable(base);
    foreign.plans[1]!.participantId = "not-in-the-roster";
    for (const value of [missing, duplicate, foreign])
      expect(derbyRoundSchema.safeParse(value).success).toBe(false);
  });

  it("rejects a winner or finishing order that disagrees with the saved plans", () => {
    const base = createDerbyRound(roster(), now, fixedDraw);
    const winner = mutable(base);
    winner.winnerId = winner.participants[1]!.id;
    const tie = mutable(base);
    tie.plans[1]!.durationMs = tie.plans[0]!.durationMs;
    const gap = mutable(base);
    gap.plans[2]!.durationMs += 500;
    for (const value of [winner, tie, gap])
      expect(derbyRoundSchema.safeParse(value).success).toBe(false);
  });

  it("rejects malformed timing and nonpositive, nonfinite or oversized speed data", () => {
    const base = createDerbyRound(roster(), now, fixedDraw);
    const end = mutable(base);
    end.finishAt += 1;
    const expiry = mutable(base);
    expiry.expiresAt += 1;
    const badWeight = mutable(base);
    badWeight.plans[0]!.weights[0] = 0;
    const infinity = mutable(base);
    infinity.plans[0]!.weights[0] = Infinity;
    const extra = mutable(base);
    extra.plans[0]!.weights.push(1000);
    for (const value of [end, expiry, badWeight, infinity, extra])
      expect(derbyRoundSchema.safeParse(value).success).toBe(false);
  });

  it("rejects invalid draw sources and unsafe timestamps", () => {
    expect(() => derbyRandomIndex(0)).toThrow();
    expect(() => derbyRandomIndex(2, () => -1)).toThrow();
    expect(() => createDerbyRound(roster(), now, () => 1002)).toThrow();
    expect(() => createDerbyRound(roster(), NaN)).toThrow();
    expect(() => createDerbyRound(roster(), Number.MAX_SAFE_INTEGER)).toThrow();
  });
});
