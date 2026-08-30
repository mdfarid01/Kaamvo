"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import { FileSummary } from "@/components/ui/file-summary";
import { TextField } from "@/components/ui/field";
import { pageWord } from "@/lib/page-ranges";
import { ACCEPT_ATTRIBUTE, loadPdf } from "@/lib/pdf-load";
import type { LoadedPdf } from "@/lib/pdf-load";
import {
  DEFAULT_OPACITY,
  DEFAULT_TEXT,
  MAX_OPACITY,
  MIN_OPACITY,
  watermarkPdf,
  watermarkedFileName,
} from "@/lib/pdf-watermark";
import type { WatermarkAngle } from "@/lib/pdf-watermark";
import { cn, formatBytes } from "@/lib/utils";

/** Same shape as Rotate PDF's: the parse happens as the file arrives. */
interface Entry {
  file: File;
  name: string;
  size: number;
  pdf: LoadedPdf | null;
  error?: string;
  pending: boolean;
}

interface Stamped {
  blob: Blob;
  pageCount: number;
  sourceName: string;
}

const ANGLES: Array<{ value: WatermarkAngle; label: string }> = [
  { value: "diagonal", label: "Diagonal" },
  { value: "horizontal", label: "Straight across" },
];

export function PdfWatermarkTool() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const [angle, setAngle] = useState<WatermarkAngle>("diagonal");
  const [result, setResult] = useState<Stamped | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Which drop the tool is waiting on, so a slower earlier parse can't land on
  // top of a newer one.
  const loading = useRef(0);

  const handleFiles = useCallback((incoming: File[]) => {
    const file = incoming[0];
    if (file === undefined) return;

    const token = (loading.current += 1);

    setEntry({ file, name: file.name, size: file.size, pdf: null, pending: true });
    setResult(null);
    setError(null);
    setNotice(
      incoming.length > 1 ? `Only ${file.name} was taken — this tool stamps one PDF.` : null,
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

  // Any change to what would be written makes the file already written stale.
  const stale = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const pdf = entry?.pdf ?? null;
  const ready = pdf !== null && text.trim() !== "";

  const handleStamp = useCallback(async () => {
    if (entry === null || pdf === null) return;

    setIsWorking(true);
    setError(null);

    // Rewriting holds the main thread, so this yields once to let the button's
    // disabled state paint first.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const outcome = await watermarkPdf(entry.file, { text, opacity, angle });
    setIsWorking(false);

    if (!outcome.ok) {
      setResult(null);
      setError(outcome.error);
      return;
    }

    setResult({ blob: outcome.blob, pageCount: outcome.pageCount, sourceName: entry.name });
  }, [angle, entry, opacity, pdf, text]);

  const handleDownload = useCallback(() => {
    if (result === null) return;

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = watermarkedFileName(result.sourceName);
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
        <TextField
          label="Watermark text"
          value={text}
          onChange={(next) => {
            setText(next);
            stale();
          }}
          placeholder={DEFAULT_TEXT}
          hint="Printed once across the middle of every page."
        />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Angle</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {ANGLES.map((option) => (
            <ChoiceButton
              key={option.value}
              label={option.label}
              active={option.value === angle}
              onClick={() => {
                setAngle(option.value);
                stale();
              }}
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            Opacity
          </h2>
          <span className="font-mono text-[13px] tabular-nums text-accent-deep">
            {Math.round(opacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={MIN_OPACITY * 100}
          max={MAX_OPACITY * 100}
          step={5}
          value={Math.round(opacity * 100)}
          onChange={(event) => {
            setOpacity(Number(event.target.value) / 100);
            stale();
          }}
          aria-label="Watermark opacity"
          // Native track and thumb, tinted by accent-color — the same treatment
          // the Image Compressor's quality slider gets.
          className="mt-3 w-full cursor-pointer accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        />
        <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-faint">
          <span>{MIN_OPACITY * 100}%</span>
          <span>{MAX_OPACITY * 100}%</span>
        </div>
      </div>

      {error && <ErrorNotice message={error} />}

      {result && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Watermarked
            </p>
            <p className="mt-1.5 text-[15px] text-ink">
              <span className="font-mono tabular-nums">{result.pageCount}</span>{" "}
              {result.pageCount === 1 ? "page" : "pages"} ·{" "}
              <span className="font-mono tabular-nums">{formatBytes(result.blob.size)}</span>
            </p>
          </div>
          <Button onClick={handleDownload}>Download PDF</Button>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!ready || isWorking} onClick={handleStamp}>
          {isWorking ? "Stamping…" : "Add watermark"}
        </Button>
        <Button variant="secondary" disabled={entry === null} onClick={handleRemove}>
          Clear
        </Button>
        {entry?.pending === true && <span className="text-[13px] text-muted">Reading…</span>}
        <span aria-live="polite" className="sr-only">
          {result ? `Watermarked ${pageWord(result.pageCount)}` : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The text is sized to span each page, so a long phrase comes out smaller rather than running
        off the edge. Your PDF is rewritten rather than rebuilt, so bookmarks, links and form fields
        survive — and because the stamp is drawn on top of the page rather than into it, anyone with
        a PDF editor can take it off again. It all runs in your browser; nothing is uploaded.
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

/** The same tinted-to-solid treatment Rotate PDF's turn buttons use. */
function ChoiceButton({
  label,
  active,
  onClick,
}: {
  label: string;
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
