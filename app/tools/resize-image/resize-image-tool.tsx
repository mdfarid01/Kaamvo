"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import { FileSummary } from "@/components/ui/file-summary";
import {
  ACCEPT_ATTRIBUTE,
  formatLabel,
  loadSourceImage,
  releaseSourceImage,
} from "@/lib/image-canvas";
import type { Dimensions, SourceImage } from "@/lib/image-canvas";
import {
  MAX_DIMENSION,
  MIN_DIMENSION,
  SCALES,
  clampDimension,
  keepsAspect,
  matchHeight,
  matchWidth,
  resize,
  resizedFileName,
  scaled,
} from "@/lib/image-resize";
import { cn, formatBytes } from "@/lib/utils";

/**
 * The dropped file. The decode happens on arrival, so `image` is what the file
 * turned out to be: null while it's still being read, and null with an `error`
 * if it couldn't be. A rejected file stays on screen — one that silently fails
 * to appear looks like a bug in the drop zone.
 */
interface Entry {
  file: File;
  name: string;
  size: number;
  image: SourceImage | null;
  error?: string;
  pending: boolean;
}

/** What's in the two boxes, which isn't always a number while it's being typed. */
interface Draft {
  width: string;
  height: string;
}

/** Long enough to swallow typing a three-digit number, short enough to feel live. */
const DEBOUNCE_MS = 250;

