/**
 * QR encoding for the QR Code Generator tool. Text and a size in, PNG data URL
 * out — the same split as lib/json-formatter.ts, so the UI layer stays a thin
 * wrapper and nothing outside this file touches the qrcode API.
 *
 * The one thing that isn't pure is the encode itself: qrcode's browser build
 * renders through a canvas, so generateQrPng only works client-side. It returns
 * a result union rather than throwing, so the caller handles "too much data"
 * the same way it handles everything else.
 */

import { toDataURL } from "qrcode";

export type QrSize = "small" | "medium" | "large";

/** Edge length of the rendered PNG, in pixels. */
export const QR_PIXELS: Record<QrSize, number> = {
  small: 200,
  medium: 400,
  large: 600,
};

export const QR_SIZES: Array<{ size: QrSize; label: string }> = [
  { size: "small", label: "Small" },
  { size: "medium", label: "Medium" },
  { size: "large", label: "Large" },
];

export const DEFAULT_QR_SIZE: QrSize = "medium";

/**
 * Palette ink on palette surface, so the code matches the card it sits in
 * rather than arriving as a stark black-on-white rectangle. It clears 12:1,
 * far past what a scanner needs to separate the two.
 */
const COLORS = { dark: "#2C2C2A", light: "#F7F6F1" };

/** Modules of quiet zone around the symbol — four is the spec minimum. */
const MARGIN = 4;

export type QrResult = { ok: true; dataUrl: string } | { ok: false; error: string };

export async function generateQrPng(text: string, size: QrSize): Promise<QrResult> {
  try {
    const dataUrl = await toDataURL(text, {
      width: QR_PIXELS[size],
      margin: MARGIN,
      // Medium recovers ~15% of a damaged symbol; the levels above it cost
      // capacity, and these codes are read off a screen or fresh print.
      errorCorrectionLevel: "M",
      color: COLORS,
    });
    return { ok: true, dataUrl };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // The only failure a person can actually hit: past version 40 there is no
  // larger symbol to fall back to, and the library's wording doesn't say so.
  if (/amount of data is too big/i.test(message)) {
    return "That's more than a QR code can hold — trim the text and try again.";
  }

  return message === "" ? "Couldn't encode that text as a QR code." : message;
}

/** Longest slug taken from the encoded text, before the extension. */
const FILENAME_MAX_CHARS = 40;

/**
 * Names the download after what it encodes, so a folder of them stays
 * tellable apart: https://kaamvo.com/tools becomes qr-kaamvo-com-tools.png.
 * Text that leaves nothing usable — emoji, CJK, punctuation — falls back to a
 * plain qr-code.png rather than a bare or dash-only name.
 */
export function qrFileName(text: string): string {
  const slug = text
    // A leading scheme is noise in a filename; every URL would start "https-".
    .replace(/^[a-z][a-z\d+.-]*:\/\//i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, FILENAME_MAX_CHARS)
    // Trims both the edges and whatever dash the slice landed on.
    .replace(/^-+|-+$/g, "");

  return slug === "" ? "qr-code.png" : `qr-${slug}.png`;
}
