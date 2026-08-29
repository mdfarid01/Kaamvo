/**
 * Image compression for the Image Compressor tool. A file and a quality in, a
 * smaller file out — the same split as lib/qr-code.ts, so the UI layer stays a
 * thin wrapper and nothing outside this file touches browser-image-compression.
 *
 * Like the QR encoder, the work itself isn't pure: it re-encodes through a
 * canvas, so compress() only runs client-side. It returns a result union rather
 * than throwing, so the caller handles a decode failure the same way it handles
 * everything else.
 */

import imageCompression from "browser-image-compression";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Straight into the file input's accept attribute. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(",");

/**
 * Extensions per accepted type, for both the drag-and-drop fallback below and
 * naming the download. JPEG has two in the wild; the first is what we write.
 */
const EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

/** Quality as whole percent, which is what the slider shows. */
export const MIN_QUALITY = 10;
export const MAX_QUALITY = 100;
export const QUALITY_STEP = 5;

/**
 * Where a photo loses most of its bytes and little that's visible. High enough
 * that the first result someone sees is one they'd actually keep.
 */
export const DEFAULT_QUALITY = 70;

/**
 * Encoding runs on the main thread (see compress below), so an oversized file
 * would lock the tab up rather than fail. 25 MB clears any phone camera.
 */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export interface CompressedImage {
  /**
   * The bytes to download. Re-encoding can come out *larger* — an already
   * optimized PNG, mostly — and a compressor should never hand back a bigger
   * file than it was given, so this falls back to the original when that
   * happens. `reduced` says which one you're holding.
   */
  file: File;
  originalSize: number;
  /** What the encoder produced, reported honestly even when it's the larger of the two. */
  compressedSize: number;
  reduced: boolean;
}

export type CompressResult = { ok: true; image: CompressedImage } | { ok: false; error: string };

export function isSupportedImage(file: File): boolean {
  if (file.type !== "") return file.type in EXTENSIONS;

  // Some sources hand over a file with an empty type — a drag out of an
  // archive tool, or an unregistered extension on Linux. The name is all
  // that's left to go on.
  const extension = fileExtension(file.name);
  return Object.values(EXTENSIONS).some((list) => list.includes(extension));
}

export async function compress(file: File, quality: number): Promise<CompressResult> {
  if (!isSupportedImage(file)) {
    return { ok: false, error: `${file.name} isn't a JPG, PNG or WebP.` };
  }
  if (file.size > MAX_INPUT_BYTES) {
    return { ok: false, error: "That file is over 25 MB — too big to compress in the browser." };
  }

  try {
    const output = await imageCompression(file, {
      initialQuality: clampQuality(quality) / 100,
      // maxSizeMB is left at its default of Infinity: the slider is the only
      // control here, so the library encodes once at that quality instead of
      // iterating downwards towards a target size.
      //
      // The worker path is off deliberately. browser-image-compression's
      // worker build importScripts() itself from cdn.jsdelivr.net at run time,
      // so a tool that promises to stay on your device would quietly call out
      // to a third party — and stop working offline. Encoding on the main
      // thread keeps that promise, and MAX_INPUT_BYTES keeps it quick.
      useWebWorker: false,
      // Quality is the only lever the UI offers, so nothing gets downscaled
      // behind the user's back to hit a size.
      alwaysKeepResolution: true,
    });

    const reduced = output.size < file.size;
    return {
      ok: true,
      image: {
        file: reduced ? output : file,
        originalSize: file.size,
        compressedSize: output.size,
        reduced,
      },
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

const UNREADABLE = "Couldn't read that image — it may be corrupt or in an unsupported format.";

function describeError(error: unknown): string {
  // The failure a person actually hits is a file that claims to be an image but
  // won't decode: truncated, renamed, or a format this browser doesn't ship.
  // browser-image-compression rejects that case with the <img> element's error
  // Event rather than an Error, so there's no message to read — stringifying it
  // puts "[object Event]" in front of the user.
  if (!(error instanceof Error)) return UNREADABLE;
  if (/load|decode|image/i.test(error.message)) return UNREADABLE;

  return error.message === "" ? "Couldn't compress that image." : error.message;
}

export function clampQuality(quality: number): number {
  if (!Number.isFinite(quality)) return DEFAULT_QUALITY;
  return Math.min(Math.max(Math.round(quality), MIN_QUALITY), MAX_QUALITY);
}

/**
 * Whole percent saved, floored so it never rounds a 0.4% saving up to 1% and
 * oversells the result. Negative when re-encoding grew the file.
 */
export function savingsPercent(originalSize: number, compressedSize: number): number {
  if (originalSize === 0) return 0;
  return Math.floor(((originalSize - compressedSize) / originalSize) * 100);
}

/**
 * photo.jpg becomes photo-compressed.jpg, so a download can't overwrite the
 * original sitting in the same folder. The extension is rewritten from the
 * type rather than kept, since a .jpeg in gets a canonical .jpg out.
 */
export function compressedFileName(name: string, type: string): string {
  const extension = EXTENSIONS[type]?.[0] || fileExtension(name) || "jpg";
  const base = name.replace(/\.[^.]+$/, "").trim();

  return `${base === "" ? "image" : base}-compressed.${extension}`;
}

function fileExtension(name: string): string {
  const match = /\.([^.]+)$/.exec(name);
  return match ? match[1].toLowerCase() : "";
}
