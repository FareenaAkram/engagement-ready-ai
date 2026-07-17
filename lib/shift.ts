/**
 * Real shift scheduling — computed from the actual clock, not a hardcoded string.
 * Three fixed 8-hour shifts per day. No configuration UI yet; this is the single
 * source of truth for "what shift is it right now" everywhere in the app.
 */

export interface ShiftWindow {
  name: 'Shift A' | 'Shift B' | 'Shift C';
  startsAt: Date;
  endsAt: Date;
}

const SHIFT_STARTS: Array<{ name: ShiftWindow['name']; startHour: number }> = [
  { name: 'Shift A', startHour: 6 },
  { name: 'Shift B', startHour: 14 },
  { name: 'Shift C', startHour: 22 },
];

export function getCurrentShift(now: Date = new Date()): ShiftWindow {
  const hour = now.getHours();

  // The active shift is the one with the greatest startHour <= current hour;
  // before 6am, that's still yesterday's Shift C (wraps past midnight).
  let active = SHIFT_STARTS[SHIFT_STARTS.length - 1];
  for (const candidate of SHIFT_STARTS) {
    if (hour >= candidate.startHour) active = candidate;
  }

  const startsAt = new Date(now);
  startsAt.setHours(active.startHour, 0, 0, 0);
  if (hour < active.startHour) {
    startsAt.setDate(startsAt.getDate() - 1);
  }

  const endsAt = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000);
  return { name: active.name, startsAt, endsAt };
}

/** Stable id for "which shift cycle is this" — used to detect a review has gone stale. */
export function getShiftId(now: Date = new Date()): string {
  const shift = getCurrentShift(now);
  const dateKey = shift.startsAt.toISOString().slice(0, 10);
  return `${dateKey}-${shift.name.replace(' ', '')}`;
}

export function formatShiftLabel(now: Date = new Date()): string {
  const shift = getCurrentShift(now);
  const minutesRemaining = Math.max(0, Math.round((shift.endsAt.getTime() - now.getTime()) / 60_000));
  const hours = Math.floor(minutesRemaining / 60);
  const minutes = minutesRemaining % 60;
  const remaining = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return `${shift.name} • Ends in ${remaining}`;
}
