/**
 * Getting pdfjs-dist loaded, shared by the tools that render PDF pages: PDF to
 * PPT and PDF to Image. Nothing here parses anything — it's the one place that
 * knows where the worker file lives and makes sure it's pointed at once.
 *
 * The import is dynamic rather than at module scope because pdfjs is large and
 * browser-only: a page that never renders a PDF shouldn't pay for it on first
 * load, and nothing should run during the server render.
 */

/**
 * pdfjs parses in a worker, and it has to be told where that file is. The
 * worker is served from public/ rather than pulled through the bundler:
 * `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` — the form
 * webpack would normally emit an asset for — sends the file through Next's SWC
 * parser in script mode instead, and the build dies on pdfjs's own
 * `import.meta`. The copy is kept in step by the postinstall script in
 * package.json; a stale one makes pdfjs throw a version mismatch rather than
 * fail quietly.
 */
const WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";

/**
 * The one in-flight load, kept so every caller gets the same module instance.
 * Two tools now share this file, and either can be asked to render again while
 * a previous run is still going — without this, each call re-enters the dynamic
 * import and races the others through the worker assignment below.
 */
let loading: Promise<typeof import("pdfjs-dist")> | null = null;

/** The library with its worker set. Set once, so a second call doesn't reassign it. */
export function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  loading ??= importPdfjs();
  return loading;
}

async function importPdfjs(): Promise<typeof import("pdfjs-dist")> {
  const imported = await import("pdfjs-dist");

  // pdfjs-dist is ESM with no default export, so the namespace is the library.
  // The unwrap is for the bundler putting it behind an interop wrapper anyway,
  // which is what turns a missing GlobalWorkerOptions into an error thrown from
  // somewhere else entirely.
  const pdfjs =
    "GlobalWorkerOptions" in imported
      ? imported
      : ((imported as { default?: typeof import("pdfjs-dist") }).default ?? imported);

  if (pdfjs.GlobalWorkerOptions.workerSrc === "") {
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  }

  return pdfjs;
}

/**
 * The options every caller here opens a document with. Nothing in these tools
 * needs a PDF's own JavaScript or its annotations rendered, and not evaluating
 * strings from a stranger's file is the safer default.
 */
export const SAFE_DOCUMENT_OPTIONS = { isEvalSupported: false } as const;
