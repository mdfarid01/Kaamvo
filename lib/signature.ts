/**
 * The drawing behind Signature Pad. Strokes are plain data — a list of lists of
 * points in canvas coordinates — and this file is the only thing that turns them
 * into pixels, both for the live pad and for the PNG that gets downloaded. The
 * component keeps the strokes and handles the pointer; everything about how a
 * signature looks lives here.
 *
 * The export deliberately doesn't reuse the on-screen canvas. It redraws at a
 * multiple of the pad's size, so the download is sharp rather than the 500-pixel
 * strip someone happened to sign in, and it leaves the canvas unpainted so the
 * PNG's background is transparent.
 */

export interface Point {
  x: number;
  y: number;
}

/** One press-drag-release. A tap is a single point, drawn as a dot. */
export type Stroke = Point[];

export interface PenOptions {
  color: string;
  /** Stroke width in pad coordinates, scaled with the export. */
  width: number;
}

export const INK_COLORS: Array<{ value: string; label: string }> = [
  { value: "#1A1A18", label: "Black" },
  { value: "#1D4ED8", label: "Blue" },
];

export const PEN_WIDTHS: Array<{ value: number; label: string }> = [
  { value: 1.5, label: "Fine" },
  { value: 2.5, label: "Medium" },
  { value: 4, label: "Bold" },
];

export const DEFAULT_PEN: PenOptions = { color: INK_COLORS[0].value, width: 2.5 };

/** The pad's own coordinate space; the element is stretched to fit its column. */
export const PAD_WIDTH = 640;
export const PAD_HEIGHT = 220;

/** Pixels of clear space left round the ink when the export is trimmed. */
const TRIM_PADDING = 12;

/**
 * Paints strokes into a context that has already been sized and scaled. Called
 * on every pointer move for the live pad and once for the export, so the two can
 * never drift apart.
 */
export function drawStrokes(
  context: CanvasRenderingContext2D,
  strokes: Stroke[],
  pen: PenOptions,
): void {
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = pen.color;
  context.fillStyle = pen.color;
  context.lineWidth = pen.width;

  for (const stroke of strokes) {
    if (stroke.length === 0) continue;

    // A tap has no length to stroke, and a zero-length path draws nothing at
    // all — so it's filled as a dot the width of the pen instead.
    if (stroke.length === 1) {
      context.beginPath();
      context.arc(stroke[0].x, stroke[0].y, pen.width / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }

    context.beginPath();
    context.moveTo(stroke[0].x, stroke[0].y);
    for (const point of stroke.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    context.stroke();
  }
}

export type SignatureResult = { ok: true; blob: Blob } | { ok: false; error: string };

export interface ExportOptions {
  pen: PenOptions;
  /** 1 is the pad's own size. 3 gives a signature big enough to drop into a PDF. */
  scale: number;
  /** Crops to the ink plus a small margin, rather than keeping the whole pad. */
  trim: boolean;
}

export async function toPng(strokes: Stroke[], options: ExportOptions): Promise<SignatureResult> {
  if (strokes.every((stroke) => stroke.length === 0)) {
    return { ok: false, error: "Draw your signature first." };
  }

  const box = options.trim ? inkBounds(strokes, options.pen.width) : null;
  const width = box === null ? PAD_WIDTH : box.width;
  const height = box === null ? PAD_HEIGHT : box.height;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * options.scale));
    canvas.height = Math.max(1, Math.round(height * options.scale));

    const context = canvas.getContext("2d");
    if (context === null) throw new Error("no-context");

    // Nothing is painted underneath, so every pixel the pen didn't touch stays
    // transparent — the whole point of a signature PNG.
    context.scale(options.scale, options.scale);
    if (box !== null) context.translate(-box.x, -box.y);
    drawStrokes(context, strokes, options.pen);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
    if (blob === null) throw new Error("no-blob");

    return { ok: true, blob };
  } catch {
    return { ok: false, error: "Couldn't save that — the browser wouldn't give up a canvas." };
  }
}

export function signatureFileName(): string {
  return "signature.png";
}

/**
 * The box the ink occupies, grown by half the pen width — a stroke is centred on
 * its path, so its edge sits outside the points that describe it — plus a
 * margin, and clamped to the pad.
 */
function inkBounds(
  strokes: Stroke[],
  penWidth: number,
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    for (const point of stroke) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  const pad = penWidth / 2 + TRIM_PADDING;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);

  return {
    x,
    y,
    width: Math.min(PAD_WIDTH, maxX + pad) - x,
    height: Math.min(PAD_HEIGHT, maxY + pad) - y,
  };
}
