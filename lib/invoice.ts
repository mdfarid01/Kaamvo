/**
 * Invoice arithmetic and page layout for the Invoice Generator. A filled-in
 * form goes in, a PDF comes out — the same split as lib/image-to-pdf.ts, so the
 * UI layer holds form state and nothing else touches pdf-lib.
 *
 * The money is the part worth keeping out of the component. Quantities and
 * rates arrive as whatever was typed into a text field, and every one of them
 * feeds a subtotal, a tax line and a total that have to agree with the rows
 * above them. computeTotals is the single place that adds up, and both the
 * summary on screen and the numbers on the page read from it, so the download
 * can't disagree with the preview.
 *
 * Rounding happens per line and again on the tax, at two decimals, rather than
 * once at the end: a total that isn't the sum of its printed lines is the thing
 * a client queries.
 */

import { PDFDocument } from "pdf-lib";
import type { PDFImage, PDFPage } from "pdf-lib";

import { loadSourceImage, releaseSourceImage, renderToBlob } from "./image-canvas";
import {
  A4_HEIGHT,
  A4_WIDTH,
  ACCENT,
  INK,
  MARGIN,
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

/* --------------------------------------------------------------------- model */

export interface LineItem {
  /** Stable across re-renders so React keys survive a row being removed. */
  id: string;
  description: string;
  /** Kept as typed rather than as a number — an empty field isn't 0 to a user. */
  quantity: string;
  rate: string;
}

export interface Currency {
  value: string;
  label: string;
  /** Shown on screen. The rupee sign becomes "Rs." on the page — see toWinAnsi. */
  symbol: string;
}

export const CURRENCIES: Currency[] = [
  { value: "INR", label: "INR ₹", symbol: "₹" },
  { value: "USD", label: "USD $", symbol: "$" },
  { value: "EUR", label: "EUR €", symbol: "€" },
  { value: "GBP", label: "GBP £", symbol: "£" },
];

export const DEFAULT_CURRENCY = "INR";

export function symbolFor(currency: string): string {
  return CURRENCIES.find((entry) => entry.value === currency)?.symbol ?? "";
}

/** A logo normalised to PNG bytes, held in memory only. */
export interface Logo {
  name: string;
  width: number;
  height: number;
  /** @internal What gets embedded. */
  readonly data: Uint8Array;
}

export interface InvoiceDetails {
  businessName: string;
  businessAddress: string;
  clientName: string;
  clientAddress: string;
  invoiceNumber: string;
  /** yyyy-mm-dd from a date input, or free text. */
  date: string;
  dueDate: string;
  items: LineItem[];
  /** Percent, as typed. */
  taxRate: string;
  taxLabel: string;
  notes: string;
  currency: string;
  logo: Logo | null;
}

export interface Totals {
  /** One rounded amount per item, in the order given. */
  lineTotals: number[];
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
}

export type BuildResult = { ok: true; blob: Blob } | { ok: false; error: string };

export type LogoResult = { ok: true; logo: Logo } | { ok: false; error: string };

let counter = 0;

export function emptyItem(): LineItem {
  counter += 1;
  return { id: `item-${counter}`, description: "", quantity: "1", rate: "" };
}

/**
 * Line totals, subtotal, tax and total, each rounded to the cent as it's
 * computed. A negative tax rate is clamped to zero — a discount belongs in a
 * line item, where it's visible, not hidden in the tax row.
 */
export function computeTotals(items: LineItem[], taxRate: string): Totals {
  const lineTotals = items.map((item) =>
    round2(parseNumber(item.quantity) * parseNumber(item.rate)),
  );
  const subtotal = round2(lineTotals.reduce((sum, value) => sum + value, 0));
  const rate = Math.max(0, parseNumber(taxRate));
  const tax = round2((subtotal * rate) / 100);

  return { lineTotals, subtotal, tax, total: round2(subtotal + tax), taxRate: rate };
}

function round2(value: number): number {
  // Scaling before rounding keeps 0.1 × 3 off the floating-point cliff that
  // makes a printed subtotal end in ...0000001.
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

/** Rows worth printing — a blank row left at the bottom of the form isn't one. */
export function billableItems(items: LineItem[]): LineItem[] {
  return items.filter(
    (item) =>
      item.description.trim() !== "" ||
      parseNumber(item.quantity) !== 0 ||
      parseNumber(item.rate) !== 0,
  );
}

/* ---------------------------------------------------------------------- logo */

/**
 * The largest edge a logo is stored at. A 4000px company logo would otherwise
 * put a megabyte of PNG into a one-page invoice for a 130-point-wide box.
 */
const MAX_LOGO_EDGE = 600;

/**
 * Reads a logo and re-encodes it to PNG through a canvas, which is what makes it
 * safe to embed: the decode applies any EXIF turn and flattens whatever the
 * source format was, so buildInvoicePdf only ever calls embedPng. Nothing is
 * uploaded and nothing is written to disk — the bytes live in React state until
 * the tab is closed.
 */
export async function loadLogo(file: File): Promise<LogoResult> {
  const loaded = await loadSourceImage(file);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const source = loaded.image;
  const scale = Math.min(1, MAX_LOGO_EDGE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  try {
    // PNG so transparency survives — a logo on a white page shouldn't arrive in
    // a box of its own background colour.
    const rendered = await renderToBlob(source, { width, height, type: "image/png" });
    if (!rendered.ok) return { ok: false, error: rendered.error };

    return {
      ok: true,
      logo: {
        name: file.name,
        width,
        height,
        data: new Uint8Array(await rendered.blob.arrayBuffer()),
      },
    };
  } finally {
    releaseSourceImage(source);
  }
}

/* -------------------------------------------------------------------- layout */

const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;
const RIGHT_EDGE = MARGIN + CONTENT_WIDTH;

/** The three numeric columns are right-aligned to these; description fills the rest. */
const AMOUNT_RIGHT = RIGHT_EDGE;
const RATE_RIGHT = RIGHT_EDGE - 92;
const QTY_RIGHT = RATE_RIGHT - 68;
const DESC_WIDTH = QTY_RIGHT - MARGIN - 46;

/** The meta rows under "INVOICE": label right-aligned this far in from the edge. */
const META_LABEL_RIGHT = RIGHT_EDGE - 96;

const LOGO_BOX = { width: 132, height: 54 };

const BODY_SIZE = 9.5;
const LINE_HEIGHT = 12.5;
const LABEL_SIZE = 7.5;

/** Where a page stops taking rows, so a totals block always has room under it. */
const BOTTOM_LIMIT = MARGIN + 90;

/**
 * A cursor over however many pages the invoice turns out to need. `y` is always
 * the baseline of the *next* line to draw, which is the one convention every
 * function below shares — it's what lets a long item list spill onto page two
 * without any of them knowing there is one.
 */
interface Sheet {
  readonly pdf: PDFDocument;
  readonly fonts: Fonts;
  page: PDFPage;
  y: number;
}

export async function buildInvoicePdf(details: InvoiceDetails): Promise<BuildResult> {
  const items = billableItems(details.items);

  if (details.businessName.trim() === "") {
    return { ok: false, error: "Add your business name — it's the one thing an invoice needs." };
  }
  if (items.length === 0) {
    return { ok: false, error: "Add at least one line item with a description or an amount." };
  }

  try {
    const pdf = await PDFDocument.create();
    const fonts = await loadFonts(pdf);
    const symbol = symbolFor(details.currency);
    const totals = computeTotals(items, details.taxRate);

    const number = details.invoiceNumber.trim();
    pdf.setTitle(number === "" ? "Invoice" : `Invoice ${number}`);
    pdf.setCreator("Kaamvo Invoice Generator");

    let logo: PDFImage | null = null;
    if (details.logo !== null) {
      try {
        logo = await pdf.embedPng(details.logo.data);
      } catch {
        return { ok: false, error: "Couldn't put that logo into the PDF — try a different image." };
      }
    }

    const sheet: Sheet = { pdf, fonts, page: newPage(pdf), y: A4_HEIGHT - MARGIN - 14 };

    drawHeader(sheet, details, logo);
    drawParties(sheet, details);
    drawItems(sheet, items, totals, symbol);
    drawTotals(sheet, details, totals, symbol);
    drawNotes(sheet, details);

    return { ok: true, blob: bytesToBlob(await pdf.save(), "application/pdf") };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** invoice-2026-014-acme-ltd.pdf, so a folder of them sorts sensibly. */
export function invoiceFileName(details: InvoiceDetails): string {
  const number = slugifyName(details.invoiceNumber, "");
  const client = slugifyName(details.clientName, "");
  const parts = ["invoice", number, client].filter((part) => part !== "");

  return `${parts.join("-")}.pdf`;
}

function newPage(pdf: PDFDocument): PDFPage {
  return pdf.addPage([A4_WIDTH, A4_HEIGHT]);
}

/**
 * Starts a new page when `needed` points won't fit above the bottom limit, and
 * says whether it did — a caller that repeats a column header needs to know.
 */
function ensureRoom(sheet: Sheet, needed: number): boolean {
  if (sheet.y - needed >= BOTTOM_LIMIT) return false;

  sheet.page = newPage(sheet.pdf);
  sheet.y = A4_HEIGHT - MARGIN - 14;
  return true;
}

function drawHeader(sheet: Sheet, details: InvoiceDetails, logo: PDFImage | null): void {
  const { fonts } = sheet;
  const top = sheet.y;

  // The two columns are laid out independently from the same top edge, so
  // neither has to know how tall the other came out.
  drawText(sheet.page, "INVOICE", {
    x: RIGHT_EDGE,
    y: top - 8,
    font: fonts.bold,
    size: 22,
    align: "right",
  });

  let metaY = top - 34;
  for (const row of [
    { label: "Invoice no.", value: details.invoiceNumber.trim() },
    { label: "Date", value: formatDate(details.date) },
    { label: "Due", value: formatDate(details.dueDate) },
  ]) {
    if (row.value === "") continue;

    drawText(sheet.page, row.label, {
      x: META_LABEL_RIGHT,
      y: metaY,
      font: fonts.regular,
      size: BODY_SIZE,
      color: MUTED,
      align: "right",
    });
    drawText(sheet.page, row.value, {
      x: RIGHT_EDGE,
      y: metaY,
      font: fonts.bold,
      size: BODY_SIZE,
      align: "right",
    });
    metaY -= LINE_HEIGHT + 2;
  }

  let leftY = top;

  if (logo !== null) {
    const scale = Math.min(LOGO_BOX.width / logo.width, LOGO_BOX.height / logo.height);
    const width = logo.width * scale;
    const height = logo.height * scale;
    // Hung from the top edge, so a wide logo and a tall one start level.
    sheet.page.drawImage(logo, { x: MARGIN, y: leftY + 10 - height, width, height });
    leftY += 10 - height - 16;
  }

  drawText(sheet.page, details.businessName.trim(), {
    x: MARGIN,
    y: leftY,
    font: fonts.bold,
    size: 15,
  });
  leftY -= LINE_HEIGHT + 5;

  leftY = drawBlock(sheet, details.businessAddress, MARGIN, leftY, 230, MUTED);

  // The rule goes under whichever column ran longer, so a tall logo can't push
  // it up through the meta rows.
  sheet.y = Math.min(leftY, metaY) - 6;
  drawRule(sheet.page, { x: MARGIN, y: sheet.y, width: CONTENT_WIDTH });
  sheet.y -= 26;
}

function drawParties(sheet: Sheet, details: InvoiceDetails): void {
  const { fonts } = sheet;

  drawText(sheet.page, "BILLED TO", {
    x: MARGIN,
    y: sheet.y,
    font: fonts.bold,
    size: LABEL_SIZE,
    color: MUTED,
  });
  sheet.y -= 16;

  if (details.clientName.trim() !== "") {
    drawText(sheet.page, details.clientName.trim(), {
      x: MARGIN,
      y: sheet.y,
      font: fonts.bold,
      size: 11,
    });
    sheet.y -= LINE_HEIGHT + 2;
  }

  sheet.y = drawBlock(sheet, details.clientAddress, MARGIN, sheet.y, 260, MUTED);
  sheet.y -= 20;
}

function drawItems(sheet: Sheet, items: LineItem[], totals: Totals, symbol: string): void {
  drawItemsHeader(sheet);

  items.forEach((item, index) => {
    const description = item.description.trim();
    const lines = wrapLines(
      description === "" ? "-" : description,
      sheet.fonts.regular,
      BODY_SIZE,
      DESC_WIDTH,
    );
    const height = lines.length * LINE_HEIGHT + 9;

    // Checked before anything is drawn, so a row is never split across pages.
    if (ensureRoom(sheet, height)) drawItemsHeader(sheet);

    const baseline = sheet.y;

    lines.forEach((line, row) => {
      drawText(sheet.page, line, {
        x: MARGIN,
        y: baseline - row * LINE_HEIGHT,
        font: sheet.fonts.regular,
        size: BODY_SIZE,
      });
    });

    // Aligned with the first line of the description, not centred on the row —
    // a two-line description reads as one entry either way.
    const numbers: Array<[number, string]> = [
      [QTY_RIGHT, trimZeros(parseNumber(item.quantity))],
      [RATE_RIGHT, formatAmount(parseNumber(item.rate))],
      [AMOUNT_RIGHT, `${symbol} ${formatAmount(totals.lineTotals[index])}`],
    ];

    for (const [x, value] of numbers) {
      drawText(sheet.page, value, {
        x,
        y: baseline,
        font: sheet.fonts.regular,
        size: BODY_SIZE,
        align: "right",
      });
    }

    sheet.y = baseline - height;
    drawRule(sheet.page, { x: MARGIN, y: sheet.y + 5, width: CONTENT_WIDTH, thickness: 0.5 });
  });
}

function drawItemsHeader(sheet: Sheet): void {
  const { fonts } = sheet;
  const columns: Array<{ text: string; x: number; align: "left" | "right" }> = [
    { text: "DESCRIPTION", x: MARGIN, align: "left" },
    { text: "QTY", x: QTY_RIGHT, align: "right" },
    { text: "RATE", x: RATE_RIGHT, align: "right" },
    { text: "AMOUNT", x: AMOUNT_RIGHT, align: "right" },
  ];

  for (const column of columns) {
    drawText(sheet.page, column.text, {
      x: column.x,
      y: sheet.y,
      font: fonts.bold,
      size: LABEL_SIZE,
      color: MUTED,
      align: column.align,
    });
  }

  sheet.y -= 7;
  drawRule(sheet.page, { x: MARGIN, y: sheet.y, width: CONTENT_WIDTH });
  sheet.y -= 16;
}

function drawTotals(sheet: Sheet, details: InvoiceDetails, totals: Totals, symbol: string): void {
  const { fonts } = sheet;
  const taxLabel = details.taxLabel.trim() === "" ? "Tax" : details.taxLabel.trim();

  // Two rows, a rule and the total — kept together on one page.
  ensureRoom(sheet, 76);
  sheet.y -= 14;

  const rows = [
    { label: "Subtotal", value: `${symbol} ${formatAmount(totals.subtotal)}` },
    {
      label: `${taxLabel} (${trimZeros(totals.taxRate)}%)`,
      value: `${symbol} ${formatAmount(totals.tax)}`,
    },
  ];

  for (const row of rows) {
    drawText(sheet.page, row.label, {
      x: RATE_RIGHT,
      y: sheet.y,
      font: fonts.regular,
      size: BODY_SIZE,
      color: MUTED,
      align: "right",
    });
    drawText(sheet.page, row.value, {
      x: AMOUNT_RIGHT,
      y: sheet.y,
      font: fonts.regular,
      size: BODY_SIZE,
      align: "right",
    });
    sheet.y -= LINE_HEIGHT + 3;
  }

  sheet.y -= 3;
  drawRule(sheet.page, { x: RATE_RIGHT - 120, y: sheet.y, width: AMOUNT_RIGHT - RATE_RIGHT + 120 });
  sheet.y -= 20;

  const total = { font: fonts.bold, size: 11.5, color: ACCENT, align: "right" } as const;
  drawText(sheet.page, "Total", { x: RATE_RIGHT, y: sheet.y, ...total });
  drawText(sheet.page, `${symbol} ${formatAmount(totals.total)}`, {
    x: AMOUNT_RIGHT,
    y: sheet.y,
    ...total,
  });

  sheet.y -= LINE_HEIGHT;
}

function drawNotes(sheet: Sheet, details: InvoiceDetails): void {
  const notes = details.notes.trim();
  if (notes === "") return;

  const width = CONTENT_WIDTH * 0.7;
  const lines = wrapLines(notes, sheet.fonts.regular, BODY_SIZE, width);

  ensureRoom(sheet, lines.length * LINE_HEIGHT + 40);
  sheet.y -= 28;

  drawText(sheet.page, "NOTES", {
    x: MARGIN,
    y: sheet.y,
    font: sheet.fonts.bold,
    size: LABEL_SIZE,
    color: MUTED,
  });
  sheet.y -= 16;

  sheet.y = drawBlock(sheet, notes, MARGIN, sheet.y, width, INK);
}

/**
 * Draws a wrapped block from `y` downward and returns the next free baseline. An
 * empty block returns `y` untouched, so a missing address doesn't move the
 * cursor in either direction.
 */
function drawBlock(
  sheet: Sheet,
  text: string,
  x: number,
  y: number,
  width: number,
  color: typeof INK,
): number {
  if (text.trim() === "") return y;

  let cursor = y;
  for (const line of wrapLines(text.trim(), sheet.fonts.regular, BODY_SIZE, width)) {
    drawText(sheet.page, line, { x, y: cursor, font: sheet.fonts.regular, size: BODY_SIZE, color });
    cursor -= LINE_HEIGHT;
  }

  return cursor;
}

/** 2 rather than 2.00 for a quantity or a tax rate, but 2.5 stays 2.5. */
function trimZeros(value: number): string {
  return `${Math.round(value * 1000) / 1000}`;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message;
  return "Couldn't build the invoice PDF.";
}
