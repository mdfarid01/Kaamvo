/**
 * PDF → PowerPoint for the PDF to PPT tool. One PDF in, one .pptx out, the same
 * split as lib/pdf-split.ts and lib/image-to-pdf.ts: the UI layer stays a thin
 * wrapper and nothing outside this file touches pdfjs-dist or pptxgenjs.
 *
 * What this is honest about: the slides are pictures. Every page is rendered to
 * a PNG and dropped onto a slide, so the deck looks exactly like the PDF and
 * none of it is editable — no text boxes, no selectable words, no shapes. There
 * is no way to recover a PowerPoint's original objects from a PDF (the PDF only
 * ever kept the ink), and the alternative — guessing at text boxes from
 * positioned glyphs — produces a deck that looks wrong and edits worse. So the
 * tool renders, and says so everywhere it can.
 *
 * Both libraries are large and browser-only, so they're imported inside the
 * function rather than at module scope: the page's first load doesn't pay for
 * them, and nothing runs during the server render.
 *
 * Returns a result union rather than throwing, like the other converters here,
 * so a PDF that runs the tab out of memory is an outcome and not a crash.
 */

import { describeLoadError, isOutOfMemory } from "./pdf-load";

export type Resolution = "standard" | "high";

export const DEFAULT_RESOLUTION: Resolution = "standard";

/**
 * Render width in pixels. 1600 is a little over a 16:9 slide's own pixel size
 * at 96 dpi, so it's sharp on a projector without doubling the file size;
 * 2400 is for a deck that will be zoomed into or printed.
 */
export const RESOLUTIONS: Array<{
  value: Resolution;
  label: string;
  hint: string;
  width: number;
}> = [
  { value: "standard", label: "Standard", hint: "1600px", width: 1600 },
  { value: "high", label: "High", hint: "2400px", width: 2400 },
];

/**
 * Rendering happens on the main thread and every page's PNG is held in memory
 * until the file is zipped, so the cap is what keeps a long PDF from taking the
 * tab down. 50 pages at standard width is already a ~60 MB deck.
 */
export const MAX_PAGES = 50;

export type PdfToPptxResult =
  | { ok: true; blob: Blob; slideCount: number; aspect: "16:9" | "4:3" }
  | { ok: false; error: string };

/** Called after each page, so the button can say where it's got to. */
export type ProgressHandler = (rendered: number, total: number) => void;

/** Slide sizes in inches, the unit pptxgenjs lays out in. */
const LAYOUTS = {
  "16:9": { name: "LAYOUT_16x9", width: 10, height: 5.625 },
  "4:3": { name: "LAYOUT_4x3", width: 10, height: 7.5 },
} as const;

/** Above this width-over-height the pages are landscape enough for 16:9. */
const WIDESCREEN_FROM = 1.5;

/**
 * Renders every page and lays it out as a slide. The file is read here rather
 * than taken as bytes because the tool already parsed it once with pdf-lib to
 * show a page count (see lib/pdf-load.ts), and pdfjs detaches whatever buffer
 * it's handed — so it gets its own copy.
 */
