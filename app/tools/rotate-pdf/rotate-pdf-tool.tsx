"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import { FileSummary } from "@/components/ui/file-summary";
import { PageRangeField } from "@/components/ui/page-range-field";
import { pageWord, parsePageRanges } from "@/lib/page-ranges";
import { ACCEPT_ATTRIBUTE, loadPdf } from "@/lib/pdf-load";
import type { LoadedPdf } from "@/lib/pdf-load";
import { DEFAULT_TURN, TURNS, rotatePdf, rotatedFileName, turnLabel } from "@/lib/pdf-rotate";
import type { Turn } from "@/lib/pdf-rotate";
import { cn, formatBytes } from "@/lib/utils";

/**
 * The dropped file. The parse happens on arrival, so `pdf` is what the file
 * turned out to be: null while it's still being read, and null with an `error`
 * if it couldn't be. A rejected file stays on screen — a file that silently
 * fails to appear looks like a bug in the drop zone.
 *
 * The File itself is kept because rotating re-reads it (see lib/pdf-rotate.ts).
 */
interface Entry {
  file: File;
  name: string;
  size: number;
  pdf: LoadedPdf | null;
  error?: string;
  pending: boolean;
}

/** Every page, or the ones named in the field. */
type Scope = "all" | "some";

interface RotatedPdf {
  blob: Blob;
  pageCount: number;
  rotatedCount: number;
  sourceName: string;
}

export function RotatePdfTool() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [turn, setTurn] = useState<Turn>(DEFAULT_TURN);
  const [scope, setScope] = useState<Scope>("all");
  const [spec, setSpec] = useState("");
  const [result, setResult] = useState<RotatedPdf | null>(null);
  const [isRotating, setIsRotating] = useState(false);
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
      incoming.length > 1 ? `Only ${file.name} was taken — this tool rotates one PDF.` : null,
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
  }, []);

  const handleClear = useCallback(() => {
    handleRemove();
    setSpec("");
    setScope("all");
    setTurn(DEFAULT_TURN);
  }, [handleRemove]);

  // Any change to what would be written makes the file already written stale,
  // so it can't be left sitting there as if it were current.
  const stale = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const pdf = entry?.pdf ?? null;
  const pageCount = pdf?.pageCount ?? 0;

  const parsed = useMemo(() => parsePageRanges(spec, pageCount), [spec, pageCount]);
  const selection = scope === "all" ? null : parsed.ok ? parsed.pages : undefined;
  // null is "every page", a list is the chosen ones, and undefined is a
  // selection that doesn't parse yet — the only one of the three that blocks.
  const ready = pdf !== null && selection !== undefined;

  const handleRotate = useCallback(async () => {
    if (entry === null || pdf === null || selection === undefined) return;

    setIsRotating(true);
    setError(null);

    // Re-reading and rewriting holds the main thread, so this yields once to
    // let the button's disabled state and the "Rotating…" line paint first.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const outcome = await rotatePdf(entry.file, turn, selection);
    setIsRotating(false);

    if (!outcome.ok) {
      setResult(null);
      setError(outcome.error);
      return;
    }

    setResult({
      blob: outcome.blob,
      pageCount: outcome.pageCount,
      rotatedCount: outcome.rotatedCount,
      sourceName: entry.name,
    });
  }, [entry, pdf, selection, turn]);

  const handleDownload = useCallback(() => {
    if (result === null) return;

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = rotatedFileName(result.sourceName);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [result]);

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
        onFiles={handleFiles}
      />

      {notice && <p className="text-[13px] text-muted">{notice}</p>}

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Turn</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {TURNS.map((option) => (
            <ChoiceButton
              key={option.value}
              label={option.label}
              active={option.value === turn}
              onClick={() => {
                setTurn(option.value);
                stale();
              }}
            />
          ))}
        </div>
      </div>

      {pdf && (
        <>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Apply to
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <ChoiceButton
                label="All pages"
                hint={String(pdf.pageCount)}
                active={scope === "all"}
                onClick={() => {
                  setScope("all");
                  stale();
                }}
              />
              <ChoiceButton
                label="Chosen pages"
                active={scope === "some"}
                onClick={() => {
                  setScope("some");
                  stale();
                }}
              />
            </div>
          </div>

          {scope === "some" && (
            <PageRangeField
              label="Pages to turn"
              value={spec}
              onChange={(next) => {
                setSpec(next);
                stale();
              }}
              pageCount={pdf.pageCount}
              result={parsed}
              disabled={isRotating}
            />
          )}
        </>
      )}

      {error && <ErrorNotice message={error} />}

      {result && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Rotated</p>
            {/* Mono for the figures only — the app doesn't set prose in it. */}
            <p className="mt-1.5 text-[15px] text-ink">
              <span className="font-mono tabular-nums">{result.rotatedCount}</span> of{" "}
              <span className="font-mono tabular-nums">{result.pageCount}</span>{" "}
              {result.pageCount === 1 ? "page" : "pages"} ·{" "}
              <span className="font-mono tabular-nums">{formatBytes(result.blob.size)}</span>
            </p>
          </div>
          <Button onClick={handleDownload}>Download PDF</Button>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!ready || isRotating} onClick={handleRotate}>
          {isRotating ? "Rotating…" : "Rotate pages"}
        </Button>
        <Button variant="secondary" disabled={entry === null && spec === ""} onClick={handleClear}>
          Clear
        </Button>
        {entry?.pending === true && <span className="text-[13px] text-muted">Reading…</span>}
        {ready && !isRotating && (
          <span className="text-[13px] text-muted">
            {selection === null
              ? `All ${pageWord(pageCount)} turn ${turnLabel(turn)}.`
              : `${pageWord(selection.length)} turn ${turnLabel(turn)}.`}
          </span>
        )}
        <span aria-live="polite" className="sr-only">
          {result
            ? `Rotated ${pageWord(result.rotatedCount)}, ${formatBytes(result.blob.size)}`
            : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The turn is added to however the page already sits, so a sideways scan comes upright with one
        quarter turn — and turning twice turns it twice. Everything else about the file is left as it
        was: this rewrites your PDF rather than rebuilding it, so bookmarks, links and form fields all
        survive. It runs in your browser; nothing is uploaded.
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
 * Tinted accent when idle, solid accent when selected — the same treatment the
 * QR generator's size buttons and Image to PDF's page sizes use, since it's the
 * same kind of choice.
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
