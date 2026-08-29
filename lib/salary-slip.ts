/**
 * Payslip arithmetic and page layout for the Salary Slip tool. A filled-in form
 * goes in, a one-page PDF comes out — the same split as lib/invoice.ts, whose
 * logo handling this reuses outright rather than re-deriving.
 *
 * The arithmetic is the part worth keeping out of the component. Earnings and
 * deductions are two lists of amounts typed into text fields, and gross, total
 * deductions and net pay all have to agree with the rows printed above them.
 * computePay is the single place that adds up, so the summary on screen and the
 * numbers on the page can't disagree.
 *
 * Net pay is allowed to go negative: deductions exceeding earnings is a data
 * entry mistake, and printing -1,200.00 shows it where clamping to zero would
 * hide it.
 */

import { PDFDocument } from "pdf-lib";
import type { PDFImage, PDFPage } from "pdf-lib";

import type { Logo } from "./invoice";
import {
  A4_HEIGHT,
  A4_WIDTH,
  ACCENT,
  LINE,
  MARGIN,
  MUTED,
  drawRule,
  drawText,
  formatAmount,
  loadFonts,
  parseNumber,
  slugifyName,
  wrapLines,
} from "./pdf-text";
import type { Fonts } from "./pdf-text";
import { amountInWords } from "./rent-receipt";
import { bytesToBlob } from "./utils";

/* --------------------------------------------------------------------- model */

export interface PayRow {
  /** Stable across re-renders so React keys survive a row being removed. */
  id: string;
  label: string;
  /** Kept as typed rather than as a number — an empty field isn't 0 to a user. */
  amount: string;
}

export interface SalarySlipDetails {
  companyName: string;
  employeeName: string;
  designation: string;
  /** Optional — printed only when given. */
  employeeId: string;
  /** Month name, from MONTHS. */
  month: string;
  year: string;
  earnings: PayRow[];
  deductions: PayRow[];
  logo: Logo | null;
}

export interface PayTotals {
  /** One rounded amount per row, in the order given. */
  earningAmounts: number[];
  deductionAmounts: number[];
  gross: number;
  deductions: number;
  /** Gross less deductions. Negative when the deductions are larger. */
  netPay: number;
}

export type BuildResult = { ok: true; blob: Blob } | { ok: false; error: string };

/** The rupee sign; toWinAnsi prints it as "Rs." because Helvetica has no glyph. */
const RUPEE = "₹";

let counter = 0;

export function emptyPayRow(label = ""): PayRow {
  counter += 1;
  return { id: `pay-${counter}`, label, amount: "" };
}

/**
 * Gross, total deductions and net pay, each rounded to the paisa as it's
 * computed — a net pay that isn't gross minus deductions as printed is the line
 * an employee queries.
 */
