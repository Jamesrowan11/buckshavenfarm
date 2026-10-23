// Time zone handling.
//
// Timestamps (created_at, clock-ins, sessions) are stored in UTC. Calendar
// values — "today", shift dates, feeding-log dates — are farm-local, in
// APP_TIME_ZONE (default America/New_York; the farm is in Clarksville, MD).
// Everything rendered on the server is formatted in that zone too, so pages
// look the same no matter what time zone the Plesk server itself uses.

const DEFAULT_TIME_ZONE = "America/New_York";

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function appTimeZone(): string {
  const tz = process.env.APP_TIME_ZONE?.trim();
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

/** 'YYYY-MM-DD' for the given instant in the farm's time zone. */
export function localDate(at: Date = new Date(), tz: string = appTimeZone()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function todayLocal(): string {
  return localDate();
}

/** Adds whole days to a 'YYYY-MM-DD' string (pure calendar arithmetic). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday for a 'YYYY-MM-DD' string. */
function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The seven dates (Mon–Sun) of the week containing `date`, offset by N weeks. */
export function weekDates(date: string = todayLocal(), offsetWeeks = 0): string[] {
  const monday = addDays(date, -((weekday(date) + 6) % 7) + offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** The Monday after the current week. */
export function nextMonday(date: string = todayLocal()): string {
  return weekDates(date, 1)[0];
}

/** Milliseconds the zone is ahead of UTC at instant `t`. */
function zoneOffsetMs(t: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - (t - (t % 1000));
}

/** The UTC instant of local midnight at the start of `date` in the zone. */
export function startOfLocalDayUtc(date: string, tz: string = appTimeZone()): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - zoneOffsetMs(guess, tz);
  // Re-evaluate once in case a DST change falls between guess and t.
  t = guess - zoneOffsetMs(t, tz);
  return new Date(t);
}

/** Date + time of a UTC instant, in the farm's zone (e.g. "5/1/2026, 7:04:12 AM"). */
export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("en-US", { timeZone: appTimeZone() });
}

/** Date of a UTC instant in the farm's zone. */
export function formatInstantDate(value: string | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(value).toLocaleDateString("en-US", { ...opts, timeZone: appTimeZone() });
}

/** Formats a calendar date ('YYYY-MM-DD') without any time zone shift. */
export function formatCalendarDate(date: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

/** 'HH:MM' from a TIME value ('HH:MM:SS'). */
export function hhmm(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : "";
}
