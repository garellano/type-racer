import { describe, expect, it } from "vitest";
import { DERBY_TEAM, type DerbyParticipant } from "../shared/derby";
import {
  HOT_MIC_MAX_PARTICIPANTS,
  HOT_MIC_ROUND_MS,
  HOT_MIC_TTL_MS,
  createHotMicRound,
  hotMicExpired,
  hotMicRosterSchema,
  hotMicRoundSchema,
  hotMicSample,
  type HotMicRound,
} from "../shared/hot-mic";

const now = 1_800_000_000_000;
function roster(count = 3): DerbyParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `attendee-${index}`,
    name: DERBY_TEAM[index % DERBY_TEAM.length]!.name + (index >= 9 ? ` ${index}` : ""),
    characterId: DERBY_TEAM[index % DERBY_TEAM.length]!.characterId,
  }));
}
function mutable(round: HotMicRound): HotMicRound {
  return JSON.parse(JSON.stringify(round)) as HotMicRound;
}

describe("Hot Mic draws and recovery", () => {
  it("uses its first random draw to give each attendee one equally sized winning slot", () => {
    for (let winner = 0; winner < 9; winner++) {
      let first = true;
      const round = createHotMicRound(roster(9), now, (count) => {
        if (first) {
          first = false;
          expect(count).toBe(9);
          return winner;
        }
        return 0;
      });
      expect(round.winnerId).toBe(`attendee-${winner}`);
      expect(round.segments.at(-1)!.toId).toBe(round.winnerId);
    }
  });

  it.each(Array.from({ length: 8 }, (_, index) => index + 2))(
    "builds a continuous %i-attendee plan with two false pauses and one final handoff",
    (count) => {
      for (const draw of [(size: number) => size - 1, () => 0]) {
        const round = createHotMicRound(roster(count), now, draw);
        let previous: string | null = null;
        let duration = 0;
        for (const segment of round.segments) {
          expect(segment.fromId).toBe(previous);
          expect(round.participants.some((person) => person.id === segment.toId)).toBe(true);
          if (segment.kind === "pass") expect(segment.toId).not.toBe(segment.fromId);
          else expect(segment.toId).toBe(segment.fromId);
          previous = segment.toId;
          duration += segment.durationMs;
        }
        expect(duration).toBe(HOT_MIC_ROUND_MS);
        expect(round.segments.filter((segment) => segment.cue === "suspense")).toHaveLength(2);
        expect(round.segments.at(-1)!.kind).toBe("pass");
        expect(round.segments.at(-1)!.fromId).not.toBe(round.winnerId);
        expect(previous).toBe(round.winnerId);
      }
    },
  );

  it("copies and freezes attendees, character choices, handoffs and the result", () => {
    const attendees = roster();
    const round = createHotMicRound(attendees, now);
    attendees[0]!.name = "Changed later";
    attendees[0]!.characterId = "orbit";
    attendees.pop();
    expect(round.participants).toHaveLength(3);
    expect(round.participants[0]).toMatchObject({ name: "Sam", characterId: "sunbeam" });
    for (const value of [
      round,
      round.participants,
      round.participants[0],
      round.segments,
      ...round.segments,
    ])
      expect(Object.isFrozen(value)).toBe(true);
  });

  it("samples exact segment boundaries, clamps before start, and freezes at the final recipient", () => {
    const round = createHotMicRound(roster(), now);
    expect(hotMicSample(round, now - 1000)).toMatchObject({
      phase: "passing",
      segmentIndex: 0,
      fromId: null,
      progress: 0,
      cue: "opening",
    });
    let start = now;
    round.segments.forEach((segment, index) => {
      expect(hotMicSample(round, start)).toMatchObject({
        phase: "passing",
        segmentIndex: index,
        fromId: segment.fromId,
        toId: segment.toId,
        progress: 0,
        cue: segment.cue,
      });
      expect(hotMicSample(round, start + segment.durationMs / 2).progress).toBeCloseTo(0.5);
      start += segment.durationMs;
    });
    expect(start).toBe(round.finishAt);
    const finished = hotMicSample(round, round.finishAt);
    expect(finished).toMatchObject({
      phase: "finished",
      toId: round.winnerId,
      progress: 1,
      cue: "finished",
    });
    expect(hotMicSample(round, round.finishAt + 60_000)).toEqual(finished);
    for (const invalid of [NaN, Infinity, -Infinity])
      expect(hotMicSample(round, invalid)).toEqual(hotMicSample(round, now));
  });

  it("recovers the same winner and current handoff from validated storage without drawing again", () => {
    const round = createHotMicRound(roster(9), now);
    const restored = hotMicRoundSchema.parse(mutable(round));
    expect(restored).toEqual(round);
    for (const time of [now, now + 5800, now + 10_000, round.finishAt, round.finishAt + 10_000])
      expect(hotMicSample(restored, time)).toEqual(hotMicSample(round, time));
  });

  it("expires exactly two hours after creation", () => {
    const round = createHotMicRound(roster(), now);
    expect(round.expiresAt).toBe(now + HOT_MIC_TTL_MS);
    expect(hotMicExpired(round, round.expiresAt - 1)).toBe(false);
    expect(hotMicExpired(round, round.expiresAt)).toBe(true);
  });
});

