/**
 * Date helpers that work on plain "YYYY-MM-DD" strings (no time zones involved),
 * so a post planned for Mon 19 Oct is on Mon 19 Oct everywhere.
 */

const DAY_MS = 86_400_000;

export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function fmtDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return fmtDay(new Date(parseDay(day).getTime() + n * DAY_MS));
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const d = parseDay(day);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return addDays(day, -dow);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY_MS);
}

export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return fmtDay(new Date());
  }
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function weekdayShort(day: string): string {
  return WEEKDAYS[parseDay(day).getUTCDay()];
}

export function monthShort(day: string): string {
  return MONTHS[parseDay(day).getUTCMonth()];
}

export function dayOfMonth(day: string): number {
  return parseDay(day).getUTCDate();
}

/** "Mon 19 Oct" */
export function labelDay(day: string): string {
  return `${weekdayShort(day)} ${dayOfMonth(day)} ${monthShort(day)}`;
}

/** "19–25 Oct" or "26 Oct – 1 Nov" */
export function labelRange(start: string, end: string): string {
  const s = parseDay(start);
  const e = parseDay(end);
  if (s.getUTCMonth() === e.getUTCMonth()) return `${s.getUTCDate()}–${e.getUTCDate()} ${MONTHS[s.getUTCMonth()]}`;
  return `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} – ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`;
}

/** "19:30" -> "7:30 PM" */
export function label12h(time: string | null | undefined): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const d = Math.round(hr / 24);
  return `${d} d ago`;
}

export function weeksOf(start: string, count: number): { start: string; end: string; days: string[] }[] {
  const out: { start: string; end: string; days: string[] }[] = [];
  const first = weekStart(start);
  for (let w = 0; w < count; w++) {
    const s = addDays(first, w * 7);
    out.push({ start: s, end: addDays(s, 6), days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) });
  }
  return out;
}
