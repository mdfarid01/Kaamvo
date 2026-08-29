/**
 * The four percentage questions the Percentage Calculator answers. One-liners,
 * but they live here rather than in the page for the same reason lib/finance.ts
 * does: the page holds form state, the module holds the arithmetic.
 *
 * Each one returns null when the answer would be undefined — "what percent of
 * zero" and "change from zero" have no answer, and null renders as a dash
 * instead of NaN or Infinity in a box that updates on every keystroke.
 */

/** X% of Y. */
export function percentOf(percent: number, value: number): number {
  return (percent / 100) * value;
}

/** X is what percent of Y. */
export function percentRatio(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return (part / whole) * 100;
}

export interface PercentChange {
  /** The value after the increase or decrease. */
  result: number;
  /** How much was added or taken off, as a positive number. */
  delta: number;
}

/** Y increased (or, with a negative percent, decreased) by X%. */
export function applyChange(value: number, percent: number): PercentChange {
  const delta = percentOf(percent, value);
  return { result: value + delta, delta: Math.abs(delta) };
}

/** The percentage step from one value to another — 40 → 50 is +25%. */
export function percentDifference(from: number, to: number): number | null {
  if (from === 0) return null;
  return ((to - from) / from) * 100;
}

/**
 * Reads a number out of a form field, keeping blank distinct from zero: a blank
 * field shows a dash rather than an answer worked out from a value nobody typed.
 */
export function parseNumber(value: string): number | null {
  const trimmed = value.replace(/[, ]/g, "").trim();
  if (trimmed === "") return null;

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Up to four decimals, thousands-grouped, trailing zeros trimmed — so a third
 * of 100 reads "33.3333" and half of 200 reads "100", not "100.0000".
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";

  const fixed = Math.abs(value).toFixed(4).replace(/\.?0+$/, "");
  const [whole, fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const sign = value < 0 ? "-" : "";
  return `${sign}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
}

/** Same, with a % on the end and a sign kept when it carries meaning. */
export function formatPercent(value: number, signed = false): string {
  if (!Number.isFinite(value)) return "—";
  const sign = signed && value > 0 ? "+" : "";

  return `${sign}${formatNumber(value)}%`;
}
