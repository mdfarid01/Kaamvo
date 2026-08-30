/**
 * The stamp behind Watermark PDF. One file plus some text in, one PDF out — the
 * same split as lib/pdf-rotate.ts, so the UI layer stays a thin wrapper and
 * nothing outside lib/ touches pdf-lib.
 *
 * Like Rotate PDF this re-reads its file rather than using the document parsed
 * on the way in: stamping is an addition to each page and everything else about
 * the file should survive, so the original is rewritten in place instead of
 * having its pages copied. Re-reading also keeps a second press from stacking a
 * second watermark on top of the first.
 *
 * Text goes through lib/pdf-text.ts's toWinAnsi, since the standard fonts here
 * throw on a character they can't encode rather than dropping it.
 */

import { StandardFonts, degrees, rgb } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";

import { describeLoadError, isOutOfMemory, parsePdf } from "./pdf-load";
import { toWinAnsi } from "./pdf-text";
import { bytesToBlob } from "./utils";

/** Flat across the page, or the usual corner-to-corner diagonal. */
export type WatermarkAngle = "diagonal" | "horizontal";

export interface WatermarkOptions {
  text: string;
  /** 0.1–0.5. Anything darker stops being a watermark and starts hiding the page. */
  opacity: number;
  angle: WatermarkAngle;
}

export const DEFAULT_TEXT = "CONFIDENTIAL";
export const DEFAULT_OPACITY = 0.2;

export const MIN_OPACITY = 0.1;
export const MAX_OPACITY = 0.5;

/** One stamp per page, centred — see the note on sizing below. */
const GRAY = rgb(0.45, 0.45, 0.45);

/**
 * How much of the page the stamp is allowed to span. Measured along the line the
 * text runs on, so the diagonal gets the page's diagonal and the flat one gets
 * its width; short of 1 either way, to leave a margin.
 */
const SPAN = 0.78;

const MIN_SIZE = 8;
const MAX_SIZE = 160;

export type WatermarkResult =
  | { ok: true; blob: Blob; pageCount: number }
  | { ok: false; error: string };

export async function watermarkPdf(
  file: File,
  options: WatermarkOptions,
): Promise<WatermarkResult> {
  const text = toWinAnsi(options.text.trim());
  if (text === "") {
    return { ok: false, error: "Type the words you want stamped on each page." };
  }

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
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const opacity = clampOpacity(options.opacity);
    const pages = doc.getPages();

    for (const page of pages) {
      stamp(page, font, text, opacity, options.angle);
    }

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

/** report.pdf becomes report-watermarked.pdf, so a download can't overwrite it. */
export function watermarkedFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim();
  return `${base === "" ? "watermarked" : `${base}-watermarked`}.pdf`;
}

export function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_OPACITY;
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, value));
}

/**
 * One line of text across the middle of a page.
 *
 * pdf-lib rotates drawn text about its own start point, not about its centre, so
 * the anchor is worked back from where the middle of the line should land: half
 * the text's width back along the line it runs on, and half its cap height back
 * along the perpendicular. Without the second offset a diagonal stamp sits
 * visibly below the centre of the page.
 *
 * A page with its own /Rotate set is drawn in its unrotated space, so on a
 * sideways scan the stamp comes out turned with the page rather than with the
 * text you see — acceptable for a watermark, and the alternative is undoing the
 * page's rotation here.
 */
function stamp(
  page: PDFPage,
  font: PDFFont,
  text: string,
  opacity: number,
  angle: WatermarkAngle,
): void {
  const { width, height } = page.getSize();
  const theta = angle === "diagonal" ? Math.atan2(height, width) : 0;

  const span = angle === "diagonal" ? Math.hypot(width, height) : width;
  const size = fitSize(text, font, span * SPAN);

  const textWidth = font.widthOfTextAtSize(text, size);
  // Cap height rather than the full em: what reads as the middle of a line of
  // capitals is above the baseline, not on it.
  const half = size * 0.35;

  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  page.drawText(text, {
    x: width / 2 - (textWidth / 2) * cos + half * sin,
    y: height / 2 - (textWidth / 2) * sin - half * cos,
    size,
    font,
    color: GRAY,
    opacity,
    rotate: degrees((theta * 180) / Math.PI),
  });
}

/**
 * The size at which `text` spans `target`, clamped. Measured once at 10pt and
 * scaled, since a standard font's advance widths are linear in the size.
 */
function fitSize(text: string, font: PDFFont, target: number): number {
  const at10 = font.widthOfTextAtSize(text, 10);
  if (at10 <= 0) return MIN_SIZE;

  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round((target / at10) * 10)));
}
