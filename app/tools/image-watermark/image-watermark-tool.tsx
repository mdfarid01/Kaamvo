"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import { FileSummary } from "@/components/ui/file-summary";
import { TextField } from "@/components/ui/field";
import {
  ACCEPT_ATTRIBUTE,
  formatLabel,
  loadSourceImage,
  releaseSourceImage,
} from "@/lib/image-canvas";
import type { SourceImage } from "@/lib/image-canvas";
import {
  COLORS,
  DEFAULT_OPTIONS,
  MAX_OPACITY,
  MIN_OPACITY,
  POSITIONS,
  SIZES,
  watermarkImage,
  watermarkedFileName,
} from "@/lib/image-watermark";
import type { ImageWatermarkOptions } from "@/lib/image-watermark";
import { cn, formatBytes } from "@/lib/utils";

/** Same shape as the other image tools': the decode happens on arrival. */
interface Entry {
  file: File;
  name: string;
  size: number;
  image: SourceImage | null;
  error?: string;
  pending: boolean;
}

export function ImageWatermarkTool() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [options, setOptions] = useState<ImageWatermarkOptions>(DEFAULT_OPTIONS);
  const [result, setResult] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Which drop the tool is waiting on, so a slower earlier decode can't land on
  // top of a newer one.
  const loading = useRef(0);

  const handleFiles = useCallback((incoming: File[]) => {
    const file = incoming[0];
    if (file === undefined) return;

    const token = (loading.current += 1);

    setEntry({ file, name: file.name, size: file.size, image: null, pending: true });
    setResult(null);
    setError(null);
    setNotice(
      incoming.length > 1 ? `Only ${file.name} was taken — this tool stamps one image.` : null,
    );

    void loadSourceImage(file).then((outcome) => {
      if (loading.current !== token) {
        // A newer file won the race; this bitmap would never be freed otherwise.
        if (outcome.ok) releaseSourceImage(outcome.image);
        return;
      }

      setEntry((current) => {
        if (current?.file !== file) return current;
        return outcome.ok
          ? { ...current, image: outcome.image, pending: false }
          : { ...current, image: null, pending: false, error: outcome.error };
      });
    });
  }, []);

  const image = entry?.image ?? null;

  // The decoded pixels outlive every render that draws them, and are freed when
  // the image they belong to is replaced or the tool unmounts.
  useEffect(() => {
    if (image === null) return;
    return () => releaseSourceImage(image);
  }, [image]);

  // The stamp is redrawn whenever anything about it changes, so the preview is
  // the file that would be downloaded rather than an approximation of it.
  useEffect(() => {
    if (image === null || options.text.trim() === "") {
      setResult(null);
      setIsWorking(false);
      return;
    }

    let active = true;
    setIsWorking(true);

    void watermarkImage(image, options).then((outcome) => {
      if (!active) return;
      setIsWorking(false);

      if (outcome.ok) {
        setResult(outcome.blob);
        setError(null);
        return;
      }
      setResult(null);
      setError(outcome.error);
    });

    return () => {
      active = false;
    };
  }, [image, options]);

  useEffect(() => {
    if (result === null) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(result);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [result]);

  const handleRemove = useCallback(() => {
    loading.current += 1;
    setEntry(null);
    setResult(null);
    setError(null);
    setNotice(null);
  }, []);

  const update = useCallback((patch: Partial<ImageWatermarkOptions>) => {
    setOptions((current) => ({ ...current, ...patch }));
  }, []);

  const handleDownload = useCallback(() => {
    if (result === null || image === null) return;

    const url = URL.createObjectURL(result);
    const link = document.createElement("a");
    link.href = url;
    link.download = watermarkedFileName(image.name, image.type);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [image, result]);

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
        label={entry === null ? "Drop an image here" : "Drop a different image here"}
        hint="JPG, PNG or WebP — it stays on your device"
        onFiles={handleFiles}
      />

      {notice && <p className="text-[13px] text-muted">{notice}</p>}

      <div className="rounded-lg border border-line bg-surface p-4">
        <TextField
          label="Watermark text"
          value={options.text}
          onChange={(next) => update({ text: next })}
          placeholder={DEFAULT_OPTIONS.text}
          hint="Sized to the image, so it reads the same on a phone photo and a poster."
        />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Position</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {POSITIONS.map((option) => (
            <ChoiceButton
              key={option.value}
              label={option.label}
              active={option.value === options.position}
              onClick={() => update({ position: option.value })}
            />
          ))}
        </div>

        {/* Rotating about a corner anchor throws most of the line off the canvas,
            so the diagonal is only offered in the centre (see lib/image-watermark.ts). */}
        {options.position === "center" && (
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={options.diagonal}
              onChange={(event) => update({ diagonal: event.target.checked })}
              className="h-4 w-4 cursor-pointer accent-accent"
            />
            Run it corner to corner
          </label>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Size</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {SIZES.map((option) => (
              <ChoiceButton
                key={option.value}
                label={option.label}
                active={option.value === options.size}
                onClick={() => update({ size: option.value })}
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Colour</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {COLORS.map((option) => (
              <ChoiceButton
                key={option.value}
                label={option.label}
                active={option.value === options.color}
                onClick={() => update({ color: option.value })}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            Opacity
          </h2>
          <span className="font-mono text-[13px] tabular-nums text-accent-deep">
            {Math.round(options.opacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={MIN_OPACITY * 100}
          max={MAX_OPACITY * 100}
          step={5}
          value={Math.round(options.opacity * 100)}
          onChange={(event) => update({ opacity: Number(event.target.value) / 100 })}
          aria-label="Watermark opacity"
          className="mt-3 w-full cursor-pointer accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        />
        <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-faint">
          <span>{MIN_OPACITY * 100}%</span>
          <span>{MAX_OPACITY * 100}%</span>
        </div>
      </div>

      {error && <ErrorNotice message={error} />}

      {previewUrl && image && (
        <Card className="flex items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- the source is
              a blob URL for bytes encoded in the browser; there is nothing for
              next/image to fetch or optimize. */}
          <img
            src={previewUrl}
            alt={`${image.name} with a watermark`}
            className={cn(
              "max-h-[360px] w-auto max-w-full rounded transition-opacity duration-150",
              isWorking && "opacity-60",
            )}
          />
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={result === null || isWorking} onClick={handleDownload}>
          {image === null ? "Download image" : `Download ${formatLabel(image.type)}`}
        </Button>
        <Button variant="secondary" disabled={entry === null} onClick={handleRemove}>
          Clear
        </Button>
        {entry?.pending === true && <span className="text-[13px] text-muted">Reading…</span>}
        <span aria-live="polite" className="sr-only">
          {result && !isWorking ? `Watermarked, ${formatBytes(result.size)}` : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Pixels and dimensions are kept as they are, and the format doesn’t change — a JPG comes back
        a JPG. The text carries a faint outline in the opposite colour, so white words stay readable
        over a bright sky. Everything is drawn in your browser; the image is never uploaded.
      </p>
    </div>
  );
}

/** The row's second line: what the file is, or what's wrong with it. */
function describe(entry: Entry): string {
  if (entry.error !== undefined) return entry.error;
  if (entry.pending) return "Reading…";
  if (entry.image === null) return formatBytes(entry.size);

  return `${formatLabel(entry.image.type)} · ${entry.image.width} × ${entry.image.height} · ${formatBytes(entry.size)}`;
}

/** The same tinted-to-solid treatment Convert Image's format buttons use. */
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
