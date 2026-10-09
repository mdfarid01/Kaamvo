"use client";

/* eslint-disable @next/next/no-img-element -- The previews are object URLs for
   blobs rendered in this tab: there is no path for next/image to optimise, and
   the width and height are only known once the page has been drawn. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import { FileSummary } from "@/components/ui/file-summary";
import { pageWord } from "@/lib/page-ranges";
import { ACCEPT_ATTRIBUTE, loadPdf } from "@/lib/pdf-load";
import type { LoadedPdf } from "@/lib/pdf-load";
import {
  DEFAULT_FORMAT,
  DEFAULT_RESOLUTION,
  FORMATS,
  MAX_PAGES,
  RESOLUTIONS,
  pdfToImages,
} from "@/lib/pdf-to-image";
import type { ImageFormat, RenderedPage, Resolution } from "@/lib/pdf-to-image";
import { cn, formatBytes } from "@/lib/utils";

/**
 * The dropped file. The parse happens on arrival, so `pdf` is what the file
 * turned out to be: null while it's still being read, and null with an `error`
 * if it couldn't be. A rejected file stays on screen — a file that silently
 * fails to appear looks like a bug in the drop zone.
 *
 * The File itself is kept because rendering re-reads it (see lib/pdf-to-image.ts).
 */
interface Entry {
  file: File;
  name: string;
  size: number;
  pdf: LoadedPdf | null;
  error?: string;
  pending: boolean;
}

/** A rendered page with the object URL its preview and download both use. */
interface Preview extends RenderedPage {
  url: string;
}

/**
 * Gap between the links in a "download all". Browsers treat a burst of
 * programmatic downloads as one thing to ask about — Chrome shows a single
 * "allow multiple downloads?" prompt — and firing them in one tick makes some
 * of them go missing.
 */
const DOWNLOAD_GAP_MS = 150;

