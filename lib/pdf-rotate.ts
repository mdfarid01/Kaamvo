/**
 * Page rotation for the Rotate PDF tool. One file plus a turn in, one PDF out —
 * the same split as lib/pdf-merge.ts, so the UI layer stays a thin wrapper and
 * nothing outside lib/ touches pdf-lib.
 *
 * This is the one tool here that reads its file a second time instead of using
 * the document parsed on the way in. Rotating is a one-key change to each page,
 * and everything else about the file should come out the other side unchanged —
 * so the original is rewritten in place rather than having its pages copied
 * into a new document, which is what costs a merge or a split its bookmarks and
 * its form fields. Re-reading is what keeps that edit from compounding: turning
 * 90° twice in a row means two separate 90° turns from the file on disk, not
 * one 180° turn nobody asked for.
 *
 * Like the other modules here it returns a result union rather than throwing.
 */

import { degrees } from "pdf-lib";

import { describeLoadError, isOutOfMemory, parsePdf } from "./pdf-load";
import { bytesToBlob } from "./utils";

/** Clockwise, because that's how the buttons are labelled. */
export type Turn = 90 | 180 | 270;

export const DEFAULT_TURN: Turn = 90;

/**
 * 270° clockwise is a quarter turn left, and that's what it's called: nobody
 * reaching for this tool is thinking in degrees clockwise from north.
 */
export const TURNS: Array<{ value: Turn; label: string }> = [
  { value: 90, label: "90° right" },
  { value: 180, label: "180°" },
  { value: 270, label: "90° left" },
];

/** The chosen turn in words, for the line that says what's about to happen. */
export function turnLabel(turn: Turn): string {
  return TURNS.find((option) => option.value === turn)?.label ?? `${turn}°`;
}

export type RotateResult =
  | { ok: true; blob: Blob; pageCount: number; rotatedCount: number }
  | { ok: false; error: string };

/**
 * Turns the chosen pages and writes the file back out. `pages` is a list of
 * page numbers, or null for every page.
 *
 * The turn is relative: a page that was already sideways ends up a further
 * quarter turn round, which is what someone correcting a scan expects.
 */
export async function rotatePdf(
  file: File,
  turn: Turn,
  pages: number[] | null,
): Promise<RotateResult> {
  if (pages !== null && pages.length === 0) {
    return { ok: false, error: "Choose at least one page." };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    // The file was readable when it was dropped, so this is a file that has
    // moved or changed on disk since — worth saying, rather than blaming the PDF.
    return { ok: false, error: `Couldn't read ${file.name} again — has it moved or changed?` };
  }

  const loaded = await parsePdf(bytes, file.name, file.size);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const doc = loaded.pdf.doc;
  const pageCount = doc.getPageCount();

  const missing = pages?.find((page) => page < 1 || page > pageCount);
  if (missing !== undefined) {
    return { ok: false, error: `There’s no page ${missing} in ${file.name}.` };
  }

  try {
    const targets =
      pages === null ? doc.getPages() : pages.map((page) => doc.getPage(page - 1));

    for (const page of targets) {
      page.setRotation(degrees(add(page.getRotation().angle, turn)));
    }

    return {
      ok: true,
      blob: bytesToBlob(await doc.save(), "application/pdf"),
      pageCount,
      rotatedCount: targets.length,
    };
  } catch (error) {
    return { ok: false, error: describeRotateError(error, file.name) };
  }
}

/** report.pdf becomes report-rotated.pdf, so a download can't overwrite it. */
export function rotatedFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim();
  return `${base === "" ? "rotated" : `${base}-rotated`}.pdf`;
}

/**
 * A page's existing turn plus a new one, brought back into 0–270.
 *
 * The snap is for files that don't follow the spec: /Rotate is required to be a
 * multiple of 90 (PDF 32000-1 §7.7.3.3), viewers round the ones that aren't,
 * and pdf-lib throws on them. Rounding matches what the person was looking at
 * when they decided which way to turn it.
 */
function add(existing: number, turn: Turn): number {
  const snapped = Math.round(existing / 90) * 90;
  return (((snapped + turn) % 360) + 360) % 360;
}

function describeRotateError(error: unknown, name: string): string {
  if (isOutOfMemory(error)) {
    return "Ran out of memory writing that — the file may be too big to rewrite in the browser.";
  }

  return describeLoadError(error, name);
}