describe("Hot Mic untrusted state", () => {
  it("limits active attendees to 2–9 unique IDs and normalized names", () => {
    expect(HOT_MIC_MAX_PARTICIPANTS).toBe(9);
    expect(hotMicRosterSchema.safeParse(roster(1)).success).toBe(false);
    expect(hotMicRosterSchema.safeParse(roster(10)).success).toBe(false);
    expect(
      hotMicRosterSchema.safeParse([roster()[0], { ...roster()[1], id: "attendee-0" }]).success,
    ).toBe(false);
    expect(
      hotMicRosterSchema.safeParse([roster()[0], { ...roster()[1], name: "  ＳＡＭ  " }]).success,
    ).toBe(false);
    expect(
      hotMicRosterSchema.safeParse([roster()[0], { ...roster()[1], characterId: "unknown" }])
        .success,
    ).toBe(false);
  });

  it("allows every attendee to choose any existing character", () => {
    const attendees = roster();
    attendees[0]!.characterId = "juno";
    attendees[1]!.characterId = "juno";
    expect(
      createHotMicRound(attendees, now)
        .participants.slice(0, 2)
        .map((person) => person.characterId),
    ).toEqual(["juno", "juno"]);
  });

  it("rejects unknown holders, discontinuous passes and same-person passes", () => {
    const base = createHotMicRound(roster(), now);
    const foreign = mutable(base);
    foreign.segments[0]!.toId = "absent";
    const discontinuous = mutable(base);
    discontinuous.segments[1]!.fromId = null;
    const same = mutable(base);
    same.segments[2]!.toId = same.segments[2]!.fromId!;
    const changedHold = mutable(base);
    changedHold.segments[1]!.toId = base.participants.find(
      (person) => person.id !== changedHold.segments[1]!.fromId,
    )!.id;
    for (const value of [foreign, discontinuous, same, changedHold])
      expect(hotMicRoundSchema.safeParse(value).success).toBe(false);
  });

  it("rejects a result that disagrees with its final handoff", () => {
    const round = mutable(createHotMicRound(roster(), now));
    round.winnerId = round.participants.find((person) => person.id !== round.winnerId)!.id;
    expect(hotMicRoundSchema.safeParse(round).success).toBe(false);
  });

  it("rejects incomplete, extended or retimed plans, changed cues and invalid timestamps", () => {
    const base = createHotMicRound(roster(), now);
    const missing = mutable(base);
    missing.segments.pop();
    const extra = mutable(base);
    extra.segments.push({ ...extra.segments[0]! });
    const duration = mutable(base);
    duration.segments[0]!.durationMs++;
    const cue = mutable(base);
    cue.segments[0]!.cue = "suspense";
    const end = mutable(base);
    end.finishAt++;
    const expiry = mutable(base);
    expiry.expiresAt++;
    const unsafe = mutable(base);
    unsafe.startAt = Number.MAX_SAFE_INTEGER;
    for (const value of [missing, extra, duration, cue, end, expiry, unsafe])
      expect(hotMicRoundSchema.safeParse(value).success).toBe(false);
  });

  it("rejects invalid draw indices and unsafe creation timestamps", () => {
    for (const value of [-1, 3, 0.5, NaN, Infinity])
      expect(() => createHotMicRound(roster(), now, () => value)).toThrow();
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])
      expect(() => createHotMicRound(roster(), value)).toThrow();
    let first = true;
    expect(() =>
      createHotMicRound(roster(), now, (count) => {
        if (first) {
          first = false;
          return 0;
        }
        return count;
      }),
    ).toThrow();
  });
});
