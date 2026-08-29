/**
 * Crop-box geometry for the Crop Image tool. The box is dragged around with a
 * pointer, but everything about where it may go is decided here: the UI turns a
 * gesture into a pixel delta, hands it to one of these functions, and draws
 * whatever comes back.
 *
 * That split is the point. A draggable crop box is the part of this tool most
 * likely to be subtly wrong — a corner that escapes the image by a pixel, a 1:1
 * preset that writes a 400 × 399 file, a box that inverts when you drag it past
 * its own anchor — and none of those are things you can see reliably by looking
 * at a screenshot. As pure functions over integers they're plain arithmetic.
 *
 * Every rectangle in and out of this file is in *image pixels*, whole numbers,
 * inside the image. Display scale never gets in here.
 */

import { DEFAULT_QUALITY, renderToBlob } from "./image-canvas";
import type { Dimensions, Rect, RenderResult, SourceImage } from "./image-canvas";

export type { Rect };

export type AspectValue = "free" | "1:1" | "4:3" | "16:9";

/**
 * `ratio` is width ÷ height, and null means the two axes move independently.
 * Free is first because it's the default: the presets are for when you already
 * know what the crop is for.
 */
export const ASPECTS: Array<{ value: AspectValue; label: string; ratio: number | null }> = [
  { value: "free", label: "Free", ratio: null },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
];

export const DEFAULT_ASPECT: AspectValue = "free";

export function ratioFor(aspect: AspectValue): number | null {
  return ASPECTS.find((option) => option.value === aspect)?.ratio ?? null;
}

/**
 * Small enough to crop a detail out of a photo, large enough that the corner
 * handles don't overlap into an unusable knot.
 */
export const MIN_CROP = 16;

/** Corner handles. There are no edge handles — four corners is enough to aim. */
export type Handle = "nw" | "ne" | "sw" | "se";

export const HANDLES: Handle[] = ["nw", "ne", "sw", "se"];

/** Which way the box grows when a given corner is dragged away from centre. */
const DIRECTIONS: Record<Handle, { x: 1 | -1; y: 1 | -1 }> = {
  nw: { x: -1, y: -1 },
  ne: { x: 1, y: -1 },
  sw: { x: -1, y: 1 },
  se: { x: 1, y: 1 },
};

/**
 * How much of the image the box covers when a file is dropped. Not the whole
 * frame: a box inset from the edges is visibly a box you can grab, where one
 * flush with the image looks like no crop at all.
 */
const INITIAL_FRACTION = 0.8;

/** A centred starting box, of the current aspect if one is set. */
export function initialCrop(image: Dimensions, ratio: number | null): Rect {
  const size = sizeWithin(
    image.width * INITIAL_FRACTION,
    image.height * INITIAL_FRACTION,
    ratio,
    image,
    "inscribe",
  );

  return centre(size, image);
}

/**
 * Reshapes the box to a newly chosen aspect, keeping its centre and staying
 * inside the image. Free leaves it exactly as it is — switching to Free is a
 * release of the constraint, not a reset of the crop.
 */
export function fitToRatio(rect: Rect, ratio: number | null, image: Dimensions): Rect {
  if (ratio === null) return clampToImage(rect, image);

  // Inscribed in the box that's already there, so choosing a shape only ever
  // trims the selection — picking 1:1 shouldn't hand back a taller crop than
  // the one you had.
  const size = sizeWithin(rect.width, rect.height, ratio, image, "inscribe");
  const centred = {
    x: Math.round(rect.x + rect.width / 2 - size.width / 2),
    y: Math.round(rect.y + rect.height / 2 - size.height / 2),
    ...size,
  };

  return clampToImage(centred, image);
}

/**
 * Slides the box without resizing it. Hitting an edge stops it there rather
 * than shrinking it, which is what dragging something across a surface does.
 */
export function moveCrop(rect: Rect, dx: number, dy: number, image: Dimensions): Rect {
  return clampToImage({ ...rect, x: Math.round(rect.x + dx), y: Math.round(rect.y + dy) }, image);
}

/**
 * Drags one corner, with the opposite corner pinned. The order matters: the
 * corner is free to travel anywhere, then the *size* is clamped — to the room
 * left between the anchor and the edge of the image, to MIN_CROP, and to the
 * aspect if one is set. Clamping the corner's position first instead would let
 * a ratio box fight the image edge and drift off its anchor.
 */
