/**
 * Re-saving a PDF smaller, for the Compress PDF tool. One file in, one file out
 * — the same split as lib/pdf-rotate.ts, so the UI layer stays a thin wrapper
 * and nothing outside lib/ touches pdf-lib.
 *
 * What this actually does, because the name promises more than any in-browser
 * tool can deliver: pdf-lib parses the file into an object graph and writes a
 * fresh one from it. That drops whatever the original was carrying and no longer
 * referencing — the old copies left behind by incremental saves, orphaned
 * objects, unused entries — and packs the small objects that remain into object
 * streams, which is pdf-lib's default and the one real lever `save()` has.
 *
 * What it does not do is touch the embedded images, and on most PDFs that people
 * call "too big" the images *are* the file: a scan or a photo-heavy report will
 * barely move. Decoding and re-encoding every image is a different tool with a
 * different cost, and pretending otherwise here would just waste someone's time.
 * The UI says this in as many words, and a file that comes out larger is handed
 * back untouched rather than dressed up as a saving.
 */

import { describeLoadError, isOutOfMemory, parsePdf } from "./pdf-load";
import { bytesToBlob } from "./utils";

export type CompressResult =
  | {
      ok: true;
      blob: Blob;
      originalSize: number;
      compressedSize: number;
      /** False when the rewrite came out no smaller, and `blob` is the original. */
      reduced: boolean;
      pageCount: number;
    }
  | { ok: false; error: string };

/**
 * Rewrites the file and hands back whichever version is smaller.
 *
 * Like Rotate PDF this re-reads the file rather than using the document parsed
 * on the way in: the whole point is to write out a file built cleanly from the
 * original bytes, and a document that's already been handled elsewhere isn't
 * that.
 */
export async function compressPdf(file: File): Promise<CompressResult> {
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    // The file was readable when it was dropped, so this is a file that has
    // moved or changed on disk since — worth saying, rather than blaming the PDF.
    return { ok: false, error: `Couldn't read ${file.name} again — has it moved or changed?` };
  }

  const originalSize = bytes.byteLength;
  const loaded = await parsePdf(bytes, file.name, file.size);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const doc = loaded.pdf.doc;
  const pageCount = doc.getPageCount();

  try {
    const saved = await doc.save({
      // Already pdf-lib's default, set explicitly because it's the entire
      // mechanism: without it every small object is written out with its own
      // header and the file comes out bigger than it went in.
      useObjectStreams: true,
      // Not the default, and the one option here that actually changes the
      // number. On a PDF with form fields pdf-lib otherwise regenerates every
      // field's appearance stream on save, which adds bytes to the file and
      // redraws widgets this tool promised not to touch — so a form would come
      // back the same size or larger, which is exactly the "0%" people report.
      updateFieldAppearances: false,
    });

    const compressedSize = saved.byteLength;

    // A PDF that was already written this way has nothing left to give, and
    // some come out a few bytes larger. Handing back the original is the honest
    // outcome — the same call lib/image-compressor.ts makes.
    if (compressedSize >= originalSize) {
      return {
        ok: true,
        blob: new Blob([bytes], { type: "application/pdf" }),
        originalSize,
        compressedSize: originalSize,
        reduced: false,
        pageCount,
      };
    }

    return {
      ok: true,
      blob: bytesToBlob(saved, "application/pdf"),
      originalSize,
      compressedSize,
      reduced: true,
      pageCount,
    };
  } catch (error) {
    return { ok: false, error: describeCompressError(error, file.name) };
  }
}

/** report.pdf becomes report-compressed.pdf, so a download can't overwrite it. */
export function compressedFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim();
  return `${base === "" ? "compressed" : `${base}-compressed`}.pdf`;
}

/**
 * Whole percent saved, floored so it never rounds a 0.4% saving up to 1% and
 * oversells the result — the same rule lib/image-compressor.ts uses.
 */
export function savingsPercent(originalSize: number, compressedSize: number): number {
  if (originalSize === 0) return 0;
  return Math.floor(((originalSize - compressedSize) / originalSize) * 100);
}

/**
 * Whether the rewrite is worth presenting as a saving at all.
 *
 * A file can come out genuinely smaller and still floor to 0% — trimming 3 KB
 * off a 4 MB scan is a real rewrite and a meaningless result, and reporting it
 * as "Saved 0%" reads as the tool failing rather than as the file already being
 * tight. Below a whole percent the UI explains instead of scoring.
 */
export function isMeaningfulSaving(originalSize: number, compressedSize: number): boolean {
  return savingsPercent(originalSize, compressedSize) >= 1;
}

function describeCompressError(error: unknown, name: string): string {
  if (isOutOfMemory(error)) {
    return "Ran out of memory writing that — the file may be too big to rewrite in the browser.";
  }

  return describeLoadError(error, name);
}
