"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import { FileSummary } from "@/components/ui/file-summary";
import { pageWord } from "@/lib/page-ranges";
import { ACCEPT_ATTRIBUTE, loadPdf } from "@/lib/pdf-load";
import type { LoadedPdf } from "@/lib/pdf-load";
import {
  DEFAULT_RESOLUTION,
  MAX_PAGES,
  RESOLUTIONS,
  pdfToPptx,
  pptxFileName,
} from "@/lib/pdf-to-ppt";
import type { Resolution } from "@/lib/pdf-to-ppt";
import { cn, formatBytes } from "@/lib/utils";

/**
 * The dropped file. The parse happens on arrival, so `pdf` is what the file
 * turned out to be: null while it's still being read, and null with an `error`
 * if it couldn't be. A rejected file stays on screen — a file that silently
 * fails to appear looks like a bug in the drop zone.
 *
 * The File itself is kept because converting re-reads it (see lib/pdf-to-ppt.ts).
 */
interface Entry {
  file: File;
  name: string;
  size: number;
  pdf: LoadedPdf | null;
  error?: string;
  pending: boolean;
}

interface Deck {
  blob: Blob;
  slideCount: number;
  aspect: "16:9" | "4:3";
  sourceName: string;
}

export function PdfToPptTool() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [resolution, setResolution] = useState<Resolution>(DEFAULT_RESOLUTION);
  const [result, setResult] = useState<Deck | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Which drop the tool is currently waiting on. Dropping a second file while
  // the first is still parsing is easy to do with a big PDF, and without this
  // the slower parse would land last and win.
  const loading = useRef(0);

  const handleFiles = useCallback((incoming: File[]) => {
    const file = incoming[0];
    if (file === undefined) return;

    const token = (loading.current += 1);

    setEntry({ file, name: file.name, size: file.size, pdf: null, pending: true });
    setResult(null);
    setError(null);
    // This tool works on one file, and the input isn't multiple, but a drag can
    // still carry several. Taking the first quietly would look like the others
    // failed to register.
    setNotice(
      incoming.length > 1 ? `Only ${file.name} was taken — this tool converts one PDF.` : null,
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
  }, []);

  const handleRemove = useCallback(() => {
    loading.current += 1;
    setEntry(null);
    setResult(null);
    setError(null);
    setNotice(null);
    setProgress(null);
  }, []);

  const handleClear = useCallback(() => {
    handleRemove();
    setResolution(DEFAULT_RESOLUTION);
  }, [handleRemove]);

  const pdf = entry?.pdf ?? null;
  const converting = progress !== null;
  // Caught here as well as in pdfToPptx, so a long PDF is turned away on the
  // way in rather than after someone has waited for the render to start.
  const tooLong = pdf !== null && pdf.pageCount > MAX_PAGES;
  const ready = pdf !== null && !tooLong && !converting;

  const handleConvert = useCallback(async () => {
    if (entry === null || pdf === null) return;

    setProgress({ done: 0, total: pdf.pageCount });
    setError(null);
    setResult(null);

    // Rendering holds the main thread, so this yields once to let the button's
    // disabled state and the progress line paint first.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const outcome = await pdfToPptx(entry.file, resolution, (done, total) => {
      setProgress({ done, total });
    });
    setProgress(null);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }

    setResult({
      blob: outcome.blob,
      slideCount: outcome.slideCount,
      aspect: outcome.aspect,
      sourceName: entry.name,
    });
  }, [entry, pdf, resolution]);

  const handleDownload = useCallback(() => {
    if (result === null) return;

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = pptxFileName(result.sourceName);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [result]);

  return (
    <div className="space-y-4">
      {/* Said before anything is dropped, not after the download: someone here
          for an editable deck should find that out before they wait. */}
      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="text-[13px] leading-relaxed text-ink">
          <span className="font-medium">The slides come out as pictures.</span> Each page is
          rendered as an image and placed on its own slide, so the deck looks exactly like the PDF —
          but the text isn&apos;t selectable or editable, and there are no shapes or text boxes to
          move around. It&apos;s for presenting and sharing, not for rewriting.
        </p>
      </div>

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
        disabled={converting}
        onFiles={handleFiles}
      />

      {notice && <p className="text-[13px] text-muted">{notice}</p>}

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
                // Any change to what would be written makes the file already
                // written stale, so it can't sit there as if it were current.
                setResult(null);
                setError(null);
              }}
            />
          ))}
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Standard is sharp on a projector. High is for a deck that will be zoomed into or printed,
          and makes a noticeably larger file.
        </p>
      </div>

      {tooLong && (
        <ErrorNotice
          message={`${entry?.name} has ${pageWord(pdf.pageCount)} — this tool converts up to ${MAX_PAGES} at a time. Use Split PDF to take a section out first.`}
        />
      )}

      {error && <ErrorNotice message={error} />}

      {result && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Presentation
            </p>
            {/* Mono for the figures only — the app doesn't set prose in it. */}
            <p className="mt-1.5 text-[15px] text-ink">
              <span className="font-mono tabular-nums">{result.slideCount}</span>{" "}
              {result.slideCount === 1 ? "slide" : "slides"} ·{" "}
              <span className="font-mono tabular-nums">{result.aspect}</span> ·{" "}
              <span className="font-mono tabular-nums">{formatBytes(result.blob.size)}</span>
            </p>
          </div>
          <Button onClick={handleDownload}>Download PPTX</Button>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!ready} onClick={handleConvert}>
          {converting ? "Converting…" : "Convert to PowerPoint"}
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
        {ready && result === null && progress === null && (
          <span className="text-[13px] text-muted">
            {pageWord(pdf.pageCount)} → {pdf.pageCount === 1 ? "1 slide" : `${pdf.pageCount} slides`}
            .
          </span>
        )}
        <span aria-live="polite" className="sr-only">
          {result ? `${result.slideCount} slides, ${formatBytes(result.blob.size)}` : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The slide shape is picked from the first page — 16:9 for a landscape PDF, 4:3 for a portrait
        one — and each page is centred at its own proportions, so nothing is stretched or cropped. Up
        to {MAX_PAGES} pages at a time; use Split PDF to take a section out of a longer file first.
        Everything runs in your browser, so the PDF is never uploaded.
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
 * Rotate PDF's turns and Image to PDF's page sizes use, since it's the same kind
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
