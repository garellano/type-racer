import { z } from "zod";
import { derbyParticipantSchema, derbyRandomIndex, type DerbyParticipant } from "./derby";

export const HOT_MIC_MAX_PARTICIPANTS = 9;
export const HOT_MIC_ROUND_MS = 13_000;
export const HOT_MIC_TTL_MS = 2 * 60 * 60 * 1000;

export const hotMicRosterSchema = z
  .array(derbyParticipantSchema)
  .min(2)
  .max(HOT_MIC_MAX_PARTICIPANTS)
  .superRefine((participants, context) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    participants.forEach((participant, index) => {
      if (ids.has(participant.id))
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Duplicate attendee ID.",
        });
      ids.add(participant.id);
      const name = participant.name.normalize("NFKC").toLowerCase();
      if (names.has(name))
        context.addIssue({
          code: "custom",
          path: [index, "name"],
          message: "Give each attendee a different name.",
        });
      names.add(name);
    });
  });

const cueSchema = z.enum(["opening", "passing", "suspense", "again", "final"]);
type PassingCue = z.infer<typeof cueSchema>;
type SegmentTiming = { durationMs: number; kind: "pass" | "hold"; cue: PassingCue };
const pass = (durationMs: number, cue: PassingCue): SegmentTiming => ({
  durationMs,
  kind: "pass",
  cue,
});
const hold = (durationMs: number, cue: PassingCue): SegmentTiming => ({
  durationMs,
  kind: "hold",
  cue,
});

// A fixed, bounded score keeps false pauses unfinished and reserves the last pass for the result.
const TIMELINE: readonly SegmentTiming[] = [
  pass(900, "opening"),
  hold(1015, "opening"),
  ...[750, 620, 520, 440, 360, 310, 270, 235, 205, 180, 160, 145, 140, 140, 140, 140].map(
    (duration) => pass(duration, "passing"),
  ),
  hold(850, "suspense"),
  ...Array.from({ length: 12 }, () => pass(140, "again")),
  hold(1000, "suspense"),
  ...[350, 500, 800, 1150].map((duration) => pass(duration, "final")),
];

const identifierSchema = derbyParticipantSchema.shape.id;
const timestampSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const roundShape = z.strictObject({
  id: identifierSchema,
  participants: hotMicRosterSchema,
  winnerId: identifierSchema,
  startAt: timestampSchema,
  finishAt: timestampSchema,
  expiresAt: timestampSchema,
  segments: z
    .array(
      z.strictObject({
        fromId: identifierSchema.nullable(),
        toId: identifierSchema,
        durationMs: z.number().int().min(1).max(HOT_MIC_ROUND_MS),
        kind: z.enum(["pass", "hold"]),
        cue: cueSchema,
      }),
    )
    .length(TIMELINE.length),
});
export type HotMicRound = z.infer<typeof roundShape>;
export type HotMicSample = {
  phase: "passing" | "finished";
  segmentIndex: number;
  fromId: string | null;
  toId: string;
  progress: number;
  cue: PassingCue | "finished";
};

function freezeRound(round: HotMicRound): HotMicRound {
  round.participants.forEach(Object.freeze);
  round.segments.forEach(Object.freeze);
  Object.freeze(round.participants);
  Object.freeze(round.segments);
  return Object.freeze(round);
}

// Browser storage is untrusted: restore only complete, continuous plans with one final recipient.
export const hotMicRoundSchema = roundShape
  .superRefine((round, context) => {
    const invalid = (message: string): void => context.addIssue({ code: "custom", message });
    if (
      round.finishAt !== round.startAt + HOT_MIC_ROUND_MS ||
      round.expiresAt !== round.startAt + HOT_MIC_TTL_MS
    )
      invalid("Invalid Hot Mic timeline.");
    const ids = new Set(round.participants.map((participant) => participant.id));
    let previous: string | null = null;
    round.segments.forEach((segment, index) => {
      const timing = TIMELINE[index];
      if (
        !timing ||
        segment.durationMs !== timing.durationMs ||
        segment.kind !== timing.kind ||
        segment.cue !== timing.cue
      )
        invalid("Invalid Hot Mic segment timing.");
      if (!ids.has(segment.toId) || (segment.fromId !== null && !ids.has(segment.fromId)))
        invalid("Every microphone holder must be an attendee.");
      if (segment.fromId !== previous) invalid("Microphone passes must form one continuous plan.");
      if (
        (segment.kind === "pass" && segment.fromId === segment.toId) ||
        (segment.kind === "hold" && segment.fromId !== segment.toId)
      )
        invalid("A pass must change holder and a pause must keep its holder.");
      previous = segment.toId;
    });
    if (!ids.has(round.winnerId) || previous !== round.winnerId)
      invalid("The opening speaker must receive the final microphone pass.");
  })
  .transform(freezeRound);

export function createHotMicRound(
  participants: readonly DerbyParticipant[],
  now = Date.now(),
  randomIndex: (count: number) => number = derbyRandomIndex,
): HotMicRound {
  const roster = hotMicRosterSchema.parse(participants);
  if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - HOT_MIC_TTL_MS)
    throw new RangeError("Invalid Hot Mic start time.");
  const draw = (count: number): number => {
    const value = randomIndex(count);
    if (!Number.isInteger(value) || value < 0 || value >= count)
      throw new RangeError("Invalid Hot Mic draw index.");
    return value;
  };

  // Select the result before composing any animation. Every checked attendee has one draw slot.
  const winnerId = roster[draw(roster.length)]!.id;
  let recipient = winnerId;
  const segments: HotMicRound["segments"] = [];
  // Working backwards also guarantees a visible last handoff for a two-person circle.
  for (let index = TIMELINE.length - 1; index >= 0; index--) {
    const timing = TIMELINE[index]!;
    const senders = roster.filter((person) => person.id !== recipient);
    const fromId =
      timing.kind === "hold" ? recipient : index === 0 ? null : senders[draw(senders.length)]!.id;
    segments.unshift({ ...timing, fromId, toId: recipient });
    if (fromId !== null) recipient = fromId;
  }
  return hotMicRoundSchema.parse({
    id: crypto.randomUUID(),
    participants: roster,
    winnerId,
    startAt: now,
    finishAt: now + HOT_MIC_ROUND_MS,
    expiresAt: now + HOT_MIC_TTL_MS,
    segments,
  });
}

export function hotMicExpired(round: HotMicRound, now = Date.now()): boolean {
  return now >= round.expiresAt;
}

export function hotMicSample(round: HotMicRound, now: number): HotMicSample {
  const time = Number.isFinite(now) ? now : round.startAt;
  const elapsed = Math.max(0, time - round.startAt);
  let start = 0;
  for (let index = 0; index < round.segments.length; index++) {
    const segment = round.segments[index]!;
    const end = start + segment.durationMs;
    if (elapsed < end || index === round.segments.length - 1) {
      const finished = time >= round.finishAt;
      return {
        phase: finished ? "finished" : "passing",
        segmentIndex: index,
        fromId: segment.fromId,
        toId: segment.toId,
        progress: Math.max(0, Math.min(1, (elapsed - start) / segment.durationMs)),
        cue: finished ? "finished" : segment.cue,
      };
    }
    start = end;
  }
  throw new Error("A Hot Mic round must contain its fixed passing plan.");
}