export async function pdfToPptx(
  file: File,
  resolution: Resolution,
  onProgress?: ProgressHandler,
): Promise<PdfToPptxResult> {
  const targetWidth =
    RESOLUTIONS.find((option) => option.value === resolution)?.width ?? RESOLUTIONS[0].width;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: `Couldn't read ${file.name}.` };
  }

  const pdfjs = await import("pdfjs-dist");
  setWorker(pdfjs);

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]> | null = null;

  try {
    doc = await pdfjs.getDocument({
      data: bytes,
      // Nothing here needs a PDF's own JavaScript or its annotations rendered,
      // and not evaluating strings from a stranger's file is the safer default.
      isEvalSupported: false,
    }).promise;

    const pageCount = doc.numPages;
    if (pageCount === 0) {
      return { ok: false, error: `${file.name} has no pages in it.` };
    }
    if (pageCount > MAX_PAGES) {
      return {
        ok: false,
        error: `${file.name} has ${pageCount} pages — this tool converts up to ${MAX_PAGES} at a time. Use Split PDF to take a section first.`,
      };
    }

    // The first page decides the slide shape. Mixed orientations in one PDF are
    // rare, and a deck that changes size halfway through is worse than a few
    // pages sitting inside bars.
    const first = await doc.getPage(1);
    const firstView = first.getViewport({ scale: 1 });
    const aspect: "16:9" | "4:3" =
      firstView.width / firstView.height >= WIDESCREEN_FROM ? "16:9" : "4:3";
    const layout = LAYOUTS[aspect];

    const PptxGenJS = (await import("pptxgenjs")).default;
    const pptx = new PptxGenJS();
    pptx.layout = layout.name;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context === null) {
      return { ok: false, error: "Couldn't get a canvas to draw the pages on." };
    }

    for (let number = 1; number <= pageCount; number++) {
      const page = number === 1 ? first : await doc.getPage(number);

      // A viewport at scale 1 is the page in points, so the scale that lands on
      // the target pixel width is the target over that. There's nothing to lose
      // by going up: a PDF page is instructions, not pixels, so it re-renders
      // sharp at any size.
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: targetWidth / base.width });

      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      context.clearRect(0, 0, canvas.width, canvas.height);

      // pdfjs fills white first by default, which matters: a PDF page has no
      // background of its own, and a transparent PNG would show the slide
      // master through it.
      await page.render({ canvas, viewport }).promise;
      page.cleanup();

      const dataUrl = canvas.toDataURL("image/png");
      if (!dataUrl.startsWith("data:image/png")) {
        // What a canvas too large for the browser to encode looks like.
        return {
          ok: false,
          error: `Page ${number} was too large to render — try the standard resolution.`,
        };
      }

      const box = fit(canvas.width / canvas.height, layout);
      pptx.addSlide().addImage({ data: dataUrl, x: box.x, y: box.y, w: box.w, h: box.h });

      onProgress?.(number, pageCount);
      // Rendering holds the main thread, so this lets the progress line paint
      // between pages instead of after the last one.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Worth the extra second: a deck of PNGs zips down a long way, and the
    // difference is what makes the file emailable.
    const output = await pptx.write({ outputType: "blob", compression: true });

    return { ok: true, blob: output as Blob, slideCount: pageCount, aspect };
  } catch (error) {
    return { ok: false, error: describeError(error, file.name) };
  } finally {
    void doc?.destroy();
  }
}

/** slides.pdf becomes slides.pptx. */
export function pptxFileName(sourceName: string): string {
  const base = sourceName.replace(/\.[^.]+$/, "").trim();
  return `${base === "" ? "slides" : base}.pptx`;
}

/**
 * The image centred inside the slide at its own aspect ratio. A PDF page is
 * hardly ever 16:9 or 4:3, so something has to give — and bars at the edges are
 * better than a stretched page or a cropped one that loses a line of text.
 */
function fit(
  imageAspect: number,
  layout: { width: number; height: number },
): { x: number; y: number; w: number; h: number } {
  const h = Math.min(layout.height, layout.width / imageAspect);
  const w = h * imageAspect;

  return { x: (layout.width - w) / 2, y: (layout.height - h) / 2, w, h };
}

/**
 * pdfjs parses in a worker, and it has to be told where that file is. The
 * worker is served from public/ rather than pulled through the bundler:
 * `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` — the form
 * webpack would normally emit an asset for — sends the file through Next's SWC
 * parser in script mode instead, and the build dies on pdfjs's own
 * `import.meta`. The copy is kept in step by the postinstall script in
 * package.json; a stale one makes pdfjs throw a version mismatch rather than
 * fail quietly.
 *
 * Set once, so a second conversion doesn't reassign it.
 */
const WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";

function setWorker(pdfjs: typeof import("pdfjs-dist")): void {
  if (pdfjs.GlobalWorkerOptions.workerSrc !== "") return;
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
}

function describeError(error: unknown, name: string): string {
  if (isOutOfMemory(error)) {
    return `${name} was too big to convert in the browser — try the standard resolution, or split it into fewer pages first.`;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (/password/i.test(message)) {
    return `${name} is password-protected, so its pages can't be read. Remove the password and try again.`;
  }
  // Everything about opening a PDF is already worded once, in pdf-load.
  if (/invalid pdf|no pdf header|corrupt|structure/i.test(message)) {
    return describeLoadError(error, name);
  }

  return message === "" ? `Couldn't convert ${name}.` : `Couldn't convert ${name} — ${message}`;
}
