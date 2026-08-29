/**
 * Image → PDF for the Image to PDF tool. Files in, one PDF out — the same
 * split as lib/image-compressor.ts, so the UI layer stays a thin wrapper and
 * nothing outside this file touches pdf-lib.
 *
 * Like the QR encoder and the compressor, the work isn't pure: some images have
 * to go through a canvas to be embeddable (see needsReencoding), so loadImage
 * only runs client-side. Both entry points return a result union rather than
 * throwing, so a corrupt file is handled like any other outcome.
 *
 * Loading is split from building deliberately. A file is read and checked the
 * moment it's dropped, so the list can show its size and flag a bad file
 * straight away, and pressing the button afterwards only has to lay out pages.
 */

import { PDFDocument, degrees } from "pdf-lib";
import type { PDFImage, PDFPage } from "pdf-lib";

import { bytesToBlob } from "./utils";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png"] as const;

/** Straight into the file input's accept attribute. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(",");

/** Extensions per accepted type, for the drag-and-drop fallback below. */
const EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
};

/**
 * Embedding runs on the main thread (see imagesToPdf), so the caps keep a drop
 * from locking the tab up rather than failing. 25 MB clears any phone camera,
 * and 100 MB of input is already a PDF nobody wants to email.
 */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export type PageSizing = "image" | "a4";

export const DEFAULT_PAGE_SIZING: PageSizing = "image";

export const PAGE_SIZINGS: Array<{ value: PageSizing; label: string; hint: string }> = [
  { value: "image", label: "Fit to image", hint: "no borders" },
  { value: "a4", label: "A4", hint: "centred" },
];

type Format = "jpeg" | "png";

/** Clockwise turn that puts the stored pixels the right way up. */
type Rotation = 0 | 90 | 180 | 270;

export interface LoadedImage {
  name: string;
  size: number;
  /** Pixel size as displayed, i.e. with any EXIF rotation already applied. */
  width: number;
  height: number;
  /**
   * True when the original bytes couldn't go into a PDF as they were and had to
   * be re-encoded. Worth surfacing: for a JPEG that step is lossy.
   */
  reencoded: boolean;
  /** @internal Bytes to embed — the original file's, unless reencoded. */
  readonly data: Uint8Array;
  /** @internal */
  readonly format: Format;
  /** @internal */
  readonly rotation: Rotation;
}

export type LoadImageResult = { ok: true; image: LoadedImage } | { ok: false; error: string };

export type ImagesToPdfResult =
  | { ok: true; blob: Blob; pageCount: number }
  | { ok: false; error: string };

export function isSupportedImage(file: File): boolean {
  if (file.type !== "") return file.type in EXTENSIONS;

  // Some sources hand over a file with an empty type — a drag out of an archive
  // tool, or an unregistered extension on Linux. The name is all that's left to
  // go on; the magic bytes get the final say in loadImage.
  const extension = fileExtension(file.name);
  return Object.values(EXTENSIONS).some((list) => list.includes(extension));
}

/**
 * Reads a file, checks it, and gets its bytes into a state a PDF can carry.
 * Called once per file as it arrives rather than at build time, so the list can
 * report a problem next to the file that caused it.
 */
export async function loadImage(file: File): Promise<LoadImageResult> {
  if (!isSupportedImage(file)) {
    return { ok: false, error: `${file.name} isn't a JPG or PNG.` };
  }
  if (file.size === 0) {
    return { ok: false, error: `${file.name} is empty.` };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: `${file.name} is over 25 MB — too big to add in the browser.` };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: `Couldn't read ${file.name}.` };
  }

  // The declared type is a hint, not evidence: a PNG saved as .jpg is common
  // enough, and pdf-lib picks its parser from whichever it's handed.
  const format = detectFormat(bytes);
  if (format === null) {
    return { ok: false, error: `${file.name} isn't a JPG or PNG — the file says otherwise.` };
  }

  const facts = format === "jpeg" ? readJpeg(bytes) : readPng(bytes);
  if (facts === null) {
    return { ok: false, error: `Couldn't read ${file.name} — the header is damaged.` };
  }
  if (!endsCleanly(bytes, format)) {
    // Worth stopping for: pdf-lib embeds a half-downloaded JPEG without
    // complaint, and the page comes out grey below wherever the bytes ran out.
    return { ok: false, error: `${file.name} looks incomplete — it may not have finished saving.` };
  }

  const rotation = ROTATIONS[facts.orientation] ?? 0;

  if (!needsReencoding(facts)) {
    return {
      ok: true,
      image: {
        name: file.name,
        size: file.size,
        // Rotating swaps what the viewer ends up showing.
        width: rotation === 90 || rotation === 270 ? facts.height : facts.width,
        height: rotation === 90 || rotation === 270 ? facts.width : facts.height,
        reencoded: false,
        data: bytes,
        format,
        rotation,
      },
    };
  }

  try {
    const redone = await reencode(file, format);
    return {
      ok: true,
      image: {
        name: file.name,
        size: file.size,
        width: redone.width,
        height: redone.height,
        reencoded: true,
        data: redone.data,
        format,
        // createImageBitmap already applied the EXIF turn, so the page mustn't
        // apply it a second time.
        rotation: 0,
      },
    };
  } catch (error) {
    return { ok: false, error: describeError(error, file.name) };
  }
}