export function PdfToImageTool() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [format, setFormat] = useState<ImageFormat>(DEFAULT_FORMAT);
  const [resolution, setResolution] = useState<Resolution>(DEFAULT_RESOLUTION);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Which drop the tool is currently waiting on. Dropping a second file while
  // the first is still parsing is easy to do with a big PDF, and without this
  // the slower parse would land last and win.
  const loading = useRef(0);

  /**
   * An object URL holds its blob alive until it's revoked, so a second run
   * would otherwise keep both sets of pages in memory. The live set is mirrored
   * in a ref and revoked explicitly whenever it's replaced, rather than from an
   * effect keyed on the state: under React's strict mode an effect's cleanup
   * runs once on mount in development, which would revoke a set of URLs the
   * previews and the download links are still pointing at.
   */
  const live = useRef<Preview[]>([]);

  const replacePreviews = useCallback((next: Preview[]) => {
    for (const preview of live.current) URL.revokeObjectURL(preview.url);
    live.current = next;
    setPreviews(next);
  }, []);

  // The last set, when the page is left. Empty on the strict-mode double mount,
  // so there's nothing for it to revoke early.
  useEffect(() => {
    return () => {
      for (const preview of live.current) URL.revokeObjectURL(preview.url);
      live.current = [];
    };
  }, []);

  const handleFiles = useCallback((incoming: File[]) => {
    const file = incoming[0];
    if (file === undefined) return;

    const token = (loading.current += 1);

    setEntry({ file, name: file.name, size: file.size, pdf: null, pending: true });
    replacePreviews([]);
    setError(null);
    // This tool works on one file, and the input isn't multiple, but a drag can
    // still carry several. Taking the first quietly would look like the others
    // failed to register.
    setNotice(
      incoming.length > 1 ? `Only ${file.name} was taken — this tool renders one PDF.` : null,
    );

    void loadPdf(file).then((outcome) => {
      if (loading.current !== token) return;

      setEntry((current) => {
        if (current === null || current.file !== file) return current;
        return outcome.ok
          ? { ...current, pdf: outcome.pdf, pending: false }
          : { ...current, pdf: null, pending: false, error: outcome.error };
      });
    });
  }, [replacePreviews]);

  const handleRemove = useCallback(() => {
    loading.current += 1;
    setEntry(null);
    replacePreviews([]);
    setError(null);
    setNotice(null);
    setProgress(null);
  }, [replacePreviews]);

  const handleClear = useCallback(() => {
    handleRemove();
    setFormat(DEFAULT_FORMAT);
    setResolution(DEFAULT_RESOLUTION);
  }, [handleRemove]);

  const pdf = entry?.pdf ?? null;
  const rendering = progress !== null;
  // Caught here as well as in pdfToImages, so a long PDF is turned away on the
  // way in rather than after someone has waited for the render to start.
  const tooLong = pdf !== null && pdf.pageCount > MAX_PAGES;
  const ready = pdf !== null && !tooLong && !rendering;

  const handleRender = useCallback(async () => {
    if (entry === null || pdf === null) return;

    setProgress({ done: 0, total: pdf.pageCount });
    setError(null);
    replacePreviews([]);

    // Rendering holds the main thread, so this yields once to let the button's
    // disabled state and the progress line paint first.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const outcome = await pdfToImages(entry.file, format, resolution, (done, total) => {
      setProgress({ done, total });
    });
    setProgress(null);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }

    replacePreviews(
      outcome.pages.map((page) => ({ ...page, url: URL.createObjectURL(page.blob) })),
    );
  }, [entry, pdf, format, resolution, replacePreviews]);

  const download = useCallback((preview: Preview) => {
    const link = document.createElement("a");
    link.href = preview.url;
    link.download = preview.name;
    link.click();
  }, []);

  const handleDownloadAll = useCallback(async () => {
    for (const preview of previews) {
      download(preview);
      await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_GAP_MS));
    }
  }, [previews, download]);

  const totalBytes = previews.reduce((sum, preview) => sum + preview.blob.size, 0);

  return (
    <div className="space-y-4">
      {entry && (
        <FileSummary
          name={entry.name}
          detail={describe(entry)}
          invalid={entry.error !== undefined}
          onRemove={handleRemove}
        />
      )}

      <DropZone
        accept={ACCEPT_ATTRIBUTE}
        label={entry === null ? "Drop a PDF here" : "Drop a different PDF here"}
        hint="or click to browse — it stays on your device"
        disabled={rendering}
        onFiles={handleFiles}
      />

      {notice && <p className="text-[13px] text-muted">{notice}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Format</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {FORMATS.map((option) => (
              <ChoiceButton
                key={option.value}
                label={option.label}
                hint={option.hint}
                active={option.value === format}
                onClick={() => {
                  setFormat(option.value);
                  // Any change to what would be written makes the pages already
                  // rendered stale, so they can't sit there as if they were current.
                  replacePreviews([]);
                  setError(null);
                }}
              />
            ))}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            PNG keeps text and line art crisp. JPG makes a much smaller file and is the better
            choice for scanned or photographic pages.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            Resolution
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {RESOLUTIONS.map((option) => (
              <ChoiceButton
                key={option.value}
                label={option.label}
                hint={option.hint}
                active={option.value === resolution}
                onClick={() => {
                  setResolution(option.value);
                  replacePreviews([]);
                  setError(null);
                }}
              />
            ))}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Standard is sharp on screen. High is for a page that will be printed or zoomed into,
            and makes a noticeably larger file.
          </p>
        </div>
      </div>

      {tooLong && (
        <ErrorNotice
          message={`${entry?.name} has ${pageWord(pdf.pageCount)} — this tool renders up to ${MAX_PAGES} at a time. Use Split PDF to take a section out first.`}
        />
      )}

      {error && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!ready} onClick={handleRender}>
          {rendering ? "Rendering…" : "Render pages"}
        </Button>
        <Button variant="secondary" disabled={entry === null} onClick={handleClear}>
          Clear
        </Button>
        {entry?.pending === true && <span className="text-[13px] text-muted">Reading…</span>}
        {progress && (
          <span className="text-[13px] text-muted">
            Rendering page{" "}
            <span className="font-mono tabular-nums">{Math.max(1, progress.done)}</span> of{" "}
            <span className="font-mono tabular-nums">{progress.total}</span>…
          </span>
        )}
        {ready && previews.length === 0 && (
          <span className="text-[13px] text-muted">
            {pageWord(pdf.pageCount)} →{" "}
            {pdf.pageCount === 1 ? "1 image" : `${pdf.pageCount} images`}.
          </span>
        )}
        <span aria-live="polite" className="sr-only">
          {previews.length > 0
            ? `${previews.length} images rendered, ${formatBytes(totalBytes)} in total`
            : ""}
        </span>
      </div>

      {previews.length > 0 && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                Rendered
              </p>
              <p className="mt-1.5 text-[15px] text-ink">
                <span className="font-mono tabular-nums">{previews.length}</span>{" "}
                {previews.length === 1 ? "image" : "images"} ·{" "}
                <span className="font-mono tabular-nums">{formatBytes(totalBytes)}</span> in total
              </p>
            </div>
            <Button onClick={handleDownloadAll}>
              {previews.length === 1 ? "Download" : `Download all ${previews.length}`}
            </Button>
          </div>

          {previews.length > 1 && (
            <p className="mt-3 border-t border-line-soft pt-3 text-[13px] leading-relaxed text-muted">
              The pages download as separate files, one per page — there&apos;s no zip. Your browser
              will most likely ask once whether to allow several downloads at a time; say yes, or
              take them one at a time below.
            </p>
          )}

          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {previews.map((preview) => (
              <li
                key={preview.pageNumber}
                className="overflow-hidden rounded-lg border border-line bg-canvas"
              >
                <img
                  src={preview.url}
                  alt={`Page ${preview.pageNumber}`}
                  className="block h-32 w-full bg-line-soft object-contain"
                />
                <div className="border-t border-line-soft px-3 py-2.5">
                  <p className="truncate text-[13px] text-ink" title={preview.name}>
                    Page <span className="font-mono tabular-nums">{preview.pageNumber}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-faint">
                    {preview.width} × {preview.height} · {formatBytes(preview.blob.size)}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => download(preview)}
                  >
                    Download
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-[13px] leading-relaxed text-muted">
        Every page is drawn at its own proportions, so nothing is stretched or cropped, and the
        files are numbered in page order. Up to {MAX_PAGES} pages at a time; use Split PDF to take a
        section out of a longer file first. Everything runs in your browser, so the PDF is never
        uploaded.
      </p>
    </div>
  );
}

/** The row's second line: what the file is, or what's wrong with it. */
function describe(entry: Entry): string {
  if (entry.error !== undefined) return entry.error;
  if (entry.pending) return "Reading…";
  if (entry.pdf === null) return formatBytes(entry.size);

  return `${pageWord(entry.pdf.pageCount)} · ${formatBytes(entry.size)}`;
}

/**
 * Tinted accent when idle, solid accent when selected — the same treatment
 * Rotate PDF's turns and PDF to PPT's resolutions use, since it's the same kind
 * of choice.
 */
function ChoiceButton({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        active
          ? "border-accent bg-accent text-canvas"
          : "border-transparent bg-accent/[0.10] text-accent-deep hover:border-accent",
      )}
    >
      {label}
      {hint !== undefined && (
        <span className="font-mono text-[11px] tabular-nums opacity-70">{hint}</span>
      )}
    </button>
  );
}

/** Same accent-tinted panel the JSON formatter uses — the palette has no red. */
function ErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-accent bg-accent/[0.06] px-4 py-3">
      <p className="text-[13px] font-medium leading-relaxed text-accent-deep">{message}</p>
    </div>
  );
}
