"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DEFAULT_PEN,
  INK_COLORS,
  PAD_HEIGHT,
  PAD_WIDTH,
  PEN_WIDTHS,
  drawStrokes,
  signatureFileName,
  toPng,
} from "@/lib/signature";
import type { PenOptions, Stroke } from "@/lib/signature";
import { cn, formatBytes } from "@/lib/utils";

/** What the download is drawn at, as a multiple of the pad's own size. */
const EXPORT_SCALE = 3;

export function SignaturePadTool() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /**
   * The signature itself lives in a ref, not in state: a pointer move adds a
   * point every few milliseconds, and re-rendering the page for each one would
   * make the line lag behind the cursor. The canvas is repainted directly
   * instead, and `strokeCount` is bumped only when a stroke starts or ends —
   * which is all the buttons need to know about.
   */
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef(false);
  const [strokeCount, setStrokeCount] = useState(0);

  const [pen, setPen] = useState<PenOptions>(DEFAULT_PEN);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const context = canvas.getContext("2d");
    if (context === null) return;

    // The backing store is bigger than the pad's coordinate space on a retina
    // screen, so every repaint re-establishes the transform before clearing.
    const ratio = canvas.width / PAD_WIDTH;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);

    drawStrokes(context, strokes.current, pen);
  }, [pen]);

  // Sized once for the display it opened on, then repainted whenever the pen
  // changes — the colour and width apply to the whole signature, not per stroke.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(PAD_WIDTH * ratio);
    canvas.height = Math.round(PAD_HEIGHT * ratio);

    redraw();
  }, [redraw]);

  /** Client coordinates to pad coordinates — the element is stretched to fit. */
  const pointAt = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const box = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - box.left) / box.width) * PAD_WIDTH,
      y: ((event.clientY - box.top) / box.height) * PAD_HEIGHT,
    };
  }, []);

  const handleDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      // Capture keeps the line following a pointer that wanders off the pad
      // mid-stroke, rather than ending it at the edge.
      event.currentTarget.setPointerCapture(event.pointerId);
      drawing.current = true;
      strokes.current = [...strokes.current, [pointAt(event)]];
      setResult(null);
      setError(null);
      setStrokeCount(strokes.current.length);
      redraw();
    },
    [pointAt, redraw],
  );

  const handleMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current) return;

      const current = strokes.current[strokes.current.length - 1];
      current.push(pointAt(event));
      redraw();
    },
    [pointAt, redraw],
  );

  const handleUp = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    setStrokeCount(strokes.current.length);
  }, []);

  const handleClear = useCallback(() => {
    strokes.current = [];
    setStrokeCount(0);
    setResult(null);
    setError(null);
    redraw();
  }, [redraw]);

  const handleUndo = useCallback(() => {
    strokes.current = strokes.current.slice(0, -1);
    setStrokeCount(strokes.current.length);
    setResult(null);
    setError(null);
    redraw();
  }, [redraw]);

  const handleDownload = useCallback(async () => {
    const outcome = await toPng(strokes.current, { pen, scale: EXPORT_SCALE, trim: true });
    if (!outcome.ok) {
      setResult(null);
      setError(outcome.error);
      return;
    }

    setResult(outcome.blob);
    setError(null);

    const url = URL.createObjectURL(outcome.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = signatureFileName();
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [pen]);

  const empty = strokeCount === 0;

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <canvas
          ref={canvasRef}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          role="img"
          aria-label="Signature pad — draw with a mouse, pen or finger"
          // touch-none stops a finger drag from scrolling the page instead of
          // signing; the aspect ratio keeps the drawn line where the finger is
          // however wide the column gets.
          className="block w-full cursor-crosshair touch-none rounded bg-canvas"
          style={{ aspectRatio: `${PAD_WIDTH} / ${PAD_HEIGHT}` }}
        />
        <div className="mt-2 border-t border-line pt-2 text-center text-[12px] text-muted">
          {empty
            ? "Sign in the box — mouse, pen or finger"
            : `${strokeCount} ${strokeCount === 1 ? "stroke" : "strokes"}`}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Ink</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {INK_COLORS.map((option) => (
              <ChoiceButton
                key={option.value}
                label={option.label}
                active={option.value === pen.color}
                onClick={() => setPen((current) => ({ ...current, color: option.value }))}
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Nib</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {PEN_WIDTHS.map((option) => (
              <ChoiceButton
                key={option.value}
                label={option.label}
                active={option.value === pen.width}
                onClick={() => setPen((current) => ({ ...current, width: option.value }))}
              />
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-accent bg-accent/[0.06] px-4 py-3">
          <p className="text-[13px] font-medium leading-relaxed text-accent-deep">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={empty} onClick={() => void handleDownload()}>
          Download PNG
        </Button>
        <Button variant="secondary" disabled={empty} onClick={handleUndo}>
          Undo stroke
        </Button>
        <Button variant="secondary" disabled={empty} onClick={handleClear}>
          Clear
        </Button>
        {result && (
          <span className="font-mono text-[13px] tabular-nums text-muted">
            {formatBytes(result.size)}
          </span>
        )}
        <span aria-live="polite" className="sr-only">
          {result ? "Signature downloaded" : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The PNG has a transparent background and is cropped to the ink, so it drops onto a letter or
        a contract without a white box around it. It’s drawn at three times the size of the pad, which
        is enough to stay sharp in print. The ink colour and nib apply to the whole signature, and
        nothing here leaves your browser — there’s no upload and nothing is stored.
      </p>
    </div>
  );
}

/** The same tinted-to-solid treatment the other tools' option buttons use. */
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