/**
 * One page per image, in the order given. Returns the finished file rather than
 * triggering a download, so the caller decides what to do with it.
 */
export async function imagesToPdf(
  images: LoadedImage[],
  sizing: PageSizing,
): Promise<ImagesToPdfResult> {
  if (images.length === 0) {
    return { ok: false, error: "Add an image first." };
  }

  try {
    const pdf = await PDFDocument.create();

    for (const image of images) {
      let embedded: PDFImage;
      try {
        embedded =
          image.format === "png" ? await pdf.embedPng(image.data) : await pdf.embedJpg(image.data);
      } catch (error) {
        // Named, because everything that gets this far passed its header check:
        // whatever is wrong here is specific to one file, and the person needs
        // to know which one to take out.
        return { ok: false, error: describeError(error, image.name) };
      }

      // The image as the viewer will see it, which is what the layout works in.
      const display =
        image.rotation === 90 || image.rotation === 270
          ? { width: embedded.height, height: embedded.width }
          : { width: embedded.width, height: embedded.height };

      const box = layout(display, sizing);
      const page = pdf.addPage([box.pageWidth, box.pageHeight]);
      drawUpright(page, embedded, box, image.rotation);
    }

    return {
      ok: true,
      blob: bytesToBlob(await pdf.save(), "application/pdf"),
      pageCount: images.length,
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/**
 * photo.jpg becomes photo.pdf. A set doesn't get named after whichever file
 * happened to be first, so it falls back to images.pdf.
 */
export function pdfFileName(names: string[]): string {
  if (names.length !== 1) return "images.pdf";

  const base = names[0].replace(/\.[^.]+$/, "").trim();
  return `${base === "" ? "image" : base}.pdf`;
}

/* ------------------------------------------------------------------ layout */

/** A4 in points. The long edge doubles as the cap on a fitted page. */
const A4_SHORT = 595.28;
const A4_LONG = 841.89;

/** ~6 mm, enough that an A4 page doesn't print with the image bleeding off. */
const A4_MARGIN = 18;

/** A CSS pixel is 1/96 in and a PDF unit 1/72 in. */
const PIXEL_POINTS = 72 / 96;

interface Box {
  pageWidth: number;
  pageHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function layout(display: { width: number; height: number }, sizing: PageSizing): Box {
  if (sizing === "a4") {
    // The page turns to match the image instead of forcing a landscape photo
    // into portrait with a bar above and below it.
    const portrait = display.height >= display.width;
    const pageWidth = portrait ? A4_SHORT : A4_LONG;
    const pageHeight = portrait ? A4_LONG : A4_SHORT;
    const scale = Math.min(
      (pageWidth - A4_MARGIN * 2) / display.width,
      (pageHeight - A4_MARGIN * 2) / display.height,
    );
    const width = display.width * scale;
    const height = display.height * scale;

    return {
      pageWidth,
      pageHeight,
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
    };
  }

  // Pixels at 96 dpi, then scaled down until the long edge fits A4's, so a
  // screenshot keeps its size and a 6000px photo still lands on a printable
  // page instead of one three feet wide. Never scaled up: a small image on a
  // small page is honest about what it is.
  const scale = Math.min(1, A4_LONG / (Math.max(display.width, display.height) * PIXEL_POINTS));
  const width = display.width * PIXEL_POINTS * scale;
  const height = display.height * PIXEL_POINTS * scale;

  return { pageWidth: width, pageHeight: height, x: 0, y: 0, width, height };
}

/**
 * Fills the box with the image, the right way up. PDF has no notion of EXIF, so
 * a rotation has to happen here — as a transform on the way in, which costs
 * nothing and keeps the original JPEG bytes, rather than as a re-encode.
 *
 * pdf-lib turns counter-clockwise about (x, y), and the corner the box is
 * anchored from moves with the turn.
 */
function drawUpright(page: PDFPage, image: PDFImage, box: Box, rotation: Rotation): void {
  const { x, y, width, height } = box;

  if (rotation === 90) {
    page.drawImage(image, { x, y: y + height, width: height, height: width, rotate: degrees(-90) });
    return;
  }
  if (rotation === 180) {
    page.drawImage(image, { x: x + width, y: y + height, width, height, rotate: degrees(180) });
    return;
  }
  if (rotation === 270) {
    page.drawImage(image, { x: x + width, y, width: height, height: width, rotate: degrees(90) });
    return;
  }

  page.drawImage(image, { x, y, width, height });
}

/* ------------------------------------------------------- reading the bytes */

interface ImageFacts {
  width: number;
  height: number;
  /** EXIF orientation, 1 when there isn't one. */
  orientation: number;
  /** JPEG coding modes that DCTDecode doesn't define. */
  progressive?: boolean;
  arithmetic?: boolean;
}

/**
 * Which images can't be handed to pdf-lib as they are. Deliberately a short
 * list: re-encoding a JPEG loses detail, so it has to be worth it.
 *
 * - Mirrored EXIF orientations. A flip isn't a rotation, so no page transform
 *   undoes it, and the alternative is a PDF showing a mirror image. The other
 *   four orientations are turns, which drawUpright does for free.
 * - Progressive and arithmetic JPEGs. Both parse and embed, and both render
 *   correctly in the two renderers checked here (Quartz and pdfium), so this is
 *   conformance rather than a fix for an observed failure: a PDF image stream is
 *   baseline or extended sequential DCT (PDF 32000-1 §7.4.8), and a converter
 *   shouldn't be the thing that writes a file outside the format.
 *
 * Everything else embeds byte-for-byte, which is faster and lossless. CMYK
 * JPEGs and 16-bit, palette, greyscale and alpha PNGs were all checked by
 * rendering the image on its own and then inside a PDF with the same renderer:
 * identical both ways, including a CMYK file with its Adobe marker stripped.
 */
function needsReencoding(facts: ImageFacts): boolean {
  if (MIRRORED.has(facts.orientation)) return true;
  return facts.progressive === true || facts.arithmetic === true;
}

const MIRRORED = new Set([2, 4, 5, 7]);

/** The turns that a page transform can express, by EXIF orientation. */
const ROTATIONS: Record<number, Rotation> = { 1: 0, 3: 180, 6: 90, 8: 270 };

/** High enough that the re-encode isn't what anyone notices about the page. */
const REENCODE_QUALITY = 0.92;

/**
 * Redraws an image through a canvas to get bytes a PDF can carry, with EXIF
 * applied by the decoder. PNG stays PNG so nothing is lost; a JPEG has to be
 * re-compressed, which is the price of arriving in a shape PDF doesn't define.
 */
async function reencode(
  file: Blob,
  format: Format,
): Promise<{ data: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d");
    if (context === null) throw new Error("no-context");
    context.drawImage(bitmap, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, format === "png" ? "image/png" : "image/jpeg", REENCODE_QUALITY);
    });
    if (blob === null) throw new Error("no-blob");

    return {
      data: new Uint8Array(await blob.arrayBuffer()),
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}

function detectFormat(bytes: Uint8Array): Format | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";

  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }

  return null;
}

/**
 * A JPEG ends with an EOI marker and a PNG with an IEND chunk, so a file that
 * has neither stopped early. Some cameras append data after EOI, hence the
 * window rather than an exact check on the last two bytes.
 */
const TRAILER_WINDOW = 512;

function endsCleanly(bytes: Uint8Array, format: Format): boolean {
  const from = Math.max(0, bytes.length - TRAILER_WINDOW);

  if (format === "jpeg") {
    for (let i = bytes.length - 2; i >= from; i--) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return true;
    }
    return false;
  }

  // IEND is required to be the last chunk, so a short window is enough.
  for (let i = bytes.length - 4; i >= Math.max(0, bytes.length - 16); i--) {
    if (bytes[i] === 0x49 && bytes[i + 1] === 0x45 && bytes[i + 2] === 0x4e && bytes[i + 3] === 0x44)
      return true;
  }
  return false;
}