export function computePay(details: Pick<SalarySlipDetails, "earnings" | "deductions">): PayTotals {
  const earningAmounts = details.earnings.map((row) => round2(parseNumber(row.amount)));
  const deductionAmounts = details.deductions.map((row) => round2(parseNumber(row.amount)));

  const gross = round2(sum(earningAmounts));
  const deductions = round2(sum(deductionAmounts));

  return { earningAmounts, deductionAmounts, gross, deductions, netPay: round2(gross - deductions) };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round2(value: number): number {
  // Scaling before rounding keeps a column of decimals off the floating-point
  // cliff that makes a printed total end in ...0000001.
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

/** Rows worth printing — a blank row left at the bottom of the form isn't one. */
export function payableRows(rows: PayRow[]): PayRow[] {
  return rows.filter((row) => row.label.trim() !== "" || parseNumber(row.amount) !== 0);
}

/** "April 2026", or just the year, or nothing — whatever the form has. */
export function periodLabel(details: Pick<SalarySlipDetails, "month" | "year">): string {
  return [details.month.trim(), details.year.trim()].filter((part) => part !== "").join(" ");
}

/** salary-slip-april-2026-rahul-menon.pdf, so a folder of them sorts sensibly. */
export function salarySlipFileName(details: SalarySlipDetails): string {
  const period = slugifyName(periodLabel(details), "");
  const employee = slugifyName(details.employeeName, "");
  const parts = ["salary-slip", period, employee].filter((part) => part !== "");

  return `${parts.join("-")}.pdf`;
}

/* -------------------------------------------------------------------- layout */

const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;
const RIGHT_EDGE = MARGIN + CONTENT_WIDTH;

/** The two tables sit side by side with this much air between them. */
const GUTTER = 22;
const COLUMN_WIDTH = (CONTENT_WIDTH - GUTTER) / 2;
const RIGHT_COLUMN_X = MARGIN + COLUMN_WIDTH + GUTTER;

const LOGO_BOX = { width: 132, height: 50 };

const BODY_SIZE = 9.5;
const LINE_HEIGHT = 12.5;
const LABEL_SIZE = 7.5;
const ROW_HEIGHT = 17;

export async function buildSalarySlipPdf(details: SalarySlipDetails): Promise<BuildResult> {
  const earnings = payableRows(details.earnings);
  const deductions = payableRows(details.deductions);

  if (details.companyName.trim() === "") {
    return { ok: false, error: "Add the company name — a payslip has to say who issued it." };
  }
  if (details.employeeName.trim() === "") {
    return { ok: false, error: "Add the employee's name — that's who the payslip is for." };
  }
  if (earnings.length === 0) {
    return { ok: false, error: "Add at least one earnings row, such as Basic pay." };
  }

  try {
    const pdf = await PDFDocument.create();
    const fonts = await loadFonts(pdf);
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    const period = periodLabel(details);
    const totals = computePay({ earnings, deductions });

    pdf.setTitle(`Payslip${period === "" ? "" : ` — ${period}`}`);
    pdf.setCreator("Kaamvo Salary Slip");

    let logo: PDFImage | null = null;
    if (details.logo !== null) {
      try {
        logo = await pdf.embedPng(details.logo.data);
      } catch {
        return { ok: false, error: "Couldn't put that logo into the PDF — try a different image." };
      }
    }

    let y = drawHeader(page, fonts, details, logo, period);
    y = drawEmployee(page, fonts, details, y);

    // Both tables are drawn from the same top edge and report how far down they
    // got, so neither has to know how many rows the other has.
    const leftBottom = drawTable(page, fonts, "EARNINGS", earnings, totals.earningAmounts, MARGIN, y);
    const rightBottom = drawTable(
      page,
      fonts,
      "DEDUCTIONS",
      deductions,
      totals.deductionAmounts,
      RIGHT_COLUMN_X,
      y,
    );

    // The two total rows line up under the taller table, so they read as one row
    // across the page rather than as the end of each column.
    const totalsY = Math.min(leftBottom, rightBottom);
    drawTableTotal(page, fonts, "Gross earnings", totals.gross, MARGIN, totalsY);
    drawTableTotal(page, fonts, "Total deductions", totals.deductions, RIGHT_COLUMN_X, totalsY);

    drawNetPay(page, fonts, totals.netPay, totalsY - 46);

    return { ok: true, blob: bytesToBlob(await pdf.save(), "application/pdf") };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

function drawHeader(
  page: PDFPage,
  fonts: Fonts,
  details: SalarySlipDetails,
  logo: PDFImage | null,
  period: string,
): number {
  const top = A4_HEIGHT - MARGIN - 14;

  drawText(page, "PAYSLIP", {
    x: RIGHT_EDGE,
    y: top - 6,
    font: fonts.bold,
    size: 20,
    align: "right",
  });
  if (period !== "") {
    drawText(page, `For ${period}`, {
      x: RIGHT_EDGE,
      y: top - 24,
      font: fonts.regular,
      size: BODY_SIZE,
      color: MUTED,
      align: "right",
    });
  }

  let leftY = top;

  if (logo !== null) {
    const scale = Math.min(LOGO_BOX.width / logo.width, LOGO_BOX.height / logo.height);
    const width = logo.width * scale;
    const height = logo.height * scale;
    // Hung from the top edge, so a wide logo and a tall one start level.
    page.drawImage(logo, { x: MARGIN, y: leftY + 10 - height, width, height });
    leftY += 10 - height - 14;
  }

  drawText(page, details.companyName.trim(), { x: MARGIN, y: leftY, font: fonts.bold, size: 15 });

  const ruleY = Math.min(leftY, top - 30) - 16;
  drawRule(page, { x: MARGIN, y: ruleY, width: CONTENT_WIDTH });

  return ruleY - 26;
}

/**
 * The four things a payslip is checked against before the amounts: who it's for,
 * what they do, their employee number and the month it covers. Laid out as
 * labelled cells two to a row, so nothing has to be read out of a sentence.
 */
function drawEmployee(
  page: PDFPage,
  fonts: Fonts,
  details: SalarySlipDetails,
  y: number,
): number {
  const cells = [
    { label: "EMPLOYEE", value: details.employeeName.trim() },
    { label: "DESIGNATION", value: details.designation.trim() },
    { label: "EMPLOYEE ID", value: details.employeeId.trim() },
    { label: "PAY PERIOD", value: periodLabel(details) },
  ].filter((cell) => cell.value !== "");

  let cursor = y;

  cells.forEach((cell, index) => {
    const x = index % 2 === 0 ? MARGIN : RIGHT_COLUMN_X;

    drawText(page, cell.label, {
      x,
      y: cursor,
      font: fonts.bold,
      size: LABEL_SIZE,
      color: MUTED,
    });
    drawText(page, cell.value, {
      x,
      y: cursor - 14,
      font: fonts.bold,
      size: 11,
    });

    // The row advances only after its second cell — or after the first, if it's
    // the last one and the row is half empty.
    if (index % 2 === 1 || index === cells.length - 1) cursor -= 38;
  });

  return cursor - 6;
}

/**
 * One of the two tables, drawn from `y` downward, returning the baseline the
 * total row should sit on. Amounts are right-aligned to the column's edge.
 */
function drawTable(
  page: PDFPage,
  fonts: Fonts,
  title: string,
  rows: PayRow[],
  amounts: number[],
  x: number,
  y: number,
): number {
  const right = x + COLUMN_WIDTH;
  const labelWidth = COLUMN_WIDTH - 96;

  drawText(page, title, { x, y, font: fonts.bold, size: LABEL_SIZE, color: MUTED });
  drawText(page, "AMOUNT", {
    x: right,
    y,
    font: fonts.bold,
    size: LABEL_SIZE,
    color: MUTED,
    align: "right",
  });

  let cursor = y - 8;
  drawRule(page, { x, y: cursor, width: COLUMN_WIDTH });
  cursor -= 18;

  if (rows.length === 0) {
    drawText(page, "None", { x, y: cursor, font: fonts.regular, size: BODY_SIZE, color: MUTED });
    return cursor - ROW_HEIGHT;
  }

  rows.forEach((row, index) => {
    const label = row.label.trim() === "" ? "-" : row.label.trim();
    // Long labels wrap rather than run into the amount beside them.
    const lines = wrapLines(label, fonts.regular, BODY_SIZE, labelWidth);

    lines.forEach((line, offset) => {
      drawText(page, line, {
        x,
        y: cursor - offset * LINE_HEIGHT,
        font: fonts.regular,
        size: BODY_SIZE,
      });
    });

    drawText(page, `${RUPEE} ${formatAmount(amounts[index] ?? 0)}`, {
      x: right,
      y: cursor,
      font: fonts.regular,
      size: BODY_SIZE,
      align: "right",
    });

    cursor -= (lines.length - 1) * LINE_HEIGHT + ROW_HEIGHT;
  });

  return cursor;
}

function drawTableTotal(
  page: PDFPage,
  fonts: Fonts,
  label: string,
  value: number,
  x: number,
  y: number,
): void {
  drawRule(page, { x, y: y + 12, width: COLUMN_WIDTH });

  drawText(page, label, { x, y, font: fonts.bold, size: BODY_SIZE });
  drawText(page, `${RUPEE} ${formatAmount(value)}`, {
    x: x + COLUMN_WIDTH,
    y,
    font: fonts.bold,
    size: BODY_SIZE,
    align: "right",
  });
}

/**
 * The band at the foot of the page: the one number an employee looks for, in
 * figures and in words. The words are the same Indian-system spelling the rent
 * receipt uses — a negative net pay has none, so the line is dropped.
 */
function drawNetPay(page: PDFPage, fonts: Fonts, netPay: number, y: number): void {
  const height = 54;

  page.drawRectangle({
    x: MARGIN,
    y: y - height + 18,
    width: CONTENT_WIDTH,
    height,
    borderColor: LINE,
    borderWidth: 0.75,
  });

  drawText(page, "NET PAY", {
    x: MARGIN + 16,
    y,
    font: fonts.bold,
    size: LABEL_SIZE,
    color: MUTED,
  });
  drawText(page, `${RUPEE} ${formatAmount(netPay)}`, {
    x: RIGHT_EDGE - 16,
    y: y - 6,
    font: fonts.bold,
    size: 16,
    color: ACCENT,
    align: "right",
  });

  const words = netPay >= 0 ? amountInWords(netPay) : "";
  if (words !== "") {
    drawText(page, words, {
      x: MARGIN + 16,
      y: y - 20,
      font: fonts.regular,
      size: 9,
      color: MUTED,
    });
  }

  drawText(page, "This is a computer-generated payslip and does not require a signature.", {
    x: MARGIN,
    y: y - height - 6,
    font: fonts.regular,
    size: 8.5,
    color: MUTED,
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message;
  return "Couldn't build the payslip PDF.";
}
