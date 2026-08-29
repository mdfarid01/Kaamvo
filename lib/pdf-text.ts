/**
 * Shared typesetting for the two tools that write a PDF from a form — Invoice
 * Generator and Rent Receipt. Both lay out short lines of text on an A4 page
 * with a standard font, and neither needs anything the other doesn't, so the
 * page geometry, the colours, the line wrapping and the encoding guard live
 * here rather than twice.
 *
 * Unlike lib/image-to-pdf.ts this file touches no browser API: it's pdf-lib and
 * arithmetic, so the two callers stay pure enough to reason about and only their
 * logo handling has to run client-side.
 *
 * The encoding guard is the part that isn't obvious. pdf-lib's standard fonts
 * are WinAnsi-encoded, and handing one a character it can't encode throws
 * mid-save rather than dropping it — so a name in Devanagari, or a rupee sign,
 * would fail the whole download. toWinAnsi is applied on every string on its
 * way onto a page, so an unsupported character costs one glyph instead of the
 * document.
 */

import { StandardFonts, rgb } from "pdf-lib";
import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";

/** A4 in points, the same numbers lib/image-to-pdf.ts uses. */
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

/** ~18 mm, a margin that survives any printer's unprintable edge. */
export const MARGIN = 51;

/** Millimetres to points, for anything specified as a physical size. */
export function mm(value: number): number {
  return (value * 72) / 25.4;
}

/**
 * The site's own ink, muted and hairline, so a generated document looks like it
 * came from here. The page itself stays white — it's meant to be printed, and
 * the cream canvas would be a full-bleed ink cost.
 */
export const INK = rgb(0.173, 0.173, 0.165); // #2C2C2A
export const MUTED = rgb(0.431, 0.424, 0.392); // #6E6C64
export const LINE = rgb(0.847, 0.835, 0.796); // #D8D5CB
export const ACCENT = rgb(0.639, 0.247, 0.118); // #A33F1E

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/**
 * Helvetica and its bold, which every PDF reader has: nothing is embedded, so a
 * one-page invoice stays a few kilobytes even before the logo.
 */
export async function loadFonts(pdf: PDFDocument): Promise<Fonts> {
  const [regular, bold] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);

  return { regular, bold };
}

/**
 * Characters that have a sensible ASCII stand-in. The rupee sign is the one
 * that matters here — it's the obvious symbol for an Indian invoice or rent
 * receipt and WinAnsi simply doesn't have it, so "Rs." is what gets printed.
 */
const SUBSTITUTES: Record<string, string> = {
  "₹": "Rs.", // ₹
  " ": " ", // no-break space, which some readers render oddly
  "•": "-", // •
  "−": "-", // −
  "－": "-", // －
};

/**
 * The characters WinAnsi carries above Latin-1, at 0x80–0x9F. Curly quotes, the
 * dashes and the euro sign are all in here, which is why they aren't in
 * SUBSTITUTES — they encode as themselves.
 */
const WIN_ANSI_EXTRAS = new Set(
  [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
    0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153,
    0x017e, 0x0178,
  ].map((code) => String.fromCharCode(code)),
);

/**
 * Everything a standard font can put on a page, with the rest replaced by a
 * question mark rather than dropped — a name that came out as "?? ?????" is
 * visibly wrong, where one silently shortened to nothing looks like the tool
 * lost it.
 */
export function toWinAnsi(text: string): string {
  let out = "";

  for (const char of text) {
    const substitute = SUBSTITUTES[char];
    if (substitute !== undefined) {
      out += substitute;
      continue;
    }

    const code = char.codePointAt(0) ?? 0;

    // Tab and newline are handled by the caller (wrapLines splits on them);
    // anything else below 0x20 is a control character with no glyph.
    if (code < 0x20) {
      out += code === 0x09 ? " " : "";
      continue;
    }
    if (code <= 0x7e || (code >= 0xa0 && code <= 0xff)) {
      out += char;
      continue;
    }

    out += WIN_ANSI_EXTRAS.has(char) ? char : "?";
  }

  return out;
}

