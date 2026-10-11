import { describe, expect, it } from "vitest";
import { advanceCarMotion, parkedMotion } from "../src/car-motion";

describe("car decorations follow actual travel", () => {
  it("rolls the same amount at different refresh rates and reverses when text is deleted", () => {
    const start = parkedMotion();
    let manyFrames = start;
    for (let frame = 0; frame < 10; frame++) manyFrames = advanceCarMotion(manyFrames, 0.1, 10);
    const oneFrame = advanceCarMotion(start, 1, 100);
    expect(manyFrames.angle).toBeCloseTo(oneFrame.angle, 10);
    expect(manyFrames.speed).toBeCloseTo(oneFrame.speed, 10);
    expect(manyFrames.drive).toBeCloseTo(oneFrame.drive, 10);
    expect(advanceCarMotion(manyFrames, -1, 100).angle).toBeCloseTo(start.angle, 10);
  });

  it("settles fully after stopping without inventing more wheel travel", () => {
    let motion = advanceCarMotion(parkedMotion(), 2, 100);
    const angle = motion.angle;
    for (let frame = 0; frame < 120; frame++) motion = advanceCarMotion(motion, 0, 16);
    expect(motion).toEqual(parkedMotion(angle));
  });

  it("responds to acceleration and braking within gentle bounds", () => {
    const accelerating = advanceCarMotion(parkedMotion(), 2, 100);
    expect(accelerating.pitch).toBeLessThan(0);
    expect(accelerating.brake).toBe(0);
    const braking = advanceCarMotion(accelerating, 0, 100);
    expect(braking.brake).toBeGreaterThan(0);
    expect(braking.pitch).toBeGreaterThan(accelerating.pitch);
    for (const travel of [-300, -1, 0, 1, 300]) {
      const motion = advanceCarMotion(accelerating, travel, 16);
      expect(Math.abs(motion.pitch)).toBeLessThanOrEqual(1.2);
      expect(Math.abs(motion.lift)).toBeLessThanOrEqual(1.1);
      expect(motion.drive).toBeGreaterThanOrEqual(0);
      expect(motion.drive).toBeLessThanOrEqual(1);
    }
  });

  it("keeps wheel phase bounded through repeated forward and backward corrections", () => {
    let motion = parkedMotion();
    for (let frame = 0; frame < 1000; frame++) {
      motion = advanceCarMotion(motion, frame % 2 === 0 ? 300 : -200, 16);
      expect(Math.abs(motion.angle)).toBeLessThan(360);
      expect(Object.values(motion).every(Number.isFinite)).toBe(true);
    }
    expect(advanceCarMotion(motion, 1, 0)).toEqual(motion);
  });
});
