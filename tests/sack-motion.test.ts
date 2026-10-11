import { describe, expect, it } from "vitest";
import { advanceSackMotion, hopTarget, parkedSack, sackNeedsFrame } from "../src/sack-motion";

describe("sack jumps follow correct character pairs", () => {
  it("waits for two characters, visits every pose, lands and stops", () => {
    let motion = parkedSack();
    motion = advanceSackMotion(motion, 1, 16, 240);
    expect(motion.current).toBe(0);
    expect(sackNeedsFrame(motion, 1, 240)).toBe(false);
    const frames = new Set<number>();
    let peak = 0;
    for (let tick = 0; tick < 24; tick++) {
      motion = advanceSackMotion(motion, 2, 16, 240);
      frames.add(motion.frame);
      peak = Math.max(peak, motion.lift);
      expect(motion.current).toBeGreaterThanOrEqual(0);
      expect(motion.current).toBeLessThanOrEqual(2);
    }
    expect([...frames].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(peak).toBeGreaterThan(0.98);
    expect(motion).toEqual(parkedSack(2));
    expect(sackNeedsFrame(motion, 3, 240)).toBe(false);
  });

  it("never invents progress, cancels a corrected jump, and recovers late updates promptly", () => {
    let motion = advanceSackMotion(parkedSack(), 2, 64, 240);
    motion = advanceSackMotion(motion, 1, 16, 240);
    expect(motion).toEqual(parkedSack(0));
    for (let tick = 0; tick < 50; tick++) {
      motion = advanceSackMotion(motion, 200, 16, 240);
      expect(motion.current).toBeLessThanOrEqual(200);
    }
    expect(motion).toEqual(parkedSack(200));
    expect(advanceSackMotion(motion, 200, 60000, 240)).toEqual(motion);
    expect(parkedSack(200).lift).toBe(0);
  });

  it("is time based at different frame rates and allows an odd final character", () => {
    let fast = parkedSack();
    let slow = parkedSack();
    for (let tick = 0; tick < 10; tick++) fast = advanceSackMotion(fast, 2, 10, 241);
    for (let tick = 0; tick < 5; tick++) slow = advanceSackMotion(slow, 2, 20, 241);
    expect(fast.current).toBeCloseTo(slow.current, 10);
    expect(fast.lift).toBeCloseTo(slow.lift, 10);
    expect(hopTarget(239, 241)).toBe(238);
    expect(hopTarget(241, 241)).toBe(241);
    let final = parkedSack(240);
    for (let tick = 0; tick < 30; tick++) final = advanceSackMotion(final, 241, 16, 241);
    expect(final).toEqual(parkedSack(241));
    const reducedPosition = parkedSack(3);
    expect(sackNeedsFrame(reducedPosition, 3, 241)).toBe(false);
    expect(advanceSackMotion(reducedPosition, 3, 16, 241)).toEqual(reducedPosition);
  });
});
