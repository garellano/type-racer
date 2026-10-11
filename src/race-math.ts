import { TRACK_METERS } from "../shared/protocol";

export const VIEW_RADIUS_METERS = 50;
export const VIEW_SPAN_METERS = VIEW_RADIUS_METERS * 2;

export function progressMeters(characters: number, passageLength: number): number {
  return passageLength > 0
    ? Math.max(0, Math.min(1, characters / passageLength)) * TRACK_METERS
    : 0;
}

export function cameraWindow(focus: number): { start: number; end: number } {
  return { start: focus - VIEW_RADIUS_METERS, end: focus + VIEW_RADIUS_METERS };
}

export function cameraPosition(distance: number, focus: number): number {
  return (distance - focus + VIEW_RADIUS_METERS) / VIEW_SPAN_METERS;
}

export function radarWindow(focus: number): { left: number; width: number } {
  const view = cameraWindow(focus);
  const left = Math.max(0, view.start) / TRACK_METERS;
  const right = Math.min(TRACK_METERS, view.end) / TRACK_METERS;
  return { left, width: Math.max(0, right - left) };
}

// Time-based damping behaves consistently at different display refresh rates.
// It approaches known positions without predicting distance beyond a received target.
export function approachDistance(
  current: number,
  target: number,
  elapsedMs: number,
  responseMs: number,
): number {
  if (responseMs <= 0 || Math.abs(target - current) < 0.005) return target;
  return current + (target - current) * (1 - Math.exp(-Math.max(0, elapsedMs) / responseMs));
}

export function elapsedLabel(milliseconds: number): string {
  const tenths = Math.floor(Math.max(0, milliseconds) / 100);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;
}
