/**
 * Page extraction for the Split PDF tool. One loaded file plus a selection in,
 * one PDF out — the same split as lib/pdf-merge.ts, so the UI layer stays a
 * thin wrapper and nothing outside lib/ touches pdf-lib.
 *
 * The output is a single PDF holding the chosen pages, not a zip of one file
 * per page. Two reasons. pdf-lib doesn't zip, so the alternative is a new
 * dependency or a hand-rolled archive writer, and neither earns its keep for an
 * output most people are going to open, read and keep as one document. And a
 * selection is written the way it was typed, so "5, 1-3" is a reorder as well
 * as an extraction — an idea a directory of page-5.pdf files can't express.
 * Somebody who genuinely wants the pages apart can run the tool once per page,
 * and the file naming below is built for exactly that.
 *
 * Like the other modules here this returns a result union rather than throwing.
 */

import { PDFDocument } from "pdf-lib";

import { isOutOfMemory } from "./pdf-load";
import type { LoadedPdf } from "./pdf-load";
import { bytesToBlob } from "./utils";

export type SplitResult =
  | { ok: true; blob: Blob; pageCount: number }
  | { ok: false; error: string };

/**
 * Copies the chosen pages into a new document, in the order given. The source
 * isn't touched, so the same file can be split again a different way without
 * being re-read.
 */
export async function splitPdf(source: LoadedPdf, pages: number[]): Promise<SplitResult> {
  if (pages.length === 0) {
    return { ok: false, error: "Choose at least one page." };
  }

  // parsePageRanges already checks this against the count it was given. Checked
  // again here because this function is what turns a page number into an index,
  // and an out-of-range index is a pdf-lib throw rather than a message.
  const missing = pages.find((page) => page < 1 || page > source.pageCount);
  if (missing !== undefined) {
    return { ok: false, error: `There’s no page ${missing} in ${source.name}.` };
  }

  try {
    const out = await PDFDocument.create();

    // copyPages brings each page's content, annotations and rotation across.
    // What can't come with it is anything that lives above the page: bookmarks
    // and interactive form definitions don't survive, the same as a merge.
    const copied = await out.copyPages(
      source.doc,
      pages.map((page) => page - 1),
    );
    for (const page of copied) out.addPage(page);

    return {
      ok: true,
      blob: bytesToBlob(await out.save(), "application/pdf"),
      pageCount: out.getPageCount(),
    };
  } catch (error) {
    return { ok: false, error: describeSplitError(error) };
  }
}

/**
 * Names the download after what's in it: report.pdf split to page 5 gives
 * report-page-5.pdf, and pages 1 to 3 give report-pages-1-3.pdf. A selection
 * that isn't one run falls back to report-pages.pdf rather than growing a
 * filename the length of the selection.
 *
 * Either way the name changes, so a download can't quietly overwrite the file
 * it came from.
 */
export function splitFileName(name: string, pages: number[]): string {
  const trimmed = name.replace(/\.[^.]+$/, "").trim();
  const base = trimmed === "" ? "split" : trimmed;

  if (pages.length === 0) return `${base}-pages.pdf`;
  if (pages.length === 1) return `${base}-page-${pages[0]}.pdf`;

  const ascendingRun = pages.every((page, index) => index === 0 || page === pages[index - 1] + 1);
  if (ascendingRun) return `${base}-pages-${pages[0]}-${pages[pages.length - 1]}.pdf`;

  return `${base}-pages.pdf`;
}

function describeSplitError(error: unknown): string {
  if (isOutOfMemory(error)) {
    return "Ran out of memory writing that — try extracting fewer pages at a time.";
  }

  return "Couldn't pull those pages out. The file may be damaged in a way that only shows up now.";
}
