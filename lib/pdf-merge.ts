/**
 * PDF merging for the Merge PDF tool. Files in, one PDF out — the same
 * split as lib/image-to-pdf.ts, so the UI layer stays a thin wrapper and nothing
 * outside this file touches pdf-lib.
 *
 * Neither entry point is pure — both read files and parse them — and both return
 * a result union rather than throwing, so a password-protected file is handled
 * like any other outcome.
 *
 * Loading is split from merging on purpose. A file is parsed once, as it's
 * dropped, which is what lets the list show its page count and flag a file that
 * can't be read; merging then reuses that parse instead of doing it again, so
 * reordering and re-merging a set of large files stays quick.
 */

import { PDFDocument } from "pdf-lib";

import { bytesToBlob } from "./utils";

/**
 * Both the MIME type and the extension: a PDF dragged out of some archive tools
 * arrives with an empty type, and then the extension is all the picker has.
 */
export const ACCEPT_ATTRIBUTE = "application/pdf,.pdf";

/**
 * Parsing and writing happen on the main thread, like the other tools here, so
 * the caps keep a drop from locking the tab up rather than failing. 100 MB is
 * past any scanned document; 300 MB of input is already more than most browsers
 * will hold while writing the result.
 */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024;

export interface LoadedPdf {
  name: string;
  size: number;
  pageCount: number;
  /** @internal Parsed on the way in, so merging doesn't re-read it. */
  readonly doc: PDFDocument;
}

export type LoadPdfResult = { ok: true; pdf: LoadedPdf } | { ok: false; error: string };

export type MergeResult =
  | { ok: true; blob: Blob; pageCount: number }
  | { ok: false; error: string };

export function isPdf(file: File): boolean {
  if (file.type !== "") return file.type === "application/pdf";
  return /\.pdf$/i.test(file.name);
}

/**
 * Reads and parses one file. Called as each file arrives rather than at merge
 * time, so a problem is reported next to the file that caused it.
 */
export async function loadPdf(file: File): Promise<LoadPdfResult> {
  if (!isPdf(file)) {
    return { ok: false, error: `${file.name} isn't a PDF.` };
  }
  if (file.size === 0) {
    return { ok: false, error: `${file.name} is empty.` };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: `${file.name} is over 100 MB — too big to merge in the browser.` };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, error: `Couldn't read ${file.name}.` };
  }

  try {
    const doc = await PDFDocument.load(bytes, {
      // These files are only ever sources to copy pages out of, so there's no
      // point rewriting their modification date on the way in.
      updateMetadata: false,
    });

    const pageCount = doc.getPageCount();
    if (pageCount === 0) {
      return { ok: false, error: `${file.name} has no pages in it.` };
    }

    return { ok: true, pdf: { name: file.name, size: file.size, pageCount, doc } };
  } catch (error) {
    return { ok: false, error: describeLoadError(error, file.name) };
  }
}

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

function describeLoadError(error: unknown, name: string): string {
  const message = error instanceof Error ? error.message : String(error);

  // pdf-lib can open an encrypted file with { ignoreEncryption: true }, but it
  // can't decrypt one: the page contents come out as ciphertext and the merged
  // file is quietly unreadable. Stopping here is the honest outcome.
  if (/encrypt/i.test(message)) {
    return `${name} is encrypted, so its pages can't be copied. Remove the password and try again.`;
  }
  if (/no pdf header|expected instance of pdfdict|failed to parse|stream/i.test(message)) {
    return `Couldn't read ${name} — it may be corrupt or not really a PDF.`;
  }

  return message === ""
    ? `Couldn't read ${name}.`
    : `Couldn't read ${name} — it may be corrupt or not really a PDF.`;
}

function describeMergeError(error: unknown): string {
  if (error instanceof RangeError || (error instanceof Error && /memory|allocat/i.test(error.message))) {
    return "Ran out of memory merging these — try fewer files at a time.";
  }

  return "Couldn't merge these files. One of them may be damaged in a way that only shows up now.";
}