/** Progressive and arithmetic-coded SOF markers. */
const PROGRESSIVE_SOF = new Set([0xc2, 0xc6, 0xca, 0xce]);
const ARITHMETIC_SOF = new Set([0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
/** In the 0xC0–0xCF block but not frame headers. */
const NOT_SOF = new Set([0xc4, 0xc8, 0xcc]);

/**
 * Walks the JPEG segment chain as far as the first scan, which is past
 * everything worth knowing: the frame header has the size and colour channels,
 * and APP1 has the orientation.
 */
function readJpeg(bytes: Uint8Array): ImageFacts | null {
  let position = 2;
  let facts: ImageFacts | null = null;
  let orientation = 1;

  while (position + 3 < bytes.length) {
    if (bytes[position] !== 0xff) break;

    // Any number of 0xFF bytes may pad the front of a marker.
    let marker = bytes[position + 1];
    while (marker === 0xff && position + 2 < bytes.length) {
      position += 1;
      marker = bytes[position + 1];
    }
    position += 2;

    // Markers that stand alone, with no segment behind them.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    // Start of scan, or end of image: nothing left to read.
    if (marker === 0xda || marker === 0xd9) break;

    const length = (bytes[position] << 8) | bytes[position + 1];
    if (length < 2) return null;

    const body = position + 2;
    const end = position + length;
    if (end > bytes.length) return null;

    if (marker >= 0xc0 && marker <= 0xcf && !NOT_SOF.has(marker)) {
      if (end - body < 5) return null;
      facts = {
        height: (bytes[body + 1] << 8) | bytes[body + 2],
        width: (bytes[body + 3] << 8) | bytes[body + 4],
        progressive: PROGRESSIVE_SOF.has(marker),
        arithmetic: ARITHMETIC_SOF.has(marker),
        orientation: 1,
      };
    } else if (marker === 0xe1) {
      orientation = readExifOrientation(bytes, body, end) ?? orientation;
    }

    position = end;
  }

  if (facts === null || facts.width === 0 || facts.height === 0) return null;
  return { ...facts, orientation };
}

/** "Exif\0\0", which is what separates an EXIF APP1 from an XMP one. */
const EXIF_SIGNATURE = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

const ORIENTATION_TAG = 0x0112;

function readExifOrientation(bytes: Uint8Array, start: number, end: number): number | null {
  if (end - start < 14) return null;
  for (let i = 0; i < EXIF_SIGNATURE.length; i++) {
    if (bytes[start + i] !== EXIF_SIGNATURE[i]) return null;
  }

  // A TIFF header, which sets the byte order for everything after it.
  const tiff = start + 6;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
  if (!little && !big) return null;

  const u16 = (at: number) =>
    little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1];
  const u32 = (at: number) =>
    little
      ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
      : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

  if (u16(tiff + 2) !== 42) return null;

  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return null;

  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (u16(entry) !== ORIENTATION_TAG) continue;

    // A SHORT sits in the first two bytes of the value field.
    const value = u16(entry + 8);
    return value >= 1 && value <= 8 ? value : null;
  }

  return null;
}

