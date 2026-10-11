import { PASSAGES, type RaceLanguage } from "./passages";

export const PASSAGE_TIME_ZONE = "America/Mexico_City";
export const DAILY_PASSAGE_COUNT = 3;
const DAY_MS = 86400000;

export function passageDay(now: number): { key: string; number: number } {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: PASSAGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value ?? "0";
  const year = part("year"),
    month = part("month"),
    day = part("day");
  return {
    key: `${year}-${month}-${day}`,
    number: Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / DAY_MS),
  };
}

// Disjoint day groups also prevent next-day repeats when teammates create a fresh room.
export function dailyPassages(language: RaceLanguage, now: number): readonly string[] {
  const bank = PASSAGES[language];
  const groups = Math.floor(bank.length / DAILY_PASSAGE_COUNT);
  if (groups < 2 || bank.length % DAILY_PASSAGE_COUNT !== 0)
    throw new Error("Passage banks must contain complete daily groups.");
  const offset = (((passageDay(now).number % groups) + groups) % groups) * DAILY_PASSAGE_COUNT;
  return bank.slice(offset, offset + DAILY_PASSAGE_COUNT);
}

export function selectPassage(
  language: RaceLanguage,
  now: number,
  previousDay: string,
  previousHistory: readonly string[],
  random: number,
): { passage: string; day: string; history: string[] } {
  const day = `${language}:${passageDay(now).key}`;
  const choices = dailyPassages(language, now);
  let history = previousDay === day ? previousHistory.filter((item) => choices.includes(item)) : [];
  let remaining = choices.filter((item) => !history.includes(item));
  if (!remaining.length) {
    history = [];
    remaining = [...choices];
  }
  // Even after exhausting today's deck, avoid immediately repeating its last item.
  const last = previousDay === day ? previousHistory.at(-1) : undefined;
  const candidates = remaining.filter((item) => item !== last);
  const pool = candidates.length ? candidates : remaining;
  const passage = pool[random % pool.length];
  if (!passage) throw new Error("No passage available.");
  return { passage, day, history: [...history, passage] };
}
