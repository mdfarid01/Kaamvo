"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import { FileSummary } from "@/components/ui/file-summary";
import {
  ACCEPT_ATTRIBUTE,
  formatLabel,
  hasAlpha,
  loadSourceImage,
  releaseSourceImage,
} from "@/lib/image-canvas";
import type { SourceImage } from "@/lib/image-canvas";
import { availableTargets, convert, convertedFileName } from "@/lib/image-convert";
import type { FormatOption, TargetType } from "@/lib/image-convert";
import { cn, formatBytes } from "@/lib/utils";

/** Same shape as the other image tools: the decode happens on arrival. */
interface Entry {
  file: File;
  name: string;
  size: number;
  image: SourceImage | null;
  error?: string;
  pending: boolean;
}

export function ConvertImageTool() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [targets, setTargets] = useState<FormatOption[] | null>(null);
  const [target, setTarget] = useState<TargetType | null>(null);
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
    setTargets(null);
    setTarget(null);
    setResult(null);
    setError(null);
    setNotice(
      incoming.length > 1 ? `Only ${file.name} was taken — this tool converts one image.` : null,
    );

    void loadSourceImage(file).then((outcome) => {
      if (loading.current !== token) {
        // A newer file won the race; this bitmap would never be freed otherwise.
        if (outcome.ok) releaseSourceImage(outcome.image);
        return;
      }

      if (!outcome.ok) {
        setEntry((current) =>
          current?.file === file
            ? { ...current, image: null, pending: false, error: outcome.error }
            : current,
        );
        return;
      }

      setEntry((current) =>
        current?.file === file ? { ...current, image: outcome.image, pending: false } : current,
      );
    });
  }, []);

  const image = entry?.image ?? null;

  // The decoded pixels outlive every render that draws them, and are freed when
  // the image they belong to is replaced or the tool unmounts.
  useEffect(() => {
    if (image === null) return;
    return () => releaseSourceImage(image);
  }, [image]);

  // Which formats to offer depends on the file (its own format is not a
  // conversion) and on the browser (see lib/image-convert.ts), so the list is
  // worked out once per file rather than written down.
  useEffect(() => {
    if (image === null) {
      setTargets(null);
      setTarget(null);
      return;
    }

    let active = true;

    void availableTargets(image.type).then((options) => {
      if (!active) return;
      setTargets(options);
      // The first offered format is pre-selected, so a preview appears without
      // anyone having to guess what to press first.
      setTarget(options[0]?.type ?? null);
    });

    return () => {
      active = false;
    };
  }, [image]);

  useEffect(() => {
    if (image === null || target === null) {
      setResult(null);
      setIsWorking(false);
      return;
    }

    // An encode settles well after it's asked for, so without this guard a
    // slower earlier format could land on top of a newer result.
    let active = true;
    setIsWorking(true);

    void convert(image, target).then((outcome) => {
      if (!active) return;
      setIsWorking(false);

      if (outcome.ok) {
        setResult(outcome.blob);
        setError(null);
        return;
      }
      // Nothing was produced, so there's no preview to leave on screen.
      setResult(null);
      setError(outcome.error);
    });

    return () => {
      active = false;
    };
  }, [image, target]);

  // The preview is the converted bytes, decoded again by the browser — which
  // makes it the strongest evidence the tool can show that the new file is a
  // real, readable image in the format it claims.
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
    setTargets(null);
    setTarget(null);
    setResult(null);
    setError(null);
    setNotice(null);
  }, []);

  const handleDownload = useCallback(() => {
    if (result === null || entry === null || target === null) return;

    const url = URL.createObjectURL(result);
    const link = document.createElement("a");
    link.href = url;
    link.download = convertedFileName(entry.name, target);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [entry, result, target]);

  // Worth saying out loud rather than letting someone find it in the file: the
  // transparent parts of a PNG can't survive the trip to JPEG.
  const losingAlpha =
    image !== null && target !== null && hasAlpha(image.type) && !hasAlpha(target);

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

      {image && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            Convert to
          </h2>
          {targets === null ? (
            <p className="mt-3 text-[13px] text-muted">Checking what this browser can write…</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {targets.map((option) => (
                <ChoiceButton
                  key={option.type}
                  label={option.label}
                  hint={option.hint}
                  active={option.type === target}
                  onClick={() => setTarget(option.type)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {losingAlpha && (
        <p className="text-[13px] leading-relaxed text-muted">
          JPG has no transparency, so anything see-through in this image comes out white.
        </p>
      )}

      {error && <ErrorNotice message={error} />}

      {image && target && (
        <Card className={cn("p-4 transition-opacity duration-150", isWorking && "opacity-60")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={`From ${formatLabel(image.type)}`} value={formatBytes(image.size)} />
            <Stat
              label={`To ${formatLabel(target)}`}
              value={result === null ? "—" : formatBytes(result.size)}
              emphasis
            />
            <Stat label="Pixels" value={`${image.width} × ${image.height}`} />
          </div>
        </Card>
      )}

      {previewUrl && image && target && (
        <Card className="flex items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- the source is
              a blob URL for bytes encoded in the browser; there is nothing for
              next/image to fetch or optimize. */}
          <img
            src={previewUrl}
            alt={`${image.name} converted to ${formatLabel(target)}`}
            className={cn(
              "max-h-[320px] w-auto max-w-full rounded transition-opacity duration-150",
              isWorking && "opacity-60",
            )}
          />
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={result === null || isWorking} onClick={handleDownload}>
          {target === null ? "Download image" : `Download ${formatLabel(target)}`}
        </Button>
        <Button variant="secondary" disabled={entry === null} onClick={handleRemove}>
          Clear
        </Button>
        {entry?.pending === true && <span className="text-[13px] text-muted">Reading…</span>}
        <span aria-live="polite" className="sr-only">
          {result && target && !isWorking
            ? `Converted to ${formatLabel(target)}, ${formatBytes(result.size)}`
            : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The image is decoded and re-encoded in your browser and never uploaded anywhere. Pixels and
        dimensions are kept as they are — only the format changes. Formats this browser can’t write
        aren’t offered, so what you see is what it can do; for trading detail against file size,
        the Image Compressor is the tool next door.
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

/**
 * Tinted accent when idle, solid accent when selected — the same treatment the
 * QR generator's size buttons and Rotate PDF's turns use, since it's the same
 * kind of choice.
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
      {hint !== undefined && <span className="text-[11px] opacity-70">{hint}</span>}
    </button>
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
