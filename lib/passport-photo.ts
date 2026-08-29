/**
 * Print geometry for the Passport Photo tool. A preset in millimetres and a
 * source image in pixels go in, a source rectangle comes out — the same split as
 * lib/image-crop.ts, and for the same reason: whether a 35 × 45 mm photo comes
 * out as exactly 413 × 531 pixels is arithmetic, and arithmetic is the part you
 * can actually be sure about.
 *
 * Everything is anchored to 300 DPI, which is the resolution a photo lab and
 * every passport office guideline assume. The output size is fixed by the preset
 * rather than by the source, so a phone photo and a scan of a print both come
 * out at the same physical size.
 *
 * The one trick worth knowing: both fit modes are expressed as a *source*
 * rectangle rather than as a draw position. Filling means a rectangle inside the
 * image; fitting means one larger than it, whose overhang has no pixels behind
 * it. Canvas clips an out-of-bounds source region and scales what's left into
 * the right part of the destination, and renderToBlob has already painted the
 * canvas white for JPEG — so the white border falls out of the same code path
 * that does the crop, with nothing special for it.
 */

import { renderToBlob, suffixedFileName } from "./image-canvas";
import type { Dimensions, Rect, RenderResult, SourceImage } from "./image-canvas";

export type { Rect };

/** Print resolution everything here is computed at. */
export const DPI = 300;

/** Photos are printed and then handed over, so JPEG at near-max quality. */
const PHOTO_TYPE = "image/jpeg";
const PHOTO_QUALITY = 0.95;

export interface PhotoPreset {
  value: string;
  label: string;
  /** The physical size, spelled the way the issuing authority spells it. */
  hint: string;
  widthMm: number;
  heightMm: number;
}

/**
 * The four sizes people come here for. India's 35 × 45 mm is first because it's
 * the most asked for; the US passport's 2 × 2 in is 50.8 mm square, which is
 * where that number comes from.
 */
export const PRESETS: PhotoPreset[] = [
  {
    value: "india-passport",
    label: "India passport",
    hint: "35 × 45 mm",
    widthMm: 35,
    heightMm: 45,
  },
  { value: "us-passport", label: "US passport", hint: "2 × 2 in", widthMm: 50.8, heightMm: 50.8 },
  { value: "pan-card", label: "PAN card", hint: "25 × 35 mm", widthMm: 25, heightMm: 35 },
  { value: "square", label: "Square", hint: "35 × 35 mm", widthMm: 35, heightMm: 35 },
];

export const DEFAULT_PRESET = "india-passport";

export function presetFor(value: string): PhotoPreset {
  return PRESETS.find((preset) => preset.value === value) ?? PRESETS[0];
}

/**
 * "Fill" crops to the frame, which is what a passport photo wants — no borders,
 * the face as large as the frame allows. "Fit" keeps the whole image and pads
 * with white, for a photo that's already been framed and shouldn't be trimmed.
 */
export type FitMode = "fill" | "fit";

export const FIT_MODES: Array<{ value: FitMode; label: string; hint: string }> = [
  { value: "fill", label: "Fill frame", hint: "crops the edges" },
  { value: "fit", label: "Fit inside", hint: "white border" },
];

export const DEFAULT_FIT: FitMode = "fill";

/** The output size in whole pixels: millimetres at 300 DPI. */
export function targetPixels(preset: PhotoPreset): Dimensions {
  return {
    width: Math.round((preset.widthMm / 25.4) * DPI),
    height: Math.round((preset.heightMm / 25.4) * DPI),
  };
}

/**
 * The region of the source that becomes the photo, centred.
 *
 * For "fill" it's the largest rectangle of the target's shape that fits inside
 * the image. For "fit" it's the smallest one that contains the image, so it
 * hangs off two edges — those parts have no pixels behind them and come out as
 * the white the canvas was painted with. Either way the rectangle keeps the
 * target's aspect exactly, which is what stops the face being stretched.
 */
