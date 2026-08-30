/**
 * Page numbering for Add Page Numbers. One file plus a position and a format in,
 * one PDF out — the same shape as lib/pdf-watermark.ts, and for the same reason
 * it re-reads its file: numbering is an addition to each page, the rest of the
 * file should come out unchanged, and running it twice shouldn't print two
 * numbers on top of each other.
 */

import { StandardFonts } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";

import { describeLoadError, isOutOfMemory, parsePdf } from "./pdf-load";
import { INK, toWinAnsi } from "./pdf-text";
import { bytesToBlob } from "./utils";

export type NumberPosition = "bottom-center" | "bottom-right" | "top-right";

/** "1", "Page 1" or "1 of 12". */
export type NumberFormat = "plain" | "page-n" | "n-of-total";

export interface NumberOptions {
  position: NumberPosition;
  format: NumberFormat;
}

export const DEFAULT_POSITION: NumberPosition = "bottom-center";
export const DEFAULT_FORMAT: NumberFormat = "plain";

export const POSITIONS: Array<{ value: NumberPosition; label: string }> = [
  { value: "bottom-center", label: "Bottom centre" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "top-right", label: "Top right" },
];

export const FORMATS: Array<{ value: NumberFormat; label: string }> = [
  { value: "plain", label: "1" },
  { value: "page-n", label: "Page 1" },
  { value: "n-of-total", label: "1 of N" },
];

/** ~10 mm in from the edge: clear of any printer's unprintable margin. */
const EDGE = 28;

const SIZE = 10;

export type NumberResult =
  | { ok: true; blob: Blob; pageCount: number }
  | { ok: false; error: string };

export async function addPageNumbers(
  file: File,
  options: NumberOptions,
): Promise<NumberResult> {
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, error: `Couldn't read ${file.name} again — has it moved or changed?` };
  }

  const loaded = await parsePdf(bytes, file.name, file.size);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const doc = loaded.pdf.doc;

  try {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();

    pages.forEach((page, index) => {
      draw(page, font, labelFor(index + 1, pages.length, options.format), options.position);
    });

    return {
      ok: true,
      blob: bytesToBlob(await doc.save(), "application/pdf"),
      pageCount: pages.length,
    };
  } catch (error) {
    if (isOutOfMemory(error)) {
      return { ok: false, error: "Ran out of memory writing that — the file may be too big." };
    }
    return { ok: false, error: describeLoadError(error, file.name) };
  }
}

/** report.pdf becomes report-numbered.pdf, so a download can't overwrite it. */
export function numberedFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim();
  return `${base === "" ? "numbered" : `${base}-numbered`}.pdf`;
}

/** What a given page prints, also used for the preview line in the UI. */
export function labelFor(page: number, total: number, format: NumberFormat): string {
  if (format === "page-n") return `Page ${page}`;
  if (format === "n-of-total") return `${page} of ${total}`;
  return String(page);
}

/**
 * One number on one page. Text is right-aligned by hand for the two right-hand
 * positions — pdf-lib draws from the left edge of the string, and a page 9 and a
 * page 10 would otherwise sit a digit apart.
 *
 * As in lib/pdf-watermark.ts, a page carrying its own /Rotate is drawn in its
 * unrotated space, so on a sideways page the number lands on what the viewer
 * shows as a side edge.
 */
function draw(page: PDFPage, font: PDFFont, label: string, position: NumberPosition): void {
  const text = toWinAnsi(label);
  const { width, height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(text, SIZE);

  const x =
    position === "bottom-center" ? width / 2 - textWidth / 2 : width - EDGE - textWidth;
  // Measured to the baseline, so the descender-free digits sit EDGE from the
  // trimmed edge either way.
  const y = position === "top-right" ? height - EDGE - SIZE : EDGE;

  page.drawText(text, { x, y, size: SIZE, font, color: INK });
}
