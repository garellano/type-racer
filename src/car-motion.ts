export type CarMotion = {
  angle: number;
  speed: number;
  drive: number;
  pitch: number;
  lift: number;
  brake: number;
};

export function parkedMotion(angle = 0): CarMotion {
  return { angle, speed: 0, drive: 0, pitch: 0, lift: 0, brake: 0 };
}

function blend(current: number, target: number, milliseconds: number, response: number): number {
  return current + (target - current) * (1 - Math.exp(-milliseconds / response));
}

// Wheel travel uses only rendered distance. Suspension may settle briefly after
// typing stops, but neither wheels nor decorative effects can add race progress.
export function advanceCarMotion(
  previous: CarMotion,
  travel: number,
  elapsedMs: number,
): CarMotion {
  if (elapsedMs <= 0) return previous;
  const speed = (travel * 1000) / elapsedMs;
  const angle = (previous.angle + (travel / 3.2) * 360) % 360;
  const drive = blend(previous.drive, Math.min(1, Math.abs(speed) / 8), elapsedMs, 85);
  const pitch = blend(
    previous.pitch,
    Math.max(-1.2, Math.min(1.2, (previous.speed - speed) * 0.055)),
    elapsedMs,
    90,
  );
  const brake = blend(
    previous.brake,
    speed < -0.1 || Math.abs(speed) + 1 < Math.abs(previous.speed)
      ? Math.min(1, Math.abs(previous.speed) / 12)
      : 0,
    elapsedMs,
    80,
  );
  const filteredSpeed = blend(previous.speed, speed, elapsedMs, 75);
  if (
    travel === 0 &&
    Math.abs(filteredSpeed) < 0.05 &&
    drive < 0.01 &&
    Math.abs(pitch) < 0.01 &&
    brake < 0.01
  )
    return parkedMotion(angle);
  return {
    angle,
    speed: filteredSpeed,
    drive,
    pitch,
    lift: Math.sin((angle * Math.PI) / 90) * drive * 1.8,
    brake,
  };
}