export function fitRect(image: Dimensions, target: Dimensions, mode: FitMode): Rect {
  const ratio = target.width / target.height;
  const imageRatio = image.width / image.height;

  // Wider than the frame with "fill" means the height is what runs out first;
  // with "fit" it's the width that has to be kept whole. The two modes are the
  // same comparison with the branches swapped.
  const widthLimited = mode === "fill" ? imageRatio <= ratio : imageRatio > ratio;

  const width = widthLimited ? image.width : image.height * ratio;
  const height = widthLimited ? image.width / ratio : image.height;

  return {
    x: Math.round((image.width - width) / 2),
    y: Math.round((image.height - height) / 2),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

/** One photo, at the preset's exact pixel size. */
export function renderPhoto(
  image: SourceImage,
  rect: Rect,
  target: Dimensions,
): Promise<RenderResult> {
  return renderToBlob(image, {
    width: target.width,
    height: target.height,
    source: rect,
    type: PHOTO_TYPE,
    quality: PHOTO_QUALITY,
  });
}

export function photoFileName(image: SourceImage, preset: PhotoPreset): string {
  return suffixedFileName(image.name, preset.value, PHOTO_TYPE);
}

export function sheetFileName(image: SourceImage, preset: PhotoPreset): string {
  return suffixedFileName(image.name, `${preset.value}-sheet`, PHOTO_TYPE);
}

/* --------------------------------------------------------------- print sheet */

/** A 4 × 6 inch print, the cheapest thing any lab will run off. */
const SHEET_INCHES = { short: 4, long: 6 };

/** 0.1 in of white round the outside, 0.05 in between photos to cut along. */
const SHEET_MARGIN = Math.round(0.1 * DPI);
const SHEET_GAP = Math.round(0.05 * DPI);

export interface SheetPlan {
  /** Sheet size in pixels, at DPI. */
  width: number;
  height: number;
  columns: number;
  rows: number;
  copies: number;
  /** Top-left of the grid, so it sits centred on the print. */
  offsetX: number;
  offsetY: number;
  /** How the sheet reads to a person: "4 × 6 in, 6 copies". */
  label: string;
}

/**
 * How many copies fit on a 4 × 6, and where they go. Both orientations of the
 * print are tried and the one that holds more copies wins — a 35 × 45 mm photo
 * fits six on a portrait sheet and four on a landscape one, and there's no
 * reason to make anyone think about that.
 */
export function planSheet(target: Dimensions): SheetPlan | null {
  const options = [
    { width: SHEET_INCHES.short * DPI, height: SHEET_INCHES.long * DPI },
    { width: SHEET_INCHES.long * DPI, height: SHEET_INCHES.short * DPI },
  ];

  let best: SheetPlan | null = null;

  for (const sheet of options) {
    const columns = fitCount(sheet.width, target.width);
    const rows = fitCount(sheet.height, target.height);
    const copies = columns * rows;

    if (copies === 0 || (best !== null && copies <= best.copies)) continue;

    const gridWidth = columns * target.width + (columns - 1) * SHEET_GAP;
    const gridHeight = rows * target.height + (rows - 1) * SHEET_GAP;

    best = {
      width: sheet.width,
      height: sheet.height,
      columns,
      rows,
      copies,
      offsetX: Math.round((sheet.width - gridWidth) / 2),
      offsetY: Math.round((sheet.height - gridHeight) / 2),
      label: `4 × 6 in · ${copies} ${copies === 1 ? "copy" : "copies"}`,
    };
  }

  return best;
}

function fitCount(available: number, size: number): number {
  // The gap only exists between photos, so it's added to both sides of the
  // division and then taken off the count's own share.
  return Math.max(0, Math.floor((available - SHEET_MARGIN * 2 + SHEET_GAP) / (size + SHEET_GAP)));
}

/**
 * The same photo repeated across a 4 × 6 print, with a hairline round each one
 * to cut along. This is the one function here that draws its own canvas rather
 * than going through renderToBlob — renderToBlob draws a source region once,
 * and a sheet is the same region drawn a dozen times.
 */
export async function renderSheet(
  image: SourceImage,
  rect: Rect,
  target: Dimensions,
  plan: SheetPlan,
): Promise<RenderResult> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;

    const context = canvas.getContext("2d");
    if (context === null) throw new Error("no-context");

    // The whole sheet, so the margins and any "fit" border print as paper white.
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, plan.width, plan.height);

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    for (let row = 0; row < plan.rows; row += 1) {
      for (let column = 0; column < plan.columns; column += 1) {
        const x = plan.offsetX + column * (target.width + SHEET_GAP);
        const y = plan.offsetY + row * (target.height + SHEET_GAP);

        context.drawImage(
          image.bitmap,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          x,
          y,
          target.width,
          target.height,
        );

        // A cut line rather than a border on the photo: half a pixel in, so it
        // lands on the pixel edge and stays one pixel wide.
        context.strokeStyle = "rgba(0, 0, 0, 0.25)";
        context.lineWidth = 1;
        context.strokeRect(x - 0.5, y - 0.5, target.width + 1, target.height + 1);
      }
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, PHOTO_TYPE, PHOTO_QUALITY);
    });
    if (blob === null) throw new Error("no-blob");

    return { ok: true, blob };
  } catch {
    return { ok: false, error: "Couldn't draw the print sheet — the browser wouldn't give a canvas." };
  }
}