/**
 * IHDR is required to be the first chunk, so the size sits at a fixed offset.
 * Nothing else is needed: PNG carries no orientation, and every colour type and
 * bit depth embeds correctly (see needsReencoding).
 */
function readPng(bytes: Uint8Array): ImageFacts | null {
  if (bytes.length < 29) return null;
  if (
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52 // "IHDR"
  ) {
    return null;
  }

  const u32 = (at: number) =>
    ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

  const width = u32(16);
  const height = u32(20);
  if (width === 0 || height === 0) return null;

  return { width, height, orientation: 1 };
}

const UNREADABLE = "it may be corrupt or in a format this browser can't decode";

/**
 * pdf-lib's PNG decoder throws bare strings rather than Errors, so there's
 * often no message to read — stringifying one puts "undefined" in front of the
 * user. The failure people actually hit is a file that claims to be an image
 * but won't decode, so that's what an unrecognised throw is reported as.
 */
function describeError(error: unknown, name?: string): string {
  const subject = name === undefined ? "that image" : name;

  if (!(error instanceof Error)) return `Couldn't read ${subject} — ${UNREADABLE}.`;
  if (error.message === "no-context" || error.message === "no-blob") {
    return `Couldn't redraw ${subject} — the browser wouldn't give up a canvas.`;
  }
  if (/decode|image|load/i.test(error.message)) return `Couldn't read ${subject} — ${UNREADABLE}.`;

  return error.message === "" ? `Couldn't add ${subject} to the PDF.` : error.message;
}

function fileExtension(name: string): string {
  const match = /\.([^.]+)$/.exec(name);
  return match ? match[1].toLowerCase() : "";
}
