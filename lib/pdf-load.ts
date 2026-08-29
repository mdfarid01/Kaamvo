/**
 * Reading a PDF in, shared by every tool that takes one: Merge PDF, Split PDF
 * and Rotate PDF. Nothing here is specific to what happens next — a file is
 * checked, parsed, and reported on, and the tool's own module does the work.
 *
 * This isn't pure — it reads a file and parses it — and it returns a result
 * union rather than throwing, so a password-protected file is an outcome like
 * any other.
 *
 * Loading is split from the work on purpose. A file is parsed once, as it's
 * dropped, which is what lets a tool show its page count and flag a file that
 * can't be read before anyone presses a button.
 */

import { PDFDocument } from "pdf-lib";

/**
 * Both the MIME type and the extension: a PDF dragged out of some archive tools
 * arrives with an empty type, and then the extension is all the picker has.
 */
export const ACCEPT_ATTRIBUTE = "application/pdf,.pdf";

/**
 * Parsing and writing happen on the main thread, like the other tools here, so
 * the cap keeps a drop from locking the tab up rather than failing. 100 MB is
 * past any scanned document.
 */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export interface LoadedPdf {
  name: string;
  size: number;
  pageCount: number;
  /** @internal Parsed on the way in, so the tool doesn't re-read it. */
  readonly doc: PDFDocument;
}

export type LoadPdfResult = { ok: true; pdf: LoadedPdf } | { ok: false; error: string };

export function isPdf(file: File): boolean {
  if (file.type !== "") return file.type === "application/pdf";
  return /\.pdf$/i.test(file.name);
}

/**
 * Reads and parses one file. Called as each file arrives rather than at the
 * point of doing the work, so a problem is reported next to the file that
 * caused it.
 */
export async function loadPdf(file: File): Promise<LoadPdfResult> {
  if (!isPdf(file)) {
    return { ok: false, error: `${file.name} isn't a PDF.` };
  }
  if (file.size === 0) {
    return { ok: false, error: `${file.name} is empty.` };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: `${file.name} is over 100 MB — too big to open in the browser.` };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, error: `Couldn't read ${file.name}.` };
  }

  return parsePdf(bytes, file.name, file.size);
}

/**
 * The parse on its own, for a tool that already has the bytes. Rotate PDF reads
 * its file a second time when it runs (see lib/pdf-rotate.ts) and needs the
 * same checks and the same wording on the way through.
 */
export async function parsePdf(
  bytes: ArrayBuffer,
  name: string,
  size: number,
): Promise<LoadPdfResult> {
  try {
    const doc = await PDFDocument.load(bytes, {
      // A file opened here is either a source to copy pages out of or one
      // that's about to be rewritten anyway, so there's no point touching its
      // modification date on the way in.
      updateMetadata: false,
    });

    const pageCount = doc.getPageCount();
    if (pageCount === 0) {
      return { ok: false, error: `${name} has no pages in it.` };
    }

    return { ok: true, pdf: { name, size, pageCount, doc } };
  } catch (error) {
    return { ok: false, error: describeLoadError(error, name) };
  }
}

export function describeLoadError(error: unknown, name: string): string {
  const message = error instanceof Error ? error.message : String(error);

  // pdf-lib can open an encrypted file with { ignoreEncryption: true }, but it
  // can't decrypt one: the page contents come out as ciphertext and the result
  // is quietly unreadable. Stopping here is the honest outcome.
  if (/encrypt/i.test(message)) {
    return `${name} is encrypted, so its pages can't be read. Remove the password and try again.`;
  }
  if (/no pdf header|expected instance of pdfdict|failed to parse|stream/i.test(message)) {
    return `Couldn't read ${name} — it may be corrupt or not really a PDF.`;
  }

  return message === ""
    ? `Couldn't read ${name}.`
    : `Couldn't read ${name} — it may be corrupt or not really a PDF.`;
}

/**
 * Shared by the tools that write a file out. A RangeError from a typed-array
 * allocation is what running out of room looks like from here.
 */
export function isOutOfMemory(error: unknown): boolean {
  return (
    error instanceof RangeError || (error instanceof Error && /memory|allocat/i.test(error.message))
  );
}
