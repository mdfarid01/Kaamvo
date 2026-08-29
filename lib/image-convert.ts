/**
 * Format handling for the Convert Image tool. lib/image-canvas.ts already knows
 * how to draw an image out as a given type; what this file adds is which types
 * are worth offering, and which of them the browser in front of you can
 * actually write.
 *
 * That last part isn't decoration. canvas.toBlob has no way to say "I can't do
 * that": asked for a format it doesn't support it quietly encodes a PNG instead
 * and returns it. renderToBlob catches the substitution after the fact, but a
 * button that can only ever produce an error shouldn't be on screen — so the
 * list is probed once, per browser, before it's shown.
 */

import { canEncode, formatLabel, renderToBlob, suffixedFileName } from "./image-canvas";
import type { RenderResult, SourceImage } from "./image-canvas";

/**
 * Offered in the order people reach for them: PNG for anything with edges or
 * transparency, JPG for photographs, WebP and AVIF for the web. AVIF is last
 * because it's the one most likely to be missing.
 */
export const TARGET_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"] as const;

export type TargetType = (typeof TARGET_TYPES)[number];

/**
 * Quality for the lossy targets. Deliberately fixed and high: this tool changes
 * the container, and the Image Compressor next door is where you go to trade
 * detail for bytes. A quality slider here would make two tools that do the same
 * thing and disagree about it.
 */
export const CONVERT_QUALITY = 0.92;

export interface FormatOption {
  type: TargetType;
  /** "PNG", "JPG" — the extension, upper-cased. */
  label: string;
  hint: string;
}

const HINTS: Record<TargetType, string> = {
  "image/png": "lossless",
  "image/jpeg": "photos",
  "image/webp": "smaller",
  "image/avif": "smallest",
};

/**
 * The formats this browser can write, minus the one the file already is —
 * re-encoding a JPEG as a JPEG isn't a conversion, and the compressor covers
 * wanting to do it anyway.
 */
export async function availableTargets(sourceType: string): Promise<FormatOption[]> {
  const checks = await Promise.all(
    TARGET_TYPES.map(async (type) => ({ type, ok: type !== sourceType && (await canEncode(type)) })),
  );

  return checks
    .filter((check) => check.ok)
    .map((check) => ({ type: check.type, label: formatLabel(check.type), hint: HINTS[check.type] }));
}

export function convert(image: SourceImage, type: TargetType): Promise<RenderResult> {
  // Same pixels, same size — only the encoding changes.
  return renderToBlob(image, {
    width: image.width,
    height: image.height,
    type,
    quality: CONVERT_QUALITY,
  });
}

/**
 * photo.png becomes photo.webp. No suffix, unlike the other two tools: the
 * extension has already changed, so the download can't overwrite the original.
 */
export function convertedFileName(name: string, type: TargetType): string {
  return suffixedFileName(name, "", type);
}