export function resizeCrop(
  rect: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  ratio: number | null,
  image: Dimensions,
): Rect {
  const direction = DIRECTIONS[handle];
  const anchorX = direction.x > 0 ? rect.x : rect.x + rect.width;
  const anchorY = direction.y > 0 ? rect.y : rect.y + rect.height;

  // How far the box can grow from its anchor before it leaves the image.
  const room = {
    width: direction.x > 0 ? image.width - anchorX : anchorX,
    height: direction.y > 0 ? image.height - anchorY : anchorY,
  };

  // Negative when the corner is dragged past its anchor; the box doesn't flip
  // inside out, it bottoms out at MIN_CROP against the anchor.
  const wanted = {
    width: rect.width + direction.x * dx,
    height: rect.height + direction.y * dy,
  };

  const size = sizeWithin(wanted.width, wanted.height, ratio, room, "follow");
  if (size.width > room.width || size.height > room.height) {
    // Only reachable when the room itself is smaller than MIN_CROP — an image
    // barely bigger than the minimum. Nothing valid to move to, so don't move.
    return rect;
  }

  return {
    x: direction.x > 0 ? anchorX : anchorX - size.width,
    y: direction.y > 0 ? anchorY : anchorY - size.height,
    width: size.width,
    height: size.height,
  };
}

export function cropImage(image: SourceImage, rect: Rect): Promise<RenderResult> {
  // 1:1 from the source region: a crop trims, it doesn't rescale.
  return renderToBlob(image, {
    width: rect.width,
    height: rect.height,
    source: rect,
    type: image.type,
    quality: DEFAULT_QUALITY,
  });
}

/** photo.jpg becomes photo-crop-800x600.jpg, for the same reason resize does. */
export function croppedFileName(image: SourceImage, rect: Rect): string {
  const base = image.name.replace(/\.[^.]+$/, "").trim();
  const stem = base === "" ? "image" : base;
  const extension = image.type === "image/jpeg" ? "jpg" : image.type.replace("image/", "");

  return `${stem}-crop-${rect.width}x${rect.height}.${extension}`;
}

/* --------------------------------------------------------------- arithmetic */

/**
 * A whole-pixel size at the given ratio, fitting inside `bounds` and at least
 * MIN_CROP on both sides.
 *
 * Width is the one axis rounded freely; height is always derived from it, so a
 * 1:1 crop is exactly square and a 4:3 crop is exactly 4:3 wherever the
 * rounding falls.
 *
 * `reconcile` settles what happens when the two dimensions asked for don't
 * match the ratio, which they never do. "follow" takes the larger of the two,
 * because a corner dragged mostly sideways should widen the box rather than
 * track the smaller vertical part of the same gesture. "inscribe" takes the
 * smaller, so a size arrived at some other way is trimmed to shape instead of
 * being grown past what was asked for.
 */
function sizeWithin(
  width: number,
  height: number,
  ratio: number | null,
  bounds: Dimensions,
  reconcile: "follow" | "inscribe",
): Dimensions {
  const limit = {
    width: Math.max(1, Math.floor(bounds.width)),
    height: Math.max(1, Math.floor(bounds.height)),
  };

  if (ratio === null) {
    return {
      width: clamp(Math.round(width), Math.min(MIN_CROP, limit.width), limit.width),
      height: clamp(Math.round(height), Math.min(MIN_CROP, limit.height), limit.height),
    };
  }

  const driven =
    reconcile === "follow" ? Math.max(width, height * ratio) : Math.min(width, height * ratio);

  // Then the ratio's own ceiling: how wide this shape can be before its height
  // runs out of room.
  const widest = Math.min(limit.width, Math.floor(limit.height * ratio));
  const narrowest = Math.max(MIN_CROP, Math.ceil(MIN_CROP * ratio));

  if (widest < narrowest) {
    // The bounds can't hold a minimum-size box of this shape at all. Report the
    // smallest one anyway; resizeCrop treats an oversized result as a no-op.
    return { width: narrowest, height: Math.max(1, Math.round(narrowest / ratio)) };
  }

  const finalWidth = clamp(Math.round(driven), narrowest, widest);

  return { width: finalWidth, height: Math.max(1, Math.round(finalWidth / ratio)) };
}

/** Centres a size in the image, then clamps — the size always survives. */
function centre(size: Dimensions, image: Dimensions): Rect {
  return clampToImage(
    {
      x: Math.round(image.width / 2 - size.width / 2),
      y: Math.round(image.height / 2 - size.height / 2),
      ...size,
    },
    image,
  );
}

/**
 * Slides a rectangle back inside the image without changing its size, so a
 * ratio box can't be squared off by bumping into an edge. The size is trimmed
 * only if it's larger than the image itself.
 */
function clampToImage(rect: Rect, image: Dimensions): Rect {
  const width = clamp(Math.round(rect.width), 1, Math.floor(image.width));
  const height = clamp(Math.round(rect.height), 1, Math.floor(image.height));

  return {
    x: clamp(Math.round(rect.x), 0, Math.floor(image.width) - width),
    y: clamp(Math.round(rect.y), 0, Math.floor(image.height) - height),
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
