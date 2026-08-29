/**
 * Calendar arithmetic shared by the Age Calculator and Date Difference tools.
 * Pure functions in, plain result objects out, like lib/finance.ts; the pages
 * only hold form state.
 *
 * Every date here is a Date pinned to UTC midnight, and every field is read with
 * a getUTC* accessor. Local midnight would be the obvious alternative and it is
 * wrong twice a year: in a zone that shifts its clocks, two local midnights can
 * be 23 or 25 hours apart, so a subtraction meant to count whole days comes back
 * fractional and a day silently appears or vanishes. UTC midnights are always
 * exactly 86,400,000 ms apart, which is what makes daysBetween below an integer.
 *
 * The calendar difference is a borrow-based subtraction rather than a division:
 * "one month" is 28 to 31 days depending on which month, so the only honest way
 * to say "3 months and 12 days" is to walk the fields, not divide by 30.44.
 */

const MS_PER_DAY = 86_400_000;

/** What an <input type="date"> gives us — a plain YYYY-MM-DD, no timezone. */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days in a 1–12 month; day 0 of the next month is the last of this one. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Reads a date field. Blank, malformed, or a real-looking date that doesn't
 * exist (2025-02-30, which Date would roll forward to March 2) comes back null
 * so the page can show nothing rather than a confidently wrong figure.
 */
export function parseDateInput(value: string): Date | null {
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return new Date(Date.UTC(year, month - 1, day));
}

/** Back to the YYYY-MM-DD a date input wants. */
export function toDateInput(date: Date): string {
  const year = `${date.getUTCFullYear()}`.padStart(4, "0");
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Today's calendar date as seen by the person at the keyboard, moved to UTC
 * midnight. The local fields are read first on purpose: someone in Kolkata just
 * past midnight is on a different date than UTC is, and it's their date they
 * expect an age to be measured against.
 */
export function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Whole days from one date to another; negative if `to` is the earlier one. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export interface DateSpan {
  /** Calendar years, months and days — the "34 years, 3 months, 12 days" form. */
  years: number;
  months: number;
  days: number;
  /** The same gap counted flat. */
  totalDays: number;
  /** years × 12 + months, ignoring the leftover days. */
  totalMonths: number;
  totalWeeks: number;
  /** Days left over after the whole weeks. */
  spareDays: number;
}

/**
 * The gap between two dates, as a calendar span and as flat counts.
 *
 * The two arguments are swapped if they arrive the wrong way round, so every
 * figure is a magnitude — the callers here (an age, a difference) both want the
 * size of the gap and label the direction themselves.
 *
 * The borrow takes its days from the month before `to`, not from a fixed 30:
 * from 31 January to 1 March 2025 is "1 month 1 day" because February had 28
 * days that year, and 29 the next leap year round.
 */
export function dateSpan(a: Date, b: Date): DateSpan {
  const [from, to] = a.getTime() <= b.getTime() ? [a, b] : [b, a];

  let years = to.getUTCFullYear() - from.getUTCFullYear();
  let months = to.getUTCMonth() - from.getUTCMonth();
  let days = to.getUTCDate() - from.getUTCDate();

  if (days < 0) {
    months -= 1;
    // The month preceding `to`; month 0 of getUTCMonth is January, so passing
    // the raw index to daysInMonth (which is 1-based) already steps back one.
    const previousMonth = to.getUTCMonth();
    days += previousMonth === 0
      ? daysInMonth(to.getUTCFullYear() - 1, 12)
      : daysInMonth(to.getUTCFullYear(), previousMonth);
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalDays = daysBetween(from, to);

  return {
    years,
    months,
    days,
    totalDays,
    totalMonths: years * 12 + months,
    totalWeeks: Math.floor(totalDays / 7),
    spareDays: totalDays % 7,
  };
}

export interface Anniversary {
  /** The next time this date's day-and-month comes round, `from` included. */
  date: Date;
  daysUntil: number;
  /** Which anniversary it will be — the age someone turns on it. */
  ordinal: number;
  isToday: boolean;
}

/**
 * The next anniversary of `origin` on or after `from`.
 *
 * A 29 February birthday is clamped to the 28th in a common year. There's no
 * right answer — some countries say 28 February and some say 1 March — and the
 * clamp at least keeps the date inside the birth month.
 */
export function nextAnniversary(origin: Date, from: Date): Anniversary {
  const month = origin.getUTCMonth();
  const day = origin.getUTCDate();

  const at = (year: number) =>
    new Date(Date.UTC(year, month, Math.min(day, daysInMonth(year, month + 1))));

  let date = at(from.getUTCFullYear());
  if (daysBetween(from, date) < 0) date = at(from.getUTCFullYear() + 1);

  const daysUntil = daysBetween(from, date);

  return {
    date,
    daysUntil,
    ordinal: date.getUTCFullYear() - origin.getUTCFullYear(),
    isToday: daysUntil === 0,
  };
}

/**
 * "15 May 1990". Day-month-year and a spelled-out month, so it can't be read
 * back the American way round — 03/04 is ambiguous, "3 April" isn't.
 */
export function formatDateLong(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Tuesday" — the day of the week a date falls on. */
export function weekdayName(date: Date): string {
  return date.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}

/** Thousands-grouped whole number, matching formatMoney in lib/finance.ts. */
export function formatCount(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  const grouped = `${Math.abs(safe)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${safe < 0 ? "-" : ""}${grouped}`;
}

/** "34 years 3 months 12 days", dropping the parts that are zero. */
export function spanLabel(span: DateSpan): string {
  const parts: string[] = [];
  if (span.years > 0) parts.push(plural(span.years, "year"));
  if (span.months > 0) parts.push(plural(span.months, "month"));
  if (span.days > 0) parts.push(plural(span.days, "day"));

  return parts.length === 0 ? "0 days" : parts.join(" ");
}

export function plural(count: number, unit: string): string {
  return `${formatCount(count)} ${count === 1 ? unit : `${unit}s`}`;
}
