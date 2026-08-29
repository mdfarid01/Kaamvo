/**
 * Rent receipt layout for the Rent Receipt tool. A filled-in form goes in, a
 * one-page PDF comes out — the same split as lib/invoice.ts, which this shares
 * its typesetting with (see lib/pdf-text.ts).
 *
 * The receipt is shaped for an HRA exemption claim under section 10(13A), which
 * is what most people generate one for: an employer's payroll team wants the
 * tenant's name, the landlord's name, the amount, the period it covers, the
 * address of the property and — once the rent passes a lakh a year — the
 * landlord's PAN. Every one of those has a labelled row, so nothing has to be
 * inferred from a sentence.
 *
 * amountInWords is here rather than in lib/pdf-text.ts because it's specific to
 * this document and to the Indian numbering system: a receipt that states the
 * amount only in figures is the one a payroll team sends back.
 */

import { PDFDocument } from "pdf-lib";
import type { PDFPage } from "pdf-lib";

import {
  A4_HEIGHT,
  A4_WIDTH,
  INK,
  LINE,
  MARGIN,
  MONTHS,
  MUTED,
  drawRule,
  drawText,
  formatAmount,
  formatDate,
  loadFonts,
  parseNumber,
  slugifyName,
  wrapLines,
} from "./pdf-text";
import type { Fonts } from "./pdf-text";
import { bytesToBlob } from "./utils";

export interface RentReceiptDetails {
  landlordName: string;
  landlordAddress: string;
  /** Optional. Required by most employers once the annual rent passes a lakh. */
  landlordPan: string;
  tenantName: string;
  /** Monthly rent, as typed. */
  rentAmount: string;
  /** The rented property, which is the address the claim is made against. */
  propertyAddress: string;
  /** Month name, from MONTHS. */
  month: string;
  year: string;
  /** yyyy-mm-dd — when the receipt was issued, not the period it covers. */
  date: string;
  /** Where it was signed. Optional; printed next to the date when given. */
  place: string;
}

export type BuildResult = { ok: true; blob: Blob } | { ok: false; error: string };

/** Rent over this in a year is what makes the landlord's PAN necessary. */
export const PAN_THRESHOLD = 100_000;

/** A PAN is five letters, four digits, one letter. */
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * Whether a PAN looks like one. Only used to warn, never to block: a receipt
 * with a mistyped PAN is still a receipt, and the person filling the form is in
 * a better position than this function to know what their landlord's PAN is.
 */
export function isValidPan(pan: string): boolean {
  return PAN_PATTERN.test(pan.trim().toUpperCase());
}

/** Twelve times the monthly rent — what the PAN threshold is measured against. */
export function annualRent(rentAmount: string): number {
  return Math.max(0, parseNumber(rentAmount)) * 12;
}

/* --------------------------------------------------------------------- words */

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** Anything at or above a thousand crore is past what this spells out. */
const WORDS_CEILING = 1_000_00_00_000;

/**
 * The amount in words, in the Indian system — thousand, lakh, crore rather than
 * thousand, million, billion, since that's what a receipt read in India is
 * expected to say. Paise are included only when there are any.
 */
export function amountInWords(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value >= WORDS_CEILING) return "";

  const rupees = Math.floor(value);
  // Rounding the fraction rather than truncating: 1200.999 is 1201, not 1200.99.
  const paise = Math.round((value - rupees) * 100);

  if (paise === 100) return amountInWords(rupees + 1);

  const whole = `Rupees ${integerWords(rupees)}`;
  const fraction = paise === 0 ? "" : ` and ${integerWords(paise)} Paise`;

  return `${whole}${fraction} Only`;
}

function integerWords(value: number): string {
  if (value === 0) return "Zero";

  const parts: string[] = [];
  let rest = value;

  const crore = Math.floor(rest / 10_000_000);
  rest %= 10_000_000;
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  const thousand = Math.floor(rest / 1_000);
  rest %= 1_000;
  const hundred = Math.floor(rest / 100);
  rest %= 100;

  if (crore > 0) parts.push(`${under100(crore)} Crore`);
  if (lakh > 0) parts.push(`${under100(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${under100(thousand)} Thousand`);
  if (hundred > 0) parts.push(`${ONES[hundred]} Hundred`);
  if (rest > 0) parts.push(under100(rest));

  return parts.join(" ");
}

