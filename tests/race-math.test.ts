import { describe, expect, it } from "vitest";
import {
  approachDistance,
  cameraPosition,
  cameraWindow,
  elapsedLabel,
  progressMeters,
  radarWindow,
} from "../src/race-math";

describe("personal race camera", () => {
  it("keeps 50 meters on both sides, including before the grid and beyond the finish", () => {
    for (const focus of [0, 5, 50, 150, 299, 300]) {
      expect(cameraWindow(focus)).toEqual({ start: focus - 50, end: focus + 50 });
      expect(cameraPosition(focus, focus)).toBe(0.5);
      expect(cameraPosition(focus - 50, focus)).toBe(0);
      expect(cameraPosition(focus + 50, focus)).toBe(1);
    }
    expect(cameraPosition(40, 150)).toBeLessThan(0);
    expect(cameraPosition(230, 150)).toBeGreaterThan(1);
  });

  it("clips only the radar's camera window to the actual track", () => {
    expect(radarWindow(0).left).toBe(0);
    expect(radarWindow(0).width).toBeCloseTo(1 / 6);
    expect(radarWindow(150).left).toBeCloseTo(1 / 3);
    expect(radarWindow(150).width).toBeCloseTo(1 / 3);
    expect(radarWindow(300).left).toBeCloseTo(5 / 6);
    expect(radarWindow(300).width).toBeCloseTo(1 / 6);
  });

  it("maps confirmed characters to bounded meters and permits deletion", () => {
    expect(progressMeters(120, 240)).toBe(150);
    expect(progressMeters(240, 240)).toBe(300);
    expect(progressMeters(250, 240)).toBe(300);
    expect(progressMeters(-1, 240)).toBe(0);
    expect(progressMeters(0, 240)).toBe(0);
    expect(progressMeters(1, 0)).toBe(0);
  });
});

describe("race motion", () => {
  it("has the same response across different frame rates", () => {
    let manyFrames = 20;
    for (let frame = 0; frame < 10; frame++) manyFrames = approachDistance(manyFrames, 180, 10, 85);
    expect(manyFrames).toBeCloseTo(approachDistance(20, 180, 100, 85), 10);
  });

  it("never invents distance past a target, including corrections and idle time", () => {
    expect(approachDistance(20, 180, 16, 85)).toBeGreaterThan(20);
    expect(approachDistance(20, 180, 16, 85)).toBeLessThan(180);
    expect(approachDistance(180, 20, 16, 85)).toBeLessThan(180);
    expect(approachDistance(180, 20, 16, 85)).toBeGreaterThan(20);
    expect(approachDistance(180, 180, 60000, 85)).toBe(180);
    expect(approachDistance(20, 180, -10, 85)).toBe(20);
    expect(approachDistance(179.999, 180, 16, 85)).toBe(180);
  });

  it("settles instantly when motion is reduced", () => {
    expect(approachDistance(20, 180, 16, 0)).toBe(180);
  });

  it("formats the shared timer across minute boundaries", () => {
    expect(elapsedLabel(-10)).toBe("0:00.0");
    expect(elapsedLabel(59900)).toBe("0:59.9");
    expect(elapsedLabel(60000)).toBe("1:00.0");
    expect(elapsedLabel(90235)).toBe("1:30.2");
  });
});
