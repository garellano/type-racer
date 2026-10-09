import { z } from "zod";
import { RACE_LANGUAGES } from "./passages";

export const MAX_PLAYERS = 8;
export const COUNTDOWN_MS = 5000;
export const RACE_TIMEOUT_MS = 90000;
export const ROOM_LIFETIME_MS = 2 * 60 * 60 * 1000;
export const UPDATE_INTERVAL_MS = 100;
export const MAX_MESSAGE_BYTES = 2048;
export const TRACK_METERS = 300;

export const languageSchema = z.enum(RACE_LANGUAGES);
export const roomIdSchema = z.uuid();
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[\p{L}\p{N} ._'-]+$/u);
export const sessionSchema = z.object({ playerId: z.uuid(), secret: z.uuid() }).strict();
export type Session = z.infer<typeof sessionSchema>;
export const entrySchema = z.object({ name: nameSchema }).strict();
export const joinSchema = z.union([entrySchema, z.object({ session: sessionSchema }).strict()]);
export const admissionSchema = z.object({ roomId: roomIdSchema, session: sessionSchema });
export type Admission = z.infer<typeof admissionSchema>;

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), session: sessionSchema }).strict(),
  z.object({ type: z.literal("ping"), sentAt: z.number().finite() }).strict(),
  z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
  z.object({ type: z.literal("configure"), language: languageSchema }).strict(),
  z.object({ type: z.literal("start") }).strict(),
  z.object({ type: z.literal("reset") }).strict(),
  z.object({ type: z.literal("leave") }).strict(),
  z
    .object({
      type: z.literal("progress"),
      raceId: z.uuid(),
      sequence: z.int().min(1),
      text: z.string().max(500),
    })
    .strict(),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const playerSchema = z.object({
  id: z.uuid(),
  name: nameSchema,
  ready: z.boolean(),
  connected: z.boolean(),
  progress: z.int().min(0).max(500),
  sequence: z.int().min(0),
});
export type Player = z.infer<typeof playerSchema>;
export const snapshotSchema = z.object({
  roomId: roomIdSchema,
  version: z.int().min(0),
  serverNow: z.number(),
  phase: z.enum(["lobby", "countdown", "racing", "finished"]),
  hostId: z.uuid(),
  raceId: z.uuid().nullable(),
  startAt: z.number().nullable(),
  deadline: z.number().nullable(),
  winnerId: z.uuid().nullable(),
  finishAt: z.number().nullable(),
  outcome: z.enum(["completed", "timeout"]).nullable(),
  // Existing stored rooms and older snapshots predate language selection.
  language: languageSchema.default("english"),
  passage: z.string(),
  expiresAt: z.number(),
  players: z.array(playerSchema).max(MAX_PLAYERS),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), state: snapshotSchema }),
  z.object({ type: z.literal("pong"), sentAt: z.number(), serverNow: z.number() }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export function correctPrefix(text: string, passage: string): number {
  let index = 0;
  while (index < text.length && text[index] === passage[index]) index++;
  return index;
}

export function rankPlayers(players: readonly Player[]): Player[] {
  return [...players].sort((a, b) => b.progress - a.progress || a.id.localeCompare(b.id));
}