function under100(value: number): string {
  if (value < 20) return ONES[value];

  const tens = TENS[Math.floor(value / 10)];
  const ones = ONES[value % 10];

  return ones === "" ? tens : `${tens} ${ones}`;
}

/* -------------------------------------------------------------------- layout */

const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;
const BODY_SIZE = 10.5;
const LINE_HEIGHT = 15;
const LABEL_WIDTH = 128;

/** The rupee sign; toWinAnsi prints it as "Rs." because Helvetica has no glyph. */
const RUPEE = "₹";

export async function buildRentReceiptPdf(details: RentReceiptDetails): Promise<BuildResult> {
  const rent = parseNumber(details.rentAmount);

  if (details.landlordName.trim() === "") {
    return { ok: false, error: "Add the landlord's name — a receipt has to say who issued it." };
  }
  if (details.tenantName.trim() === "") {
    return { ok: false, error: "Add the tenant's name — that's who the receipt is for." };
  }
  if (rent <= 0) {
    return { ok: false, error: "Enter the rent amount as a number greater than zero." };
  }

  try {
    const pdf = await PDFDocument.create();
    const fonts = await loadFonts(pdf);
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    const period = periodLabel(details);

    pdf.setTitle(`Rent receipt${period === "" ? "" : ` — ${period}`}`);
    pdf.setCreator("Kaamvo Rent Receipt");

    // The ruled box around the receipt — what one looks like on paper, and what
    // makes it obvious the document is whole rather than cut off. It's drawn
    // last, once the rows have settled where the bottom edge goes, so a long
    // address can't run through it.
    const boxTop = A4_HEIGHT - MARGIN;
    const left = MARGIN + 26;
    const width = CONTENT_WIDTH - 52;
    let y = boxTop - 44;

    drawText(page, "RENT RECEIPT", {
      x: A4_WIDTH / 2,
      y,
      font: fonts.bold,
      size: 17,
      align: "center",
    });
    y -= 14;

    if (period !== "") {
      drawText(page, `For the month of ${period}`, {
        x: A4_WIDTH / 2,
        y: y - 8,
        font: fonts.regular,
        size: BODY_SIZE,
        color: MUTED,
        align: "center",
      });
      y -= 20;
    }

    y -= 16;
    drawRule(page, { x: left, y, width });
    y -= 28;

    // The sentence a receipt is, before the table restates it in fields — the
    // part a person reads, where the table is the part a payroll system reads.
    const sentence =
      `Received with thanks the sum of ${RUPEE} ${formatAmount(rent)} ` +
      `(${amountInWords(rent)}) from ${details.tenantName.trim()} ` +
      `towards the rent of the property described below` +
      `${period === "" ? "" : ` for the month of ${period}`}.`;

    y = drawParagraph(page, fonts, sentence, left, y, width);
    y -= 18;

    const rows: Array<{ label: string; value: string; wrap?: boolean }> = [
      { label: "Amount received", value: `${RUPEE} ${formatAmount(rent)}` },
      { label: "Period", value: period },
      { label: "Property address", value: details.propertyAddress.trim(), wrap: true },
      { label: "Tenant", value: details.tenantName.trim() },
      { label: "Landlord", value: details.landlordName.trim() },
      { label: "Landlord's address", value: details.landlordAddress.trim(), wrap: true },
      { label: "Landlord's PAN", value: details.landlordPan.trim().toUpperCase() },
    ];

    for (const row of rows) {
      if (row.value === "") continue;
      y = drawRow(page, fonts, row.label, row.value, left, y, width, row.wrap === true);
      y -= 6;
    }

    // The signature block follows the rows: the gap above the ruled line is
    // where a landlord actually signs, so it has to be blank space and not
    // wherever the address happened to end.
    y -= 20;
    drawRule(page, { x: left, y, width });
    y -= 62;

    const stamp = [details.place.trim(), formatDate(details.date)].filter((part) => part !== "");
    if (stamp.length > 0) {
      drawText(page, stamp.join(", "), {
        x: left,
        y,
        font: fonts.regular,
        size: BODY_SIZE,
        color: MUTED,
      });
    }

    const signRight = MARGIN + CONTENT_WIDTH - 26;
    drawRule(page, { x: signRight - 170, y: y + 30, width: 170, color: INK, thickness: 0.6 });
    drawText(page, "Signature of the landlord", {
      x: signRight,
      y,
      font: fonts.regular,
      size: 9,
      color: MUTED,
      align: "right",
    });

    const boxBottom = y - 26;
    page.drawRectangle({
      x: MARGIN,
      y: boxBottom,
      width: CONTENT_WIDTH,
      height: boxTop - boxBottom,
      borderColor: LINE,
      borderWidth: 0.75,
    });

    drawFootnote(page, fonts, details, rent, boxBottom - 26);

    return { ok: true, blob: bytesToBlob(await pdf.save(), "application/pdf") };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** "April 2026", or just the year, or nothing — whatever the form has. */
export function periodLabel(details: Pick<RentReceiptDetails, "month" | "year">): string {
  const month = MONTHS.includes(details.month) ? details.month : "";
  const year = details.year.trim();

  return [month, year].filter((part) => part !== "").join(" ");
}

/** rent-receipt-april-2026-anita-rao.pdf */
export function receiptFileName(details: RentReceiptDetails): string {
  const period = slugifyName(periodLabel(details), "");
  const tenant = slugifyName(details.tenantName, "");
  const parts = ["rent-receipt", period, tenant].filter((part) => part !== "");

  return `${parts.join("-")}.pdf`;
}

function drawParagraph(
  page: PDFPage,
  fonts: Fonts,
  text: string,
  x: number,
  y: number,
  width: number,
): number {
  let cursor = y;

  for (const line of wrapLines(text, fonts.regular, BODY_SIZE, width)) {
    drawText(page, line, { x, y: cursor, font: fonts.regular, size: BODY_SIZE });
    cursor -= LINE_HEIGHT;
  }

  return cursor;
}

/**
 * One labelled row: label on the left in muted, value on the right in bold.
 * Returns the next free baseline, so a wrapped address pushes what follows it
 * down rather than being drawn over.
 */
function drawRow(
  page: PDFPage,
  fonts: Fonts,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  wrap: boolean,
): number {
  drawText(page, label, { x, y, font: fonts.regular, size: BODY_SIZE, color: MUTED });

  const valueX = x + LABEL_WIDTH;
  const valueWidth = width - LABEL_WIDTH;
  const lines = wrap ? wrapLines(value, fonts.bold, BODY_SIZE, valueWidth) : [value];

  let cursor = y;
  for (const line of lines) {
    drawText(page, line, { x: valueX, y: cursor, font: fonts.bold, size: BODY_SIZE });
    cursor -= LINE_HEIGHT;
  }

  return cursor;
}

/**
 * The two things a payroll team checks after the amount: that the receipt is for
 * a specific period, and that a landlord's PAN is on it once the annual rent
 * clears a lakh. Printed as a note under the box rather than inside it, since
 * it's guidance about the receipt and not part of it.
 */
function drawFootnote(
  page: PDFPage,
  fonts: Fonts,
  details: RentReceiptDetails,
  rent: number,
  y: number,
): void {
  const yearly = rent * 12;
  const needsPan = yearly > PAN_THRESHOLD && details.landlordPan.trim() === "";

  const note = needsPan
    ? `Retain this receipt for a house rent allowance claim under section 10(13A). At ${RUPEE} ${formatAmount(yearly)} a year, an employer will usually also ask for the landlord's PAN.`
    : "Retain this receipt for a house rent allowance claim under section 10(13A) of the Income-tax Act, 1961.";

  let cursor = y;
  for (const line of wrapLines(note, fonts.regular, 8.5, CONTENT_WIDTH)) {
    drawText(page, line, { x: MARGIN, y: cursor, font: fonts.regular, size: 8.5, color: MUTED });
    cursor -= 11;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message;
  return "Couldn't build the rent receipt PDF.";
}
