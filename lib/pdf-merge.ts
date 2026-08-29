/**
 * PDF merging for the Merge PDF tool. Loaded files in, one PDF out — the same
 * split as lib/image-to-pdf.ts, so the UI layer stays a thin wrapper and nothing
 * outside lib/ touches pdf-lib.
 *
 * Reading a file is lib/pdf-load.ts's job, shared with Split PDF and Rotate
 * PDF. What's left here is the merge itself, which returns a result union
 * rather than throwing, like everything else in this directory.
 */

import { PDFDocument } from "pdf-lib";

import { isOutOfMemory } from "./pdf-load";
import type { LoadedPdf } from "./pdf-load";
import { bytesToBlob } from "./utils";

/**
 * Merging is the only tool here that holds several files at once, so it's the
 * only one with a total. 300 MB of input is already more than most browsers
 * will hold while writing the result.
 */
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024;

export type MergeResult =
  | { ok: true; blob: Blob; pageCount: number }
  | { ok: false; error: string };

/**
 * Copies every page of every file into one document, in the order given.
 * Returns the finished file rather than triggering a download, so the caller
 * decides what to do with it.
 *
 * One file in is a valid merge, not an error: it comes back as a copy, which is
 * a reasonable thing to ask for and a pointless thing to refuse.
 */
export async function mergePdfs(pdfs: LoadedPdf[]): Promise<MergeResult> {
  if (pdfs.length === 0) {
    return { ok: false, error: "Add a PDF first." };
  }

  try {
    const merged = await PDFDocument.create();

    for (const pdf of pdfs) {
      // copyPages brings each page's content and annotations across. Interactive
      // form fields are the known gap: their widgets copy, but the form itself
      // doesn't, so a merged file's fields are no longer fillable.
      const pages = await merged.copyPages(pdf.doc, pdf.doc.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }

    return {
      ok: true,
      blob: bytesToBlob(await merged.save(), "application/pdf"),
      pageCount: merged.getPageCount(),
    };
  } catch (error) {
    return { ok: false, error: describeMergeError(error) };
  }
}

/**
 * Two files or more get a plain merged.pdf. A single file keeps its name with a
 * suffix, so the download can't quietly overwrite the file it came from.
 */
export function mergedFileName(names: string[]): string {
  if (names.length !== 1) return "merged.pdf";

  const base = names[0].replace(/\.[^.]+$/, "").trim();
  return `${base === "" ? "merged" : `${base}-merged`}.pdf`;
}

function describeMergeError(error: unknown): string {
  if (isOutOfMemory(error)) {
    return "Ran out of memory merging these — try fewer files at a time.";
  }

  return "Couldn't merge these files. One of them may be damaged in a way that only shows up now.";
}
