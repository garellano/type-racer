import { describe, expect, it } from "vitest";
import { PASSAGES, RACE_LANGUAGES } from "../shared/passages";
import { dailyPassages, passageDay, selectPassage } from "../shared/passage-selection";

describe("daily typing challenges", () => {
  it("contains 24 distinct complete challenges per mode within the protocol limit", () => {
    for (const language of RACE_LANGUAGES) {
      const bank = PASSAGES[language];
      expect(bank).toHaveLength(24);
      expect(new Set(bank).size).toBe(bank.length);
      for (const passage of bank) {
        expect(passage.length).toBeGreaterThanOrEqual(200);
        expect(passage.length).toBeLessThanOrEqual(300);
        expect(passage).not.toMatch(/[\n\r\t]/);
      }
    }
  });

  it("changes decks at Mexico City midnight, independently of the browser's region", () => {
    const before = Date.parse("2026-10-11T05:59:59Z");
    const after = before + 1000;
    expect(passageDay(before).key).toBe("2026-10-10");
    expect(passageDay(after).key).toBe("2026-10-11");
    expect(passageDay(after).number - passageDay(before).number).toBe(1);
  });

  it.each(RACE_LANGUAGES)(
    "never overlaps consecutive daily decks in %s, including cycle boundaries",
    (language) => {
      const first = Date.parse("2026-10-01T12:00:00Z");
      for (let day = 0; day < 32; day++) {
        const now = first + day * 86400000;
        const today = dailyPassages(language, now);
        const tomorrow = dailyPassages(language, now + 86400000);
        expect(today).toHaveLength(3);
        expect(today.filter((item) => tomorrow.includes(item))).toEqual([]);
        expect(dailyPassages(language, now + 3600000)).toEqual(today);
      }
    },
  );

  it("uses the daily deck before recycling and persists the recent choices without immediate repeats", () => {
    const now = Date.parse("2026-10-10T18:00:00Z");
    let day = "",
      history: string[] = [];
    const seen: string[] = [];
    for (let round = 0; round < 7; round++) {
      const next = selectPassage("java", now, day, history, 0);
      expect(next.passage).not.toBe(seen.at(-1));
      expect(dailyPassages("java", now)).toContain(next.passage);
      seen.push(next.passage);
      day = next.day;
      history = next.history;
    }
    expect(new Set(seen.slice(0, 3)).size).toBe(3);
    const tomorrow = selectPassage("java", now + 86400000, day, history, 0);
    expect(seen).not.toContain(tomorrow.passage);
    expect(tomorrow.history).toHaveLength(1);
    const changed = selectPassage("spanish", now, day, history, 0);
    expect(changed.day).toMatch(/^spanish:/);
    expect(changed.history).toHaveLength(1);
  });
});
