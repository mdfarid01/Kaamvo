/**
 * The arithmetic behind the three finance calculators — EMI, SIP and Compound
 * Interest. Pure functions in, plain result objects out, like
 * lib/text-stats.ts; the pages only hold form state.
 *
 * All three are the same shape underneath: a rate quoted per year, applied per
 * period. Each function takes the annual rate and does that division itself, so
 * no caller has to remember whether a rate has already been divided by twelve —
 * that mistake is off by a factor of 144 in the interest and is easy to miss.
 *
 * The money formatter here is a copy of the one in lib/pdf-text.ts rather than
 * an import: that module pulls in pdf-lib for the two PDF tools, and these three
 * pages have no reason to ship a PDF library.
 */

/** Guards against a divide-by-zero when the rate rounds to nothing. */
const RATE_EPSILON = 1e-12;

export interface EmiResult {
  /** The fixed monthly instalment. */
  emi: number;
  totalInterest: number;
  totalPayment: number;
}

/**
 * Standard amortising loan payment:
 *
 *   EMI = P · i · (1 + i)^n / ((1 + i)^n − 1)
 *
 * where i is the monthly rate and n the number of months. At i = 0 that formula
 * is 0/0, so an interest-free loan is handled as the plain split it is.
 */
export function calculateEmi(principal: number, annualRatePercent: number, months: number): EmiResult {
  const p = Math.max(0, principal);
  const n = Math.max(0, Math.round(months));

  if (p === 0 || n === 0) {
    return { emi: 0, totalInterest: 0, totalPayment: 0 };
  }

  const i = Math.max(0, annualRatePercent) / 100 / 12;

  if (i < RATE_EPSILON) {
    return { emi: p / n, totalInterest: 0, totalPayment: p };
  }

  const growth = (1 + i) ** n;
  const emi = (p * i * growth) / (growth - 1);
  const totalPayment = emi * n;

  return { emi, totalInterest: totalPayment - p, totalPayment };
}

export interface SipResult {
  /** Value at the end of the term. */
  maturity: number;
  invested: number;
  gains: number;
}

/**
 * Future value of a fixed monthly investment:
 *
 *   M = P · ((1 + i)^n − 1) / i · (1 + i)
 *
 * The trailing (1 + i) is the annuity-due term: an SIP instalment goes in at the
 * start of the month, so every one of them earns a month more than the ordinary
 * annuity formula assumes. Leaving it off understates the maturity by about one
 * month's return, which is the usual discrepancy between two SIP calculators.
 */
export function calculateSip(monthly: number, annualReturnPercent: number, years: number): SipResult {
  const p = Math.max(0, monthly);
  const n = Math.max(0, Math.round(years * 12));

  if (p === 0 || n === 0) {
    return { maturity: 0, invested: 0, gains: 0 };
  }

  const invested = p * n;
  const i = annualReturnPercent / 100 / 12;

  if (Math.abs(i) < RATE_EPSILON) {
    return { maturity: invested, invested, gains: 0 };
  }

  const maturity = p * (((1 + i) ** n - 1) / i) * (1 + i);

  return { maturity, invested, gains: maturity - invested };
}

/** How often interest is added back to the balance, per year. */
export interface Frequency {
  id: string;
  label: string;
  /** Periods per year; 0 means continuous compounding. */
  perYear: number;
}

export const FREQUENCIES: Frequency[] = [
  { id: "annually", label: "Annually", perYear: 1 },
  { id: "half-yearly", label: "Half-yearly", perYear: 2 },
  { id: "quarterly", label: "Quarterly", perYear: 4 },
  { id: "monthly", label: "Monthly", perYear: 12 },
  { id: "daily", label: "Daily", perYear: 365 },
  { id: "continuous", label: "Continuously", perYear: 0 },
];

export function getFrequency(id: string): Frequency {
  return FREQUENCIES.find((frequency) => frequency.id === id) ?? FREQUENCIES[0];
}

export interface CompoundResult {
  /** Principal plus interest at the end of the term. */
  amount: number;
  interest: number;
}

/**
 * A = P · (1 + r/m)^(m·t), or A = P · e^(r·t) when compounding continuously —
 * the limit of the first as m grows, which is why perYear 0 stands for it.
 */
export function calculateCompoundInterest(
  principal: number,
  annualRatePercent: number,
  years: number,
  perYear: number,
): CompoundResult {
  const p = Math.max(0, principal);
  const t = Math.max(0, years);
  const r = annualRatePercent / 100;

  if (p === 0 || t === 0) {
    return { amount: p, interest: 0 };
  }

  const amount = perYear <= 0 ? p * Math.exp(r * t) : p * (1 + r / perYear) ** (perYear * t);

  return { amount, interest: amount - p };
}

/**
 * Reads a number out of a form field. Blank or unparseable comes back as 0, so
 * a half-filled form shows zeros rather than NaN in every box below it — the
 * same choice lib/pdf-text.ts makes for the invoice fields.
 */
export function parseAmount(value: string): number {
  const parsed = Number.parseFloat(value.replace(/[, ]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Thousands-grouped with two decimals, matching the PDF tools' amounts. */
export function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const [whole, fraction] = Math.abs(safe).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${safe < 0 ? "-" : ""}${grouped}.${fraction}`;
}

/**
 * The share one part is of a total, as a percentage clamped to 0–100. Used for
 * the split bars; a total of 0 gives 0 rather than NaN width.
 */
export function share(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (part / total) * 100));
}

/** "5 years 6 months" from a fractional count of years, for a summary line. */
export function termLabel(months: number): string {
  const total = Math.max(0, Math.round(months));
  const years = Math.floor(total / 12);
  const rest = total % 12;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (rest > 0) parts.push(`${rest} ${rest === 1 ? "month" : "months"}`);

  return parts.length === 0 ? "0 months" : parts.join(" ");
}
