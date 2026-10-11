import { describe, expect, it } from "vitest";
import { CHARACTERS, CHARACTER_IDS, chooseCharacter, teamCharacter } from "../shared/characters";
import { createSchema, clientMessageSchema, snapshotSchema } from "../shared/protocol";

describe("fictional sack characters", () => {
  it("provides nine distinct characters and the team-requested presets", () => {
    const team = [
      "Sam",
      "Gary",
      "Wil",
      "Kate",
      "Devan",
      "Gerardo",
      "Fabián",
      "Emanuel Medrano",
      "Arath",
    ];
    expect(team.map((name) => chooseCharacter(name))).toEqual(CHARACTER_IDS);
    expect(new Set(CHARACTERS.map((item) => item.color)).size).toBe(9);
    expect(teamCharacter("  FABIÁN Smith ")).toBe("rio");
    expect(teamCharacter("Alex")).toBeUndefined();
    expect(chooseCharacter("New teammate", ["sunbeam", "scout"])).toBe("clover");
  });

  it("accepts legacy room creation and rejects unsupported modes and characters", () => {
    expect(createSchema.parse({ name: "Host" }).mode).toBe("cars");
    expect(createSchema.safeParse({ name: "Host", mode: "boats" }).success).toBe(false);
    expect(
      clientMessageSchema.safeParse({ type: "character", characterId: "unknown" }).success,
    ).toBe(false);
    expect(clientMessageSchema.safeParse({ type: "configure" }).success).toBe(false);
    expect(snapshotSchema.shape.mode.parse(undefined)).toBe("cars");
    expect(clientMessageSchema.safeParse({ type: "configure", language: "spanish" }).success).toBe(
      true,
    );
  });
});
