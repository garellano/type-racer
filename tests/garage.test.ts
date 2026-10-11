import { describe, expect, it } from "vitest";
import { MAX_PLAYERS } from "../shared/protocol";
import { CAR_MODELS, carAppearance } from "../src/garage";

describe("shared race garage", () => {
  it("keeps at least five distinct model assets available", () => {
    expect(CAR_MODELS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(CAR_MODELS.map((model) => model.asset)).size).toBe(CAR_MODELS.length);
  });

  it("uses different models before repeating and different paint for every racer", () => {
    for (const seed of ["lobby-room", "first-round", "second-round", "restored-round"]) {
      for (let count = 2; count <= MAX_PLAYERS; count++) {
        const field = Array.from({ length: count }, (_, slot) => carAppearance(slot, seed));
        expect(new Set(field.map((item) => item.model.id)).size).toBe(
          Math.min(count, CAR_MODELS.length),
        );
        expect(new Set(field.map((item) => item.paint.color)).size).toBe(count);
      }
    }
  });

  it("restores the same models and paint from shared identity regardless of rank or own player", () => {
    const before = Array.from({ length: MAX_PLAYERS }, (_, slot) =>
      carAppearance(slot, "shared-race"),
    );
    const after = Array.from({ length: MAX_PLAYERS }, (_, slot) =>
      carAppearance(slot, "shared-race"),
    );
    expect(after).toEqual(before);
    const rounds = new Set(
      Array.from({ length: 30 }, (_, round) => carAppearance(0, `round-${round}`).model.id),
    );
    expect(rounds.size).toBe(CAR_MODELS.length);
  });
});
