"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import { FileSummary } from "@/components/ui/file-summary";
import { ACCEPT_ATTRIBUTE, loadSourceImage, releaseSourceImage } from "@/lib/image-canvas";
import type { SourceImage } from "@/lib/image-canvas";
import {
  DEFAULT_FIT,
  DEFAULT_PRESET,
  DPI,
  FIT_MODES,
  PRESETS,
  fitRect,
  photoFileName,
  planSheet,
  presetFor,
  renderPhoto,
  renderSheet,
  sheetFileName,
  targetPixels,
} from "@/lib/passport-photo";
import type { FitMode } from "@/lib/passport-photo";
import { cn, formatBytes } from "@/lib/utils";

/**
 * The same shape as the other image tools: the file is decoded once as it
 * arrives, every render draws that one bitmap again, and all the geometry lives
 * in lib/passport-photo.ts. What's left here is the preset choice and two
 * downloads.
 */
interface Entry {
  file: File;
  name: string;
  size: number;
  image: SourceImage | null;
  error?: string;
  pending: boolean;
}

export function PassportPhotoTool() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [preset, setPreset] = useState(DEFAULT_PRESET);
  const [fit, setFit] = useState<FitMode>(DEFAULT_FIT);
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
      incoming.length > 1 ? `Only ${file.name} was taken — this tool works on one photo.` : null,
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

  const size = presetFor(preset);
  const target = useMemo(() => targetPixels(presetFor(preset)), [preset]);

  const rect = useMemo(
    () => (image === null ? null : fitRect(image, target, fit)),
    [fit, image, target],
  );

  const plan = useMemo(() => planSheet(target), [target]);

  // Rendered as soon as there's something to render, so the download is ready
  // the moment the preset looks right.
  useEffect(() => {
    if (image === null || rect === null) {
      setResult(null);
      setIsWorking(false);
      return;
    }

    let active = true;
    setIsWorking(true);

    void renderPhoto(image, rect, target).then((outcome) => {
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
  }, [image, rect, target]);

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

  const download = useCallback((blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  const handleDownload = useCallback(() => {
    if (result === null || image === null) return;
    download(result, photoFileName(image, size));
  }, [download, image, result, size]);

  // The sheet is a 2-megapixel canvas, so it's drawn on demand rather than kept
  // in step with the preview — nobody wants one until they ask for it.
  const handleSheet = useCallback(async () => {
    if (image === null || rect === null || plan === null) return;

    setIsWorking(true);
    const outcome = await renderSheet(image, rect, target, plan);
    setIsWorking(false);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }

    setError(null);
    download(outcome.blob, sheetFileName(image, size));
  }, [download, image, plan, rect, size, target]);

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
        label={entry === null ? "Drop a photo here" : "Drop a different photo here"}
        hint="JPG, PNG or WebP — it stays on your device"
        onFiles={handleFiles}
      />

      {notice && <p className="text-[13px] text-muted">{notice}</p>}

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Size</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((option) => (
            <ChoiceButton
              key={option.value}
              label={option.label}
              hint={option.hint}
              active={option.value === preset}
              onClick={() => setPreset(option.value)}
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Framing</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {FIT_MODES.map((option) => (
            <ChoiceButton
              key={option.value}
              label={option.label}
              hint={option.hint}
              active={option.value === fit}
              onClick={() => setFit(option.value)}
            />
          ))}
        </div>
      </div>

      {error && <Notice message={error} />}

      {previewUrl !== null && (
        <Card className={cn("p-4 transition-opacity duration-150", isWorking && "opacity-60")}>
          <div className="flex flex-wrap items-start gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL
                for a photo the visitor just picked; there is nothing for
                next/image to fetch or optimize. */}
            <img
              src={previewUrl}
              alt="The cropped photo at the chosen size"
              className="max-h-[300px] w-auto rounded border border-line"
            />

            <dl className="grid min-w-[180px] gap-4 sm:grid-cols-2">
              <Stat label="Print size" value={size.hint} emphasis />
              <Stat label="Pixels" value={`${target.width} × ${target.height}`} />
              <Stat label="Resolution" value={`${DPI} DPI`} />
              <Stat label="JPG" value={result === null ? "—" : formatBytes(result.size)} />
            </dl>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={result === null || isWorking} onClick={handleDownload}>
          Download photo
        </Button>
        <Button
          variant="secondary"
          disabled={result === null || isWorking || plan === null}
          onClick={handleSheet}
        >
          {plan === null ? "Print sheet" : `Print sheet — ${plan.label}`}
        </Button>
        <Button variant="ghost" disabled={entry === null} onClick={handleRemove}>
          Clear
        </Button>
        {entry?.pending === true && <span className="text-[13px] text-muted">Reading…</span>}
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The photo is written at {DPI} DPI, so {size.hint} on screen is {size.hint} on paper. Fill
        frame crops the edges to the exact shape; fit inside keeps the whole picture and pads it with
        white. The print sheet repeats the photo on a 4 × 6 inch print with cut lines, which is the
        cheapest thing any lab will run off. It all happens in your browser — nothing is uploaded.
      </p>
    </div>
  );
}

/** The row's second line: what the file is, or what's wrong with it. */
function describe(entry: Entry): string {
  if (entry.error !== undefined) return entry.error;
  if (entry.pending) return "Reading…";
  if (entry.image === null) return formatBytes(entry.size);

  return `${entry.image.width} × ${entry.image.height} · ${formatBytes(entry.size)}`;
}

/**
 * Tinted accent when idle, solid accent when selected — the same treatment Crop
 * Image's shapes and the QR generator's sizes use, since it's the same choice.
 */
function ChoiceButton({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
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
      <span className={cn("font-mono text-[11px]", active ? "text-canvas/75" : "text-accent-deep/70")}>
        {hint}
      </span>
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
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-1.5 font-mono text-[15px] tabular-nums",
          emphasis ? "text-accent-deep" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Same accent-tinted panel the other tools use for inline messages. */
function Notice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-accent bg-accent/[0.06] px-4 py-3">
      <p className="text-[13px] font-medium leading-relaxed text-accent-deep">{message}</p>
    </div>
  );
}
