/**
 * PDF → PNG/JPG for the PDF to Image tool. One PDF in, one image per page out —
 * the same split as lib/pdf-to-ppt.ts, which renders pages the same way and
 * shares lib/pdfjs.ts to do it. The UI layer stays a thin wrapper and nothing
 * outside lib/ touches pdfjs-dist.
 *
 * The pages come back as an array of blobs rather than one file, because there
 * is no zip library in this project and pulling one in for a tool that can hand
 * over the same pages directly isn't worth the bundle. The UI downloads them one
 * at a time and says so.
 *
 * Like the other converters here it returns a result union rather than throwing,
 * so a PDF that runs the tab out of memory is an outcome and not a crash.
 */

import { describeLoadError, isOutOfMemory } from "./pdf-load";
import { SAFE_DOCUMENT_OPTIONS, loadPdfjs } from "./pdfjs";

export type ImageFormat = "png" | "jpg";

export const DEFAULT_FORMAT: ImageFormat = "png";

export const FORMATS: Array<{
  value: ImageFormat;
  label: string;
  hint: string;
  type: string;
}> = [
  { value: "png", label: "PNG", hint: "lossless", type: "image/png" },
  { value: "jpg", label: "JPG", hint: "smaller", type: "image/jpeg" },
];

export type Resolution = "standard" | "high";

export const DEFAULT_RESOLUTION: Resolution = "standard";

/**
 * Render width in pixels. 1600 is wider than most screens will show the page at
 * and lands well under a megabyte per page; 3200 is for a page that will be
 * zoomed into, printed, or cropped down to a detail.
 */
export const RESOLUTIONS: Array<{
  value: Resolution;
  label: string;
  hint: string;
  width: number;
}> = [
  { value: "standard", label: "Standard", hint: "1600px", width: 1600 },
  { value: "high", label: "High", hint: "3200px", width: 3200 },
];

/**
 * Lower than PDF to PPT's 50 on purpose. There every page's image goes into one
 * deck and the page itself is freed as it's written; here all of them stay live
 * as blobs, plus a preview URL each, until the tool is cleared — so the cap is
 * what keeps a long PDF from filling the tab up.
 */
export const MAX_PAGES = 30;

/** High enough that the re-encode isn't what anyone notices, matching lib/image-canvas.ts. */
const JPG_QUALITY = 0.92;

export interface RenderedPage {
  pageNumber: number;
  /** Ready to download, already named. */
  name: string;
  blob: Blob;
  width: number;
  height: number;
}

export type PdfToImagesResult =
  | { ok: true; pages: RenderedPage[] }
  | { ok: false; error: string };

/** Called after each page, so the button can say where it's got to. */
export type ProgressHandler = (rendered: number, total: number) => void;

/**
 * Renders every page at the chosen width and encodes each one. The file is read
 * here rather than taken as bytes because the tool already parsed it once with
 * pdf-lib to show a page count (see lib/pdf-load.ts), and pdfjs detaches
 * whatever buffer it's handed — so it gets its own copy.
 */
export async function pdfToImages(
  file: File,
  format: ImageFormat,
  resolution: Resolution,
  onProgress?: ProgressHandler,
): Promise<PdfToImagesResult> {
  const type = FORMATS.find((option) => option.value === format)?.type ?? FORMATS[0].type;
  const targetWidth =
    RESOLUTIONS.find((option) => option.value === resolution)?.width ?? RESOLUTIONS[0].width;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: `Couldn't read ${file.name} again — has it moved or changed?` };
  }

  const pdfjs = await loadPdfjs();

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]> | null = null;

  try {
    doc = await pdfjs.getDocument({ data: bytes, ...SAFE_DOCUMENT_OPTIONS }).promise;

    const pageCount = doc.numPages;
    if (pageCount === 0) {
      return { ok: false, error: `${file.name} has no pages in it.` };
    }
    if (pageCount > MAX_PAGES) {
      return {
        ok: false,
        error: `${file.name} has ${pageCount} pages — this tool renders up to ${MAX_PAGES} at a time. Use Split PDF to take a section first.`,
      };
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context === null) {
      return { ok: false, error: "Couldn't get a canvas to draw the pages on." };
    }

    const pages: RenderedPage[] = [];

    for (let number = 1; number <= pageCount; number++) {
      const page = await doc.getPage(number);

      // A viewport at scale 1 is the page in points, so the scale that lands on
      // the target pixel width is the target over that. There's nothing to lose
      // by going up: a PDF page is instructions, not pixels, so it re-renders
      // sharp at any size.
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: targetWidth / base.width });

      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      context.clearRect(0, 0, canvas.width, canvas.height);

      // pdfjs paints white before it draws, which is what makes JPG safe here:
      // a PDF page has no background of its own, and JPEG has no alpha, so an
      // unpainted canvas would come out solid black instead of transparent.
      await page.render({ canvas, viewport }).promise;
      page.cleanup();

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, type, format === "jpg" ? JPG_QUALITY : undefined);
      });

      // What a canvas too large for the browser to encode looks like: null, or
      // a quiet fallback to PNG bytes under the type that was asked for.
      if (blob === null || blob.type !== type) {
        return {
          ok: false,
          error: `Page ${number} was too large to render — try the standard resolution.`,
        };
      }

      pages.push({
        pageNumber: number,
        name: pageFileName(file.name, number, pageCount, format),
        blob,
        width: canvas.width,
        height: canvas.height,
      });

      onProgress?.(number, pageCount);
      // Rendering holds the main thread, so this lets the progress line paint
      // between pages instead of after the last one.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return { ok: true, pages };
  } catch (error) {
    return { ok: false, error: describeError(error, file.name) };
  } finally {
    void doc?.destroy();
  }
}

/**
 * report.pdf page 2 of 12 becomes report-page-02.png. The number is padded to
 * the width of the last one so a folder of them sorts in reading order rather
 * than putting page 10 next to page 1.
 */
export function pageFileName(
  sourceName: string,
  pageNumber: number,
  total: number,
  format: ImageFormat,
): string {
  const base = sourceName.replace(/\.[^.]+$/, "").trim();
  const stem = base === "" ? "page" : base;
  const padded = String(pageNumber).padStart(String(total).length, "0");

  return `${stem}-page-${padded}.${format}`;
}

function describeError(error: unknown, name: string): string {
  if (isOutOfMemory(error)) {
    return `${name} was too big to render in the browser — try the standard resolution, or split it into fewer pages first.`;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (/password/i.test(message)) {
    return `${name} is password-protected, so its pages can't be read. Remove the password and try again.`;
  }
  // Everything about opening a PDF is already worded once, in pdf-load.
  if (/invalid pdf|no pdf header|corrupt|structure/i.test(message)) {
    return describeLoadError(error, name);
  }

  return message === "" ? `Couldn't render ${name}.` : `Couldn't render ${name} — ${message}`;
}
