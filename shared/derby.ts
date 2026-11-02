import { z } from "zod";
import { CHARACTER_IDS, type CharacterId } from "./characters";

export const DERBY_MAX_PARTICIPANTS = 25;
export const DERBY_COUNTDOWN_MS = 3000;
export const DERBY_RACE_MS = 18000;
export const DERBY_TTL_MS = 2 * 60 * 60 * 1000;
const DURATION_STEP_MS = 500;
const WEIGHT_COUNT = 8;

export const DERBY_TEAM = [
  { name: "Sam", characterId: "sunbeam" },
  { name: "Gary", characterId: "scout" },
  { name: "Wil", characterId: "clover" },
  { name: "Kate", characterId: "juno" },
  { name: "Devan", characterId: "ember" },
  { name: "Gerardo", characterId: "sol" },
  { name: "Fabián", characterId: "rio" },
  { name: "Emanuel Medrano", characterId: "moss" },
  { name: "Arath", characterId: "orbit" },
] as const satisfies readonly { name: string; characterId: CharacterId }[];

const identifierSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
export const derbyParticipantSchema = z.strictObject({
  id: identifierSchema,
  name: z.string().trim().min(1).max(24),
  characterId: z.enum(CHARACTER_IDS),
});
export type DerbyParticipant = z.infer<typeof derbyParticipantSchema>;

export const derbyRosterSchema = z
  .array(derbyParticipantSchema)
  .min(2)
  .max(DERBY_MAX_PARTICIPANTS)
  .superRefine((participants, context) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    participants.forEach((participant, index) => {
      if (ids.has(participant.id))
        context.addIssue({ code: "custom", path: [index, "id"], message: "Duplicate racer ID." });
      ids.add(participant.id);
      const name = participant.name.normalize("NFKC").toLowerCase();
      if (names.has(name))
        context.addIssue({
          code: "custom",
          path: [index, "name"],
          message: "Give each participant a different name.",
        });
      names.add(name);
    });
  });

const timestampSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const roundShape = z.strictObject({
  id: identifierSchema,
  participants: derbyRosterSchema,
  winnerId: identifierSchema,
  startAt: timestampSchema,
  finishAt: timestampSchema,
  expiresAt: timestampSchema,
  plans: z
    .array(
      z.strictObject({
        participantId: identifierSchema,
        durationMs: z
          .number()
          .int()
          .min(DERBY_RACE_MS)
          .max(DERBY_RACE_MS + (DERBY_MAX_PARTICIPANTS - 1) * DURATION_STEP_MS),
        weights: z.array(z.number().int().min(500).max(1500)).length(WEIGHT_COUNT),
      }),
    )
    .min(2)
    .max(DERBY_MAX_PARTICIPANTS),
});
export type DerbyRound = z.infer<typeof roundShape>;

function freezeRound(round: DerbyRound): DerbyRound {
  for (const participant of round.participants) Object.freeze(participant);
  for (const plan of round.plans) {
    Object.freeze(plan.weights);
    Object.freeze(plan);
  }
  Object.freeze(round.participants);
  Object.freeze(round.plans);
  return Object.freeze(round);
}

// Saved browser state is untrusted. A restored result must describe one complete, fixed draw.
export const derbyRoundSchema = roundShape
  .superRefine((round, context) => {
    const invalid = (message: string): void => context.addIssue({ code: "custom", message });
    if (
      round.startAt < DERBY_COUNTDOWN_MS ||
      round.finishAt !== round.startAt + DERBY_RACE_MS ||
      round.expiresAt !== round.startAt - DERBY_COUNTDOWN_MS + DERBY_TTL_MS
    )
      invalid("Invalid derby timeline.");
    const participantIds = new Set(round.participants.map((participant) => participant.id));
    const planIds = new Set(round.plans.map((plan) => plan.participantId));
    if (
      round.plans.length !== round.participants.length ||
      planIds.size !== participantIds.size ||
      round.plans.some((plan) => !participantIds.has(plan.participantId))
    )
      invalid("Every participant must have exactly one race plan.");
    const durations = new Set(round.plans.map((plan) => plan.durationMs));
    if (
      durations.size !== round.participants.length ||
      round.participants.some(
        (_, index) => !durations.has(DERBY_RACE_MS + index * DURATION_STEP_MS),
      )
    )
      invalid("Invalid finishing order.");
    const winner = round.plans.find((plan) => plan.durationMs === DERBY_RACE_MS);
    if (!participantIds.has(round.winnerId) || winner?.participantId !== round.winnerId)
      invalid("The opening speaker must match the saved winning plan.");
  })
  .transform(freezeRound);

function uint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

// Rejection sampling keeps all eligible indices equally likely, without modulo bias.
export function derbyRandomIndex(count: number, draw: () => number = uint32): number {
  if (!Number.isInteger(count) || count < 1 || count > 0x100000000)
    throw new RangeError("Invalid derby draw size.");
  const limit = 0x100000000 - (0x100000000 % count);
  let value: number;
  do {
    value = draw();
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
      throw new RangeError("Invalid derby random value.");
  } while (value >= limit);
  return value % count;
}

export function createDerbyRound(
  participants: readonly DerbyParticipant[],
  now = Date.now(),
  randomIndex: (count: number) => number = derbyRandomIndex,
): DerbyRound {
  const roster = derbyRosterSchema.parse(participants);
  if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - DERBY_TTL_MS)
    throw new RangeError("Invalid derby start time.");
  const draw = (count: number): number => {
    const index = randomIndex(count);
    if (!Number.isInteger(index) || index < 0 || index >= count)
      throw new RangeError("Invalid derby draw index.");
    return index;
  };
  const order = roster.map((participant) => participant.id);
  for (let index = order.length - 1; index > 0; index--) {
    const other = draw(index + 1);
    [order[index], order[other]] = [order[other]!, order[index]!];
  }
  return derbyRoundSchema.parse({
    id: crypto.randomUUID(),
    participants: roster,
    winnerId: order[0]!,
    startAt: now + DERBY_COUNTDOWN_MS,
    finishAt: now + DERBY_COUNTDOWN_MS + DERBY_RACE_MS,
    expiresAt: now + DERBY_TTL_MS,
    plans: order.map((participantId, index) => ({
      participantId,
      durationMs: DERBY_RACE_MS + index * DURATION_STEP_MS,
      weights: Array.from({ length: WEIGHT_COUNT }, () => 500 + draw(1001)),
    })),
  });
}

export function derbyPhase(round: DerbyRound, now: number): "countdown" | "racing" | "finished" {
  return now < round.startAt ? "countdown" : now < round.finishAt ? "racing" : "finished";
}

export function derbyExpired(round: DerbyRound, now = Date.now()): boolean {
  return now >= round.expiresAt;
}

export function derbyPosition(round: DerbyRound, participantId: string, now: number): number {
  const plan = round.plans.find((candidate) => candidate.participantId === participantId);
  if (!plan || !Number.isFinite(now)) return 0;
  // The winner's finish freezes the entire field, including later visits and refreshes.
  const elapsed = Math.max(0, Math.min(now, round.finishAt) - round.startAt);
  const fraction = Math.min(1, elapsed / plan.durationMs);
  const step = fraction * plan.weights.length;
  const complete = Math.min(plan.weights.length, Math.floor(step));
  let travelled = 0;
  for (let index = 0; index < complete; index++) travelled += plan.weights[index]!;
  if (complete < plan.weights.length) travelled += plan.weights[complete]! * (step - complete);
  return Math.min(1, Math.max(0, travelled / plan.weights.reduce((sum, value) => sum + value, 0)));
}