/** Width of a string once encoded, which is the width that gets drawn. */
export function widthOf(text: string, font: PDFFont, size: number): number {
  return font.widthOfTextAtSize(toWinAnsi(text), size);
}

/**
 * Greedy word wrap to a pixel width. Blank lines in the input are kept, so a
 * notes field with a paragraph break prints with one.
 *
 * A single word wider than the column is broken mid-word rather than left to
 * run off the page — a pasted URL in a notes field is the case that happens.
 */
export function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/[ \t]+/).filter((word) => word !== "");
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of words) {
      const candidate = current === "" ? word : `${current} ${word}`;
      if (widthOf(candidate, font, size) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current !== "") lines.push(current);
      if (widthOf(word, font, size) <= maxWidth) {
        current = word;
        continue;
      }

      const pieces = breakWord(word, font, size, maxWidth);
      lines.push(...pieces.slice(0, -1));
      current = pieces[pieces.length - 1];
    }

    lines.push(current);
  }

  return lines;
}

function breakWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const pieces: string[] = [];
  let current = "";

  for (const char of word) {
    if (current !== "" && widthOf(current + char, font, size) > maxWidth) {
      pieces.push(current);
      current = char;
      continue;
    }
    current += char;
  }

  pieces.push(current);
  return pieces;
}

export interface TextOptions {
  x: number;
  /** Baseline, as pdf-lib measures it — y grows upward from the page bottom. */
  y: number;
  font: PDFFont;
  size: number;
  color?: ReturnType<typeof rgb>;
  /** Where `x` sits relative to the text. Defaults to its left edge. */
  align?: "left" | "right" | "center";
}

/** The one place a string reaches a page, so the encoding guard can't be missed. */
export function drawText(page: PDFPage, text: string, options: TextOptions): void {
  const encoded = toWinAnsi(text);
  if (encoded === "") return;

  const width = options.font.widthOfTextAtSize(encoded, options.size);
  const align = options.align ?? "left";
  const x =
    align === "right"
      ? options.x - width
      : align === "center"
        ? options.x - width / 2
        : options.x;

  page.drawText(encoded, {
    x,
    y: options.y,
    font: options.font,
    size: options.size,
    color: options.color ?? INK,
  });
}

/** A hairline rule. pdf-lib has no line primitive thinner than a drawn rect. */
export function drawRule(
  page: PDFPage,
  options: { x: number; y: number; width: number; color?: ReturnType<typeof rgb>; thickness?: number },
): void {
  page.drawRectangle({
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.thickness ?? 0.75,
    color: options.color ?? LINE,
  });
}

/**
 * Two decimals with thousands separators. Deliberately the plain three-digit
 * grouping rather than the Indian lakh/crore grouping, even though the rupee is
 * the default currency: a document that may be read anywhere is better off with
 * the grouping every reader parses the same way.
 */
export function formatAmount(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const [whole, fraction] = Math.abs(safe).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${safe < 0 ? "-" : ""}${grouped}.${fraction}`;
}

/**
 * Reads a number out of a form field. Blank, a stray comma or an outright
 * non-number all come back as 0 rather than NaN, so a half-filled row shows a
 * total of 0.00 instead of poisoning every sum below it.
 */
export function parseNumber(value: string): number {
  const parsed = Number.parseFloat(value.replace(/[, ]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Turns a yyyy-mm-dd from a date input into "5 April 2026". */
export function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match === null) return value.trim();

  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1];
  if (name === undefined) return value.trim();

  return `${Number(day)} ${name} ${year}`;
}

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Today as yyyy-mm-dd in the visitor's own zone, for a date input's default. */
export function todayValue(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

/** Strips a path and extension off a name, for naming a download after it. */
export function slugifyName(name: string, fallback: string): string {
  const cleaned = name
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return cleaned === "" ? fallback : cleaned.slice(0, 48);
}
