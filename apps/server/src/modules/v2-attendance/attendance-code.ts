import { createHash } from 'node:crypto';

export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');

export const normalizeBssid = (value: string) =>
  value.trim().replace(/-/g, ':').toLowerCase();

export function shiftBounds(
  workDate: Date,
  shift: { startsAt: string; endsAt: string; spansNextDay: boolean }
) {
  const date = workDate.toISOString().slice(0, 10);
  const starts = Date.parse(`${date}T${shift.startsAt}:00+08:00`);
  const ends =
    Date.parse(`${date}T${shift.endsAt}:00+08:00`) +
    (shift.spansNextDay ? 86_400_000 : 0);
  return { starts, ends };
}

export function isClockInTime(
  workDate: Date,
  shift: Parameters<typeof shiftBounds>[1],
  earlyMinutes: number,
  now: number
) {
  const { starts, ends } = shiftBounds(workDate, shift);
  return now >= starts - earlyMinutes * 60_000 && now < ends;
}
