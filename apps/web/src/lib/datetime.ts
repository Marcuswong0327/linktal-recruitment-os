/**
 * Helpers for `<input type="datetime-local">` fields backed by a full
 * `DateTime` column (Interview.interviewDate is the current caller).
 *
 * The wire format is a UTC ISO string; the input's format is wall-clock local
 * time with no zone (`YYYY-MM-DDTHH:mm`). Converting between them has to go
 * through `Date` rather than string-slicing — slicing an ISO string yields the
 * *UTC* date/time, which is the wrong day or hour for any user east or west of
 * UTC once a real time-of-day is involved (this app's users are in UTC+8).
 */

/** Hour roll options, `00`–`23`. */
export const hourOptions: string[] = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, '0'),
);

/**
 * Minute roll options. Only the quarter hours exist as choices — a native
 * `<input type="datetime-local">` can't be narrowed this way (its `step`
 * governs arrow-key stepping only, and Firefox ignores even that), so the roll
 * is a real select whose list simply has nothing else in it.
 */
export const minuteOptions = ['00', '15', '30', '45'];

/** Hour used when a date is picked before any time has been chosen. */
export const DEFAULT_HOUR = '09';

/** Nearest quarter hour, seconds/ms zeroed. `setMinutes` handles the roll into the next hour. */
export function snapToQuarterHour(date: Date): Date {
  const snapped = new Date(date);
  snapped.setMinutes(Math.round(snapped.getMinutes() / 15) * 15, 0, 0);
  return snapped;
}

/** UTC ISO string → `YYYY-MM-DDTHH:mm` in the viewer's own timezone, for a datetime-local input. */
export function toDateTimeInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Date part only (`YYYY-MM-DD`, local) — for comparing a datetime against a date-only field. */
export function toDateOnly(value: string | null | undefined): string {
  return toDateTimeInputValue(value).slice(0, 10);
}

const interviewDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Display form for a booked interview — date *and* time, in the viewer's timezone. */
export function formatInterviewDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : interviewDateTimeFormatter.format(date);
}


/** Splits a stored UTC ISO string into the `YYYY-MM-DD` / `HH` / `mm` local parts the three inputs bind to. */
export function splitDateTimeParts(value: string | null | undefined): {
  date: string;
  hour: string;
  minute: string;
} {
  const local = toDateTimeInputValue(value);
  if (!local) return { date: '', hour: '', minute: '' };
  const [date, time] = local.split('T');
  const [hour, minute] = time.split(':');
  // A value saved before the rolls existed (or a legacy midnight-UTC row, which
  // lands on an arbitrary local minute) need not be on a quarter hour. Snap it
  // so the roll shows the current value as selected instead of blank.
  return { date, hour, minute: nearestMinuteOption(minute) };
}

/** Rounds a `mm` string to the nearest {@link minuteOptions} entry. Wraps `53` → `00`, not off the end. */
function nearestMinuteOption(minute: string): string {
  const parsed = Number(minute);
  if (Number.isNaN(parsed)) return minuteOptions[0];
  return minuteOptions[Math.round(parsed / 15) % 4];
}

/** Combines the three roll values into a UTC ISO string for the API. */
export function joinDateTimeParts(date: string, hour: string, minute: string): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T${hour || DEFAULT_HOUR}:${minute || '00'}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
