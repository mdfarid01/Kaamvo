"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
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
import type { Rect, SourceImage } from "@/lib/image-canvas";
import {
  ASPECTS,
  DEFAULT_ASPECT,
  HANDLES,
  cropImage,
  croppedFileName,
  fitToRatio,
  initialCrop,
  moveCrop,
  ratioFor,
  resizeCrop,
} from "@/lib/image-crop";
import type { AspectValue, Handle } from "@/lib/image-crop";
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

/** Long enough to swallow a drag, short enough that the size readout keeps up. */
const DEBOUNCE_MS = 250;

/** Arrow-key nudge, in image pixels. Shift is the coarse version. */
const KEY_STEP = 1;
const KEY_STEP_COARSE = 10;

export function CropImageTool() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [aspect, setAspect] = useState<AspectValue>(DEFAULT_ASPECT);
  const [rect, setRect] = useState<Rect | null>(null);
  const [debouncedRect, setDebouncedRect] = useState<Rect | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [result, setResult] = useState<Blob | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Which drop the tool is waiting on, so a slower earlier decode can't land on
  // top of a newer one.
  const loading = useRef(0);

  const handleFiles = useCallback(
    (incoming: File[]) => {
      const file = incoming[0];
      if (file === undefined) return;

      const token = (loading.current += 1);

      setEntry({ file, name: file.name, size: file.size, image: null, pending: true });
      setRect(null);
      setResult(null);
      setError(null);
      setNotice(
        incoming.length > 1 ? `Only ${file.name} was taken — this tool crops one image.` : null,
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
        setRect(initialCrop(outcome.image, ratioFor(aspect)));
      });
    },
    [aspect],
  );

  const image = entry?.image ?? null;

  // The decoded pixels outlive every render that draws them, and are freed when
  // the image they belong to is replaced or the tool unmounts.
  useEffect(() => {
    if (image === null) return;
    return () => releaseSourceImage(image);
  }, [image]);

  // The frame is drawn over the *original*, at whatever size it fits the page —
  // the crop box is positioned in percentages, so the display scale never has
  // to be baked into the rectangle.
  useEffect(() => {
    if (entry === null) {
      setSourceUrl(null);
      return;
    }

    const url = URL.createObjectURL(entry.file);
    setSourceUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [entry]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRect(rect), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rect]);

  // Cropping as you drag, rather than behind a button, so the download is ready
  // the moment the box is where you want it.
  useEffect(() => {
    if (image === null || debouncedRect === null) {
      setResult(null);
      setIsWorking(false);
      return;
    }

    let active = true;
    setIsWorking(true);

    void cropImage(image, debouncedRect).then((outcome) => {
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
  }, [image, debouncedRect]);

  const handleAspect = useCallback(
    (next: AspectValue) => {
      setAspect(next);
      if (image === null || rect === null) return;
      setRect(fitToRatio(rect, ratioFor(next), image));
    },
    [image, rect],
  );

  const handleReset = useCallback(() => {
    if (image === null) return;
    setRect(initialCrop(image, ratioFor(aspect)));
  }, [aspect, image]);

  const handleRemove = useCallback(() => {
    loading.current += 1;
    setEntry(null);
    setRect(null);
    setDebouncedRect(null);
    setResult(null);
    setError(null);
    setNotice(null);
  }, []);

  const handleClear = useCallback(() => {
    handleRemove();
    setAspect(DEFAULT_ASPECT);
  }, [handleRemove]);

  const handleDownload = useCallback(() => {
    if (result === null || image === null || debouncedRect === null) return;

    const url = URL.createObjectURL(result);
    const link = document.createElement("a");
    link.href = url;
    link.download = croppedFileName(image, debouncedRect);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [debouncedRect, image, result]);

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
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Shape</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {ASPECTS.map((option) => (
            <ChoiceButton
              key={option.value}
              label={option.label}
              active={option.value === aspect}
              onClick={() => handleAspect(option.value)}
            />
          ))}
        </div>
      </div>

      {error && <ErrorNotice message={error} />}

      {image && rect && sourceUrl && (
        <>
          <CropFrame
            image={image}
            sourceUrl={sourceUrl}
            rect={rect}
            ratio={ratioFor(aspect)}
            onChange={setRect}
          />

          <Card className={cn("p-4 transition-opacity duration-150", isWorking && "opacity-60")}>
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Original" value={`${image.width} × ${image.height}`} />
              <Stat label="Crop" value={`${rect.width} × ${rect.height}`} emphasis />
              <Stat label="From" value={`${rect.x}, ${rect.y}`} />
              <Stat
                label={formatLabel(image.type)}
                value={result === null ? "—" : formatBytes(result.size)}
              />
            </div>
          </Card>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={result === null || isWorking} onClick={handleDownload}>
          Download crop
        </Button>
        <Button variant="secondary" disabled={image === null} onClick={handleReset}>
          Reset box
        </Button>
        <Button variant="ghost" disabled={entry === null} onClick={handleClear}>
          Clear
        </Button>
        {entry?.pending === true && <span className="text-[13px] text-muted">Reading…</span>}
        <span aria-live="polite" className="sr-only">
          {result && rect && !isWorking
            ? `Crop is ${rect.width} by ${rect.height} pixels, ${formatBytes(result.size)}`
            : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Drag inside the box to move it, or a corner to resize it — with a shape chosen, the corners
        keep to it. The kept pixels are taken at full resolution and never rescaled, so a crop is
        exactly the part of the original you framed. It runs in your browser; nothing is uploaded.
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
 * The image with a crop box over it. Its only job is turning gestures into
 * pixel deltas — every decision about where the box may go belongs to
 * lib/image-crop.ts, which is why this component holds no rectangle of its own.
 *
 * The box is positioned in percentages of the image, so it lines up whatever
 * size the picture happens to be drawn at, and a delta only has to be divided
 * by the current scale on its way in.
 */
function CropFrame({
  image,
  sourceUrl,
  rect,
  ratio,
  onChange,
}: {
  image: SourceImage;
  sourceUrl: string;
  rect: Rect;
  ratio: number | null;
  onChange: (rect: Rect) => void;
}) {
  const overlay = useRef<HTMLDivElement>(null);

  /**
   * The gesture in progress. Deltas are measured from the rectangle as it was
   * when the drag started rather than applied one frame at a time, so rounding
   * can't accumulate over a long drag and the box can't creep.
   */
  const drag = useRef<{
    pointerId: number;
    part: "move" | Handle;
    startX: number;
    startY: number;
    startRect: Rect;
    scale: number;
  } | null>(null);

  const begin = (event: PointerEvent<HTMLElement>, part: "move" | Handle) => {
    const bounds = overlay.current?.getBoundingClientRect();
    if (bounds === undefined || bounds.width === 0) return;

    // Left button only, and never a two-finger gesture.
    if (event.button !== 0) return;

    event.preventDefault();
    // A corner sits inside the box, and both want the same pointer.
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    drag.current = {
      pointerId: event.pointerId,
      part,
      startX: event.clientX,
      startY: event.clientY,
      startRect: rect,
      // Displayed pixels per image pixel.
      scale: bounds.width / image.width,
    };
  };

  const proceed = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (state === null || state.pointerId !== event.pointerId) return;

    const dx = (event.clientX - state.startX) / state.scale;
    const dy = (event.clientY - state.startY) / state.scale;

    onChange(
      state.part === "move"
        ? moveCrop(state.startRect, dx, dy, image)
        : resizeCrop(state.startRect, state.part, dx, dy, ratio, image),
    );
  };

  const finish = (event: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  /** Arrow keys on the box move it; on a corner they resize from that corner. */
  const nudge = (event: KeyboardEvent<HTMLElement>, part: "move" | Handle) => {
    const step = event.shiftKey ? KEY_STEP_COARSE : KEY_STEP;
    const delta = ARROWS[event.key];
    if (delta === undefined) return;

    event.preventDefault();
    // A corner is inside the box, which listens for the same keys — without this
    // an arrow on a corner would resize it and then move the whole box too.
    event.stopPropagation();

    const dx = delta.x * step;
    const dy = delta.y * step;

    onChange(
      part === "move" ? moveCrop(rect, dx, dy, image) : resizeCrop(rect, part, dx, dy, ratio, image),
    );
  };

  const box: CSSProperties = {
    left: `${(rect.x / image.width) * 100}%`,
    top: `${(rect.y / image.height) * 100}%`,
    width: `${(rect.width / image.width) * 100}%`,
    height: `${(rect.height / image.height) * 100}%`,
    // Dims everything outside the box without needing four separate panels.
    boxShadow: "0 0 0 9999px rgba(44, 44, 42, 0.55)",
  };

  return (
    <Card className="flex justify-center p-4">
      <div className="relative inline-block max-w-full overflow-hidden rounded">
        {/* eslint-disable-next-line @next/next/no-img-element -- the source is a
            blob URL for a file the visitor just picked; there is nothing for
            next/image to fetch or optimize. */}
        <img
          src={sourceUrl}
          alt={`${image.name}, with the crop area drawn over it`}
          draggable={false}
          className="block max-h-[420px] w-auto max-w-full select-none"
        />

        <div ref={overlay} className="absolute inset-0 touch-none">
          <div
            role="group"
            aria-label="Crop area. Arrow keys move it; hold shift for larger steps."
            tabIndex={0}
            onPointerDown={(event) => begin(event, "move")}
            onPointerMove={proceed}
            onPointerUp={finish}
            onPointerCancel={finish}
            onKeyDown={(event) => nudge(event, "move")}
            style={box}
            className="absolute cursor-move outline outline-1 outline-canvas focus-visible:outline-2 focus-visible:outline-accent"
          >
            {HANDLES.map((handle) => (
              <button
                key={handle}
                type="button"
                aria-label={`${CORNERS[handle]} corner. Arrow keys resize; hold shift for larger steps.`}
                onPointerDown={(event) => begin(event, handle)}
                onPointerMove={proceed}
                onPointerUp={finish}
                onPointerCancel={finish}
                onKeyDown={(event) => nudge(event, handle)}
                className={cn(
                  "absolute h-3.5 w-3.5 rounded-sm border border-ink bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  HANDLE_POSITIONS[handle],
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Which way each arrow key pushes, in image coordinates. */
const ARROWS: Record<string, { x: number; y: number } | undefined> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

const CORNERS: Record<Handle, string> = {
  nw: "Top left",
  ne: "Top right",
  sw: "Bottom left",
  se: "Bottom right",
};

/** Centred on the corner, so the grab point is the corner itself. */
const HANDLE_POSITIONS: Record<Handle, string> = {
  nw: "-left-1.5 -top-1.5 cursor-nwse-resize",
  ne: "-right-1.5 -top-1.5 cursor-nesw-resize",
  sw: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
  se: "-bottom-1.5 -right-1.5 cursor-nwse-resize",
};

/**
 * Tinted accent when idle, solid accent when selected — the same treatment the
 * QR generator's size buttons and Rotate PDF's turns use, since it's the same
 * kind of choice.
 */
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
