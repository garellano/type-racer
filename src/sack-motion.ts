export type SackMotion = {
  current: number;
  from: number;
  to: number;
  elapsed: number;
  duration: number;
  active: boolean;
  frame: number;
  lift: number;
  tilt: number;
  landing: number;
};

export function parkedSack(current = 0): SackMotion {
  return {
    current,
    from: current,
    to: current,
    elapsed: 0,
    duration: 320,
    active: false,
    frame: 0,
    lift: 0,
    tilt: 0,
    landing: 0,
  };
}

export function hopTarget(characters: number, length: number): number {
  const valid = Math.max(0, Math.min(length, Math.floor(characters)));
  // An odd final character can reach the finish; ordinary hops consume pairs.
  return valid === length ? valid : Math.floor(valid / 2) * 2;
}

export function sackNeedsFrame(motion: SackMotion, characters: number, length: number): boolean {
  return (
    motion.active || motion.current > characters || motion.current < hopTarget(characters, length)
  );
}

export function advanceSackMotion(
  previous: SackMotion,
  characters: number,
  deltaMs: number,
  length: number,
): SackMotion {
  const target = hopTarget(characters, length);
  if (characters < previous.current || (previous.active && target < previous.to))
    return parkedSack(target);
  let motion = previous;
  if (!motion.active) {
    if (target <= motion.current) return parkedSack(motion.current);
    // Recover a delayed network burst without replaying an unbounded animation queue.
    const from =
      target - motion.current > 12 ? Math.max(motion.current, target - 4) : motion.current;
    motion = {
      ...parkedSack(from),
      from,
      to: Math.min(from + 2, target),
      active: true,
      duration: Math.max(120, 320 / (1 + (target - from - 2) / 4)),
    };
  }
  const elapsed = Math.min(motion.duration, motion.elapsed + Math.max(0, Math.min(64, deltaMs)));
  const t = elapsed / motion.duration;
  if (t >= 1) return parkedSack(motion.to);
  const travel = Math.max(0, Math.min(1, (t - 0.12) / 0.7));
  const eased = travel * travel * (3 - 2 * travel);
  const lift = Math.sin(Math.PI * travel);
  const frame = t < 0.12 ? 1 : t < 0.3 ? 2 : t < 0.56 ? 3 : t < 0.82 ? 4 : 5;
  return {
    ...motion,
    elapsed,
    current: motion.from + (motion.to - motion.from) * eased,
    frame,
    lift,
    tilt: -Math.sin(2 * Math.PI * travel) * 3,
    landing: t >= 0.82 ? Math.sin(Math.PI * ((t - 0.82) / 0.18)) : 0,
  };
}
