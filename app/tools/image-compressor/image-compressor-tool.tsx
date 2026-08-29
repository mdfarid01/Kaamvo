"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import {
  ACCEPT_ATTRIBUTE,
  DEFAULT_QUALITY,
  MAX_QUALITY,
  MIN_QUALITY,
  QUALITY_STEP,
  compress,
  compressedFileName,
  savingsPercent,
} from "@/lib/image-compressor";
import type { CompressedImage } from "@/lib/image-compressor";
import { cn, formatBytes } from "@/lib/utils";

/** Long enough to swallow a slider drag, short enough to still feel immediate. */
const DEBOUNCE_MS = 250;

export function ImageCompressorTool() {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [debouncedQuality, setDebouncedQuality] = useState(DEFAULT_QUALITY);
  const [result, setResult] = useState<CompressedImage | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // A picked file compresses at once; only the slider is debounced, since a
  // drag fires an event per pixel and each one is a full re-encode.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuality(quality), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [quality]);

  useEffect(() => {
    if (file === null) {
      setResult(null);
      setError(null);
      setIsWorking(false);
      return;
    }

    // An encode settles well after it's asked for, so without this guard a
    // slower earlier quality could land on top of a newer result.
    let active = true;
    setIsWorking(true);

    compress(file, debouncedQuality).then((outcome) => {
      if (!active) return;
      setIsWorking(false);
      if (outcome.ok) {
        setResult(outcome.image);
        setError(null);
        return;
      }
      // Nothing was produced, so there is no comparison to leave on screen.
      setResult(null);
      setError(outcome.error);
    });

    return () => {
      active = false;
    };
  }, [file, debouncedQuality]);

  // The preview shows the compressed bytes, not the original — the point of the
  // slider is seeing what the quality cost. Each result gets its own URL, and
  // the cleanup releases the previous one rather than leaking it per drag.
  useEffect(() => {
    if (result === null) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(result.file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [result]);

  const handleFiles = useCallback((incoming: File[]) => {
    // The zone is single-file; a multi-file drop takes the first rather than
    // silently doing nothing.
    const [first] = incoming;
    if (!first) return;
    setFile(first);
  }, []);

  const handleDownload = useCallback(() => {
    if (!result) return;

    const url = URL.createObjectURL(result.file);
    const link = document.createElement("a");
    link.href = url;
    link.download = compressedFileName(result.file.name, result.file.type);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [result]);

  const handleClear = useCallback(() => {
    setFile(null);
    setQuality(DEFAULT_QUALITY);
    // Skips the debounce, so the next file starts from the default quality.
    setDebouncedQuality(DEFAULT_QUALITY);
  }, []);

  return (
    <div className="space-y-4">
      {file === null ? (
        <DropZone
          accept={ACCEPT_ATTRIBUTE}
          label="Drop an image here"
          hint="JPG, PNG or WebP — it stays on your device"
          onFiles={handleFiles}
        />
      ) : (
        <FileRow name={file.name} size={file.size} onClear={handleClear} />
      )}

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-4">
          <label
            htmlFor="image-compressor-quality"
            className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted"
          >
            Quality
          </label>
          <span className="font-mono text-[13px] tabular-nums text-ink">{quality}%</span>
        </div>
        <input
          id="image-compressor-quality"
          type="range"
          min={MIN_QUALITY}
          max={MAX_QUALITY}
          step={QUALITY_STEP}
          value={quality}
          onChange={(event) => setQuality(Number(event.target.value))}
          // Native track and thumb, tinted by accent-color — the same coral
          // marks every active control here, and it needs no shadow.
          className="mt-3 w-full cursor-pointer accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        />
        <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-faint">
          <span>{MIN_QUALITY}%</span>
          <span>{MAX_QUALITY}%</span>
        </div>
      </div>

      {error && <ErrorNotice message={error} />}

      <Comparison result={result} isWorking={isWorking} />

      {previewUrl && result && (
        <Card className="flex items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- the source is
              a blob URL for bytes encoded in the browser; there is nothing for
              next/image to fetch or optimize. */}
          <img
            src={previewUrl}
            alt={`Compressed preview of ${result.file.name}`}
            className={cn(
              "max-h-[320px] w-auto max-w-full rounded transition-opacity duration-150",
              isWorking && "opacity-60",
            )}
          />
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={result === null || isWorking} onClick={handleDownload}>
          Download image
        </Button>
        <Button variant="secondary" disabled={file === null} onClick={handleClear}>
          Clear
        </Button>
        <span aria-live="polite" className="sr-only">
          {result && !isWorking
            ? `Compressed to ${formatBytes(result.compressedSize)}, ${savingsPercent(result.originalSize, result.compressedSize)} percent smaller`
            : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The image is re-encoded in your browser and never uploaded anywhere. Lower quality means
        fewer bytes and less detail, in all three formats — the loss shows up first in flat colour
        and text, so it’s worth checking the preview before you download.
      </p>
    </div>
  );
}

/** Replaces the drop zone once there's a file, in the same visual slot. */
function FileRow({
  name,
  size,
  onClear,
}: {
  name: string;
  size: number;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface px-4 py-3">
      <span className="truncate text-sm text-ink">{name}</span>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-mono text-[13px] tabular-nums text-muted">{formatBytes(size)}</span>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Remove
        </Button>
      </div>
    </div>
  );
}

/**
 * Before, after and the difference between them. It holds its height across a
 * re-encode so the slider doesn't sit on top of a box that changes size on
 * every drag.
 */
function Comparison({
  result,
  isWorking,
}: {
  result: CompressedImage | null;
  isWorking: boolean;
}) {
  if (result === null) {
    return (
      <Card className="flex min-h-[104px] items-center justify-center p-6">
        <p className="text-[13px] text-muted">
          {isWorking ? "Compressing…" : "Before and after sizes will appear here."}
        </p>
      </Card>
    );
  }

  const saved = savingsPercent(result.originalSize, result.compressedSize);

  return (
    <Card className={cn("p-4 transition-opacity duration-150", isWorking && "opacity-60")}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Before" value={formatBytes(result.originalSize)} />
        <Stat label="After" value={formatBytes(result.compressedSize)} />
        <Stat
          label={result.reduced ? "Saved" : "Difference"}
          value={result.reduced ? `${saved}%` : `+${Math.abs(saved)}%`}
          emphasis={result.reduced}
        />
      </div>

      {!result.reduced && (
        <p className="mt-4 border-t border-line-soft pt-3 text-[13px] leading-relaxed text-muted">
          Re-encoding this one came out larger, so the download is your original file untouched.
          It’s already about as small as this format gets.
        </p>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-mono text-[15px] tabular-nums",
          emphasis ? "text-accent-deep" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
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