export function ResizeImageTool() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [size, setSize] = useState<Dimensions | null>(null);
  // Only the size is debounced; a picked file and a percentage button both take
  // effect at once, since neither arrives in a stream of keystrokes.
  const [debouncedSize, setDebouncedSize] = useState<Dimensions | null>(null);
  const [draft, setDraft] = useState<Draft>({ width: "", height: "" });
  const [lock, setLock] = useState(true);
  const [result, setResult] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Which drop the tool is waiting on. Dropping a second file while the first
  // is still decoding is easy to do, and without this the slower decode would
  // land last and win.
  const loading = useRef(0);

  const handleFiles = useCallback((incoming: File[]) => {
    const file = incoming[0];
    if (file === undefined) return;

    const token = (loading.current += 1);

    setEntry({ file, name: file.name, size: file.size, image: null, pending: true });
    setSize(null);
    setDraft({ width: "", height: "" });
    setResult(null);
    setError(null);
    // The input isn't multiple, but a drag can still carry several files.
    // Taking the first quietly would look like the others failed to register.
    setNotice(
      incoming.length > 1 ? `Only ${file.name} was taken — this tool resizes one image.` : null,
    );

    void loadSourceImage(file).then((outcome) => {
      if (loading.current !== token) {
        // A newer file won the race; this bitmap would otherwise never be freed.
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

      // The original's own size is the starting point: the tool opens on a
      // no-op, so anything you see change is something you asked for.
      setEntry((current) =>
        current?.file === file ? { ...current, image: outcome.image, pending: false } : current,
      );
      setSize({ width: outcome.image.width, height: outcome.image.height });
      setDraft({ width: String(outcome.image.width), height: String(outcome.image.height) });
    });
  }, []);

  const image = entry?.image ?? null;

  // The decoded pixels outlive every render that draws them, and are freed when
  // the image they belong to is replaced or the tool unmounts.
  useEffect(() => {
    if (image === null) return;
    return () => releaseSourceImage(image);
  }, [image]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSize(size), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [size]);

  useEffect(() => {
    if (image === null || debouncedSize === null) {
      setResult(null);
      setIsWorking(false);
      return;
    }

    // A render settles well after it's asked for, so without this guard a slower
    // earlier size could land on top of a newer result.
    let active = true;
    setIsWorking(true);

    void resize(image, debouncedSize).then((outcome) => {
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
  }, [image, debouncedSize]);

  // The preview shows the resized bytes, not the original — the point of the
  // tool is seeing what the new size looks like. Each result gets its own URL,
  // and the cleanup releases the previous one rather than leaking it per keypress.
  useEffect(() => {
    if (result === null) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(result);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [result]);

  /**
   * A typed box. The draft keeps whatever was typed — including a half-finished
   * or empty value — while the size only ever tracks a real number, so the
   * preview can't be knocked out by a field being cleared mid-edit.
   */
  const handleWidth = useCallback(
    (text: string) => {
      setDraft((current) => ({ ...current, width: text }));

      const value = Number(text);
      if (image === null || size === null || text.trim() === "" || !Number.isFinite(value)) return;

      const width = clampDimension(value, size.width);
      if (!lock) {
        setSize({ ...size, width });
        return;
      }

      const height = matchHeight(width, image);
      setSize({ width, height });
      setDraft({ width: text, height: String(height) });
    },
    [image, lock, size],
  );

  const handleHeight = useCallback(
    (text: string) => {
      setDraft((current) => ({ ...current, height: text }));

      const value = Number(text);
      if (image === null || size === null || text.trim() === "" || !Number.isFinite(value)) return;

      const height = clampDimension(value, size.height);
      if (!lock) {
        setSize({ ...size, height });
        return;
      }

      const width = matchWidth(height, image);
      setSize({ width, height });
      setDraft({ width: String(width), height: text });
    },
    [image, lock, size],
  );

  /** Puts an emptied or out-of-range box back to the size actually in use. */
  const handleBlur = useCallback(() => {
    if (size === null) return;
    setDraft({ width: String(size.width), height: String(size.height) });
  }, [size]);

  const applySize = useCallback((next: Dimensions) => {
    setSize(next);
    setDraft({ width: String(next.width), height: String(next.height) });
  }, []);

  /**
   * Turning the lock on re-squares the box from its width, rather than leaving a
   * stretched size sitting under a control that says it can't happen.
   */
  const handleLock = useCallback(() => {
    setLock((current) => {
      const next = !current;
      if (next && image !== null && size !== null) {
        applySize({ width: size.width, height: matchHeight(size.width, image) });
      }
      return next;
    });
  }, [applySize, image, size]);

  const handleRemove = useCallback(() => {
    loading.current += 1;
    setEntry(null);
    setSize(null);
    setDebouncedSize(null);
    setDraft({ width: "", height: "" });
    setResult(null);
    setError(null);
    setNotice(null);
  }, []);

  const handleClear = useCallback(() => {
    handleRemove();
    setLock(true);
  }, [handleRemove]);

  const handleDownload = useCallback(() => {
    if (result === null || image === null || size === null) return;

    const url = URL.createObjectURL(result);
    const link = document.createElement("a");
    link.href = url;
    link.download = resizedFileName(image, size);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [image, result, size]);

  const stretching = image !== null && size !== null && !lock && !keepsAspect(size, image);

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

      {image && size && (
        <>
          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-end gap-4">
              <DimensionField
                id="resize-width"
                label="Width"
                value={draft.width}
                onChange={handleWidth}
                onBlur={handleBlur}
              />
              <span className="pb-2 text-[13px] text-faint" aria-hidden="true">
                ×
              </span>
              <DimensionField
                id="resize-height"
                label="Height"
                value={draft.height}
                onChange={handleHeight}
                onBlur={handleBlur}
              />
              <LockToggle locked={lock} onChange={handleLock} />
            </div>

            <div className="mt-4 border-t border-line-soft pt-3">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                Or a percentage of the original
              </h2>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {SCALES.map((percent) => {
                  const target = scaled(image, percent);
                  return (
                    <ChoiceButton
                      key={percent}
                      label={`${percent}%`}
                      hint={`${target.width}×${target.height}`}
                      active={target.width === size.width && target.height === size.height}
                      onClick={() => applySize(target)}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {stretching && (
            <p className="text-[13px] leading-relaxed text-muted">
              With the lock off this size doesn’t match the original’s proportions, so the image will
              be stretched to fit it.
            </p>
          )}
        </>
      )}

      {error && <ErrorNotice message={error} />}

      {image && size && (
        <Card className={cn("p-4 transition-opacity duration-150", isWorking && "opacity-60")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Original" value={`${image.width} × ${image.height}`} />
            <Stat label="New size" value={`${size.width} × ${size.height}`} emphasis />
            <Stat
              label={formatLabel(image.type)}
              value={result === null ? "—" : formatBytes(result.size)}
            />
          </div>
        </Card>
      )}

      {previewUrl && image && (
        <Card className="flex items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- the source is
              a blob URL for bytes encoded in the browser; there is nothing for
              next/image to fetch or optimize. */}
          <img
            src={previewUrl}
            alt={`Resized preview of ${image.name}`}
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
        <Button variant="secondary" disabled={entry === null} onClick={handleClear}>
          Clear
        </Button>
        {entry?.pending === true && <span className="text-[13px] text-muted">Reading…</span>}
        <span aria-live="polite" className="sr-only">
          {result && size && !isWorking
            ? `Resized to ${size.width} by ${size.height} pixels, ${formatBytes(result.size)}`
            : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The image is redrawn in your browser and never uploaded anywhere. It comes back in the format
        it went in as, so a PNG keeps its transparency. Enlarging past the original can’t add detail
        that was never there — shrinking is where this tool earns its keep.
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

function DimensionField({
  id,
  label,
  value,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted"
      >
        {label}
      </label>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={MIN_DIMENSION}
          max={MAX_DIMENSION}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          className="h-9 w-[92px] rounded-md border border-line bg-canvas px-2.5 font-mono text-[13px] tabular-nums text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
        />
        <span className="text-[13px] text-faint">px</span>
      </div>
    </div>
  );
}

/**
 * A checkbox rather than a pair of buttons: it's one thing that's either on or
 * off, and the native control already says so to a screen reader.
 */
function LockToggle({ locked, onChange }: { locked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 pb-2 text-[13px] text-ink">
      <input
        type="checkbox"
        checked={locked}
        onChange={onChange}
        className="h-4 w-4 cursor-pointer accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
      />
      Keep proportions
    </label>
  );
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
