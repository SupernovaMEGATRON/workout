/* Calendar days. A "day" is a local date written "YYYY-MM-DD" — never a UTC timestamp,
   so something logged at 00:30 belongs to the right day in the phone's time zone.
   Such strings sort and compare correctly as plain text. */

const pad = n => String(n).padStart(2, '0');

export const dayOf = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const today = () => dayOf(new Date());

// Noon, so adding days never slips across a daylight-saving change.
export function toDate(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dayOf(toDate(s)) === s;

export function addDays(day, n) {
  const d = toDate(day);
  d.setDate(d.getDate() + n);
  return dayOf(d);
}

// Whole days from a to b (positive when b is later).
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const weekdayIndex = day => (toDate(day).getDay() + 6) % 7;   // Monday = 0 … Sunday = 6

// "Mon 16 Nov" (with the year when it is not the current one), in the phone's language.
export function fmtDay(day) {
  const d = toDate(day);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

// "Today", "Yesterday", "3 days ago", "Tomorrow", "In 3 days".
export function relDay(day) {
  const n = daysBetween(day, today());
  if (n === 0) return 'Today';
  if (n === 1) return 'Yesterday';
  if (n === -1) return 'Tomorrow';
  return n > 0 ? `${n} days ago` : `In ${-n} days`;
}
