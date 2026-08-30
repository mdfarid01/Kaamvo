/**
 * The stamp behind Watermark Image. A decoded file from lib/image-canvas.ts plus
 * some text in, encoded bytes out — the same split as lib/image-resize.ts and
 * its siblings, so the UI layer holds form state and only this file draws.
 *
 * It doesn't go through renderToBlob: that draws a rectangle of the source and
 * nothing else, and this needs a second pass with text on top. What it does
 * borrow is the caps and the naming, so a 50-megapixel drop fails here the same
 * way it fails there.
 */

import { DEFAULT_QUALITY, MAX_OUTPUT_PIXELS, extensionFor, hasAlpha } from "./image-canvas";
import type { RenderResult, SourceImage } from "./image-canvas";

export type WatermarkPosition =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

/** Light text on a photo, dark text on a screenshot. */
export type WatermarkColor = "white" | "black";

export type WatermarkSize = "small" | "medium" | "large";

export interface ImageWatermarkOptions {
  text: string;
  /** 0.05–1. */
  opacity: number;
  position: WatermarkPosition;
  size: WatermarkSize;
  color: WatermarkColor;
  /** Corner-to-corner, and only honoured in the centre — see draw() below. */
  diagonal: boolean;
}

export const DEFAULT_OPTIONS: ImageWatermarkOptions = {
  text: "© Your Name",
  opacity: 0.45,
  position: "bottom-right",
  size: "medium",
  color: "white",
  diagonal: false,
};

export const POSITIONS: Array<{ value: WatermarkPosition; label: string }> = [
  { value: "center", label: "Centre" },
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];

export const SIZES: Array<{ value: WatermarkSize; label: string }> = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

export const COLORS: Array<{ value: WatermarkColor; label: string }> = [
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
];

/**
 * As a fraction of the image's shorter side, so the same choice reads the same
 * on a portrait photo and a landscape one.
 */
const SIZE_SCALE: Record<WatermarkSize, number> = { small: 0.04, medium: 0.065, large: 0.1 };

/** Inset from the edge, as a fraction of the shorter side. */
const INSET = 0.03;

/**
 * Neither codec-specific nor guaranteed: a browser picks its own face for a
 * generic family, and the point here is that it has one at every size.
 */
const FAMILY = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

export const MIN_OPACITY = 0.05;
export const MAX_OPACITY = 1;

export async function watermarkImage(
  image: SourceImage,
  options: ImageWatermarkOptions,
): Promise<RenderResult> {
  const text = options.text.trim();
  if (text === "") {
    return { ok: false, error: "Type the words you want stamped on the image." };
  }
  if (image.width * image.height > MAX_OUTPUT_PIXELS) {
    return { ok: false, error: "That image is too large to redraw in the browser." };
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;

    const context = canvas.getContext("2d");
    if (context === null) throw new Error("no-context");

    context.drawImage(image.bitmap, 0, 0);
    draw(context, image, { ...options, text });

    const type = image.type;
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, hasAlpha(type) ? undefined : DEFAULT_QUALITY);
    });
    if (blob === null) throw new Error("no-blob");

    return { ok: true, blob };
  } catch (error) {
    return { ok: false, error: describeError(error, image.name) };
  }
}

/** photo.jpg becomes photo-watermarked.jpg — the format is never changed here. */
export function watermarkedFileName(name: string, type: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim();
  const stem = base === "" ? "image" : base;

  return `${stem}-watermarked.${extensionFor(type)}`;
}

export function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_OPTIONS.opacity;
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, value));
}

/**
 * One line of text on the drawn image.
 *
 * The diagonal only applies in the centre: rotating about a corner anchor sends
 * most of the line off the canvas, and a corner watermark that has to be shrunk
 * to survive its own rotation isn't worth the option.
 *
 * A hairline outline in the opposite colour goes under the fill, so white text
 * stays visible over a white sky and black text over a black one.
 */
function draw(
  context: CanvasRenderingContext2D,
  image: SourceImage,
  options: ImageWatermarkOptions,
): void {
  const shortSide = Math.min(image.width, image.height);
  const inset = shortSide * INSET;
  const rotated = options.diagonal && options.position === "center";

  let size = Math.max(8, Math.round(shortSide * SIZE_SCALE[options.size]));
  context.font = `600 ${size}px ${FAMILY}`;

  // The room a line has depends on where it sits: a corner stamp is bounded by
  // the width less its two insets, a diagonal one by the image's diagonal.
  const room = rotated
    ? Math.hypot(image.width, image.height) * 0.9
    : image.width - inset * 2;

  const measured = context.measureText(options.text).width;
  if (measured > room && measured > 0) {
    size = Math.max(8, Math.floor(size * (room / measured)));
    context.font = `600 ${size}px ${FAMILY}`;
  }

  context.globalAlpha = clampOpacity(options.opacity);
  context.fillStyle = options.color === "white" ? "#FFFFFF" : "#000000";
  context.strokeStyle = options.color === "white" ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)";
  context.lineWidth = Math.max(1, size * 0.04);
  context.lineJoin = "round";

  const top = options.position.startsWith("top");
  const centre = options.position === "center";

  context.textAlign = centre ? "center" : options.position.endsWith("left") ? "left" : "right";
  context.textBaseline = centre ? "middle" : top ? "top" : "bottom";

  const x = centre ? image.width / 2 : context.textAlign === "left" ? inset : image.width - inset;
  const y = centre ? image.height / 2 : top ? inset : image.height - inset;

  context.save();
  if (rotated) {
    context.translate(x, y);
    context.rotate(-Math.atan2(image.height, image.width));
    context.strokeText(options.text, 0, 0);
    context.fillText(options.text, 0, 0);
  } else {
    context.strokeText(options.text, x, y);
    context.fillText(options.text, x, y);
  }
  context.restore();
}

function describeError(error: unknown, name: string): string {
  if (error instanceof Error && (error.message === "no-context" || error.message === "no-blob")) {
    return `Couldn't redraw ${name} — the browser wouldn't give up a canvas.`;
  }

  return `Couldn't stamp ${name} — it may be too large to redraw in the browser.`;
}
