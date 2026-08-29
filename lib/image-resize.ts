/**
 * Dimension arithmetic for the Resize Image tool. The drawing and encoding are
 * lib/image-canvas.ts's job; what's left here is working out what size to ask
 * for, which is all the interesting behaviour — an aspect-ratio lock is a rule
 * about numbers, and it's testable as one.
 *
 * Everything except resize() itself is pure.
 */

import { DEFAULT_QUALITY, renderToBlob, suffixedFileName } from "./image-canvas";
import type { Dimensions, RenderResult, SourceImage } from "./image-canvas";

export type { Dimensions };

/**
 * A single pixel is a legitimate thing to ask for, and 8000 clears any camera
 * or print size while leaving the output inside MAX_OUTPUT_PIXELS for all but
 * the most lopsided shapes.
 */
export const MIN_DIMENSION = 1;
export const MAX_DIMENSION = 8000;

/** The percentage buttons, as fractions of the original. */
export const SCALES = [25, 50, 75, 100] as const;

/**
 * Keeps a typed dimension usable. An empty or half-typed field arrives as NaN,
 * which becomes the fallback — the value the box already had — so a field being
 * cleared mid-edit doesn't collapse the preview to a 1-pixel image.
 */
export function clampDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), MIN_DIMENSION), MAX_DIMENSION);
}

/**
 * The other dimension, at the original's proportions. Rounded and floored at 1,
 * so a very wide image asked for 3 pixels wide gets a 1-pixel height rather
 * than a 0-pixel one that can't be drawn.
 */
export function matchHeight(width: number, source: Dimensions): number {
  return clampDimension(Math.round((width * source.height) / source.width), MIN_DIMENSION);
}

export function matchWidth(height: number, source: Dimensions): number {
  return clampDimension(Math.round((height * source.width) / source.height), MIN_DIMENSION);
}

/**
 * Both dimensions at a percentage of the original. Derived from the original
 * each time rather than from the current box, so 50% then 100% lands back on
 * the size you started with instead of accumulating rounding.
 */
export function scaled(source: Dimensions, percent: number): Dimensions {
  return {
    width: clampDimension(Math.round((source.width * percent) / 100), MIN_DIMENSION),
    height: clampDimension(Math.round((source.height * percent) / 100), MIN_DIMENSION),
  };
}

/**
 * Whether a size is the original's shape, within a pixel of rounding. The tool
 * uses it to say when an unlocked size will stretch the image, which is the one
 * thing about this tool that can surprise someone.
 */
export function keepsAspect(size: Dimensions, source: Dimensions): boolean {
  return Math.abs(matchHeight(size.width, source) - size.height) <= 1;
}

export function resize(image: SourceImage, size: Dimensions): Promise<RenderResult> {
  // The whole image, scaled to the box — cropping is the other tool.
  return renderToBlob(image, {
    width: size.width,
    height: size.height,
    type: image.type,
    quality: DEFAULT_QUALITY,
  });
}

/**
 * photo.jpg becomes photo-800x600.jpg. The size rather than a plain "-resized"
 * because trying a few sizes is the normal way to use this, and four files all
 * called photo-resized.jpg tell you nothing about which is which.
 */
export function resizedFileName(image: SourceImage, size: Dimensions): string {
  return suffixedFileName(image.name, `${size.width}x${size.height}`, image.type);
}
