/**
 * The canvas plumbing behind Resize, Crop and Convert Image. All three do the
 * same two things around their own bit of arithmetic: get a dropped File into
 * something drawable, and put a rectangle of it back out as encoded bytes. That
 * pair lives here, so lib/image-resize.ts and its two siblings are left holding
 * only geometry and naming.
 *
 * Like lib/image-compressor.ts, none of this is pure — it decodes and encodes
 * through the browser's own codecs, so it only runs client-side — and every
 * entry point returns a result union rather than throwing, so a corrupt file is
 * handled like any other outcome.
 *
 * Decoding is split from rendering deliberately. A file is decoded once when
 * it's dropped, which is what makes the dimensions available to show straight
 * away, and every later render — a slider drag, a crop handle, a format change
 * — draws that one bitmap again rather than re-reading the file.
 */

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Straight into the file input's accept attribute. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(",");

/**
 * Extensions per type, for the drag-and-drop fallback below and for naming
 * downloads. JPEG has two in the wild; the first is what we write. AVIF is here
 * as an output only — see AVIF_TYPE.
 */
const EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
};

/**
 * Decoding and encoding run on the main thread, so an oversized file would lock
 * the tab up rather than fail. 25 MB clears any phone camera — the same cap the
 * compressor and Image to PDF use.
 */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/**
 * Chrome refuses a canvas over ~268 million pixels and returns a blank one, so
 * a cap has to exist somewhere. This one is well under that and still holds a
 * 6000 × 6000 image; past it the render is reported as too large rather than
 * silently coming out empty.
 */
export const MAX_OUTPUT_PIXELS = 40_000_000;

/**
 * High enough that the re-encode isn't the thing anyone notices, matching the
 * quality Image to PDF re-encodes at. Resize and Crop don't offer a quality
 * control — that's the compressor's job — so they need a sensible constant.
 */
export const DEFAULT_QUALITY = 0.92;

export interface SourceImage {
  name: string;
  size: number;
  /**
   * Canonical type of the *input*, resolved from the file's own type or its
   * extension — so it's one of ACCEPTED_TYPES, never the empty string a file
   * dragged out of an archive arrives with.
   */
  type: string;
  /** Pixel size as displayed, i.e. with any EXIF rotation already applied. */
  width: number;
  height: number;
  /** @internal What every render draws from. Closed by releaseSourceImage. */
  readonly bitmap: ImageBitmap;
}

export type LoadResult = { ok: true; image: SourceImage } | { ok: false; error: string };

export type RenderResult = { ok: true; blob: Blob } | { ok: false; error: string };

/** A pixel size, with no position — an output size, or an image's own. */
export interface Dimensions {
  width: number;
  height: number;
}

/** A region of the source image, in image pixels. */
export interface Rect extends Dimensions {
  x: number;
  y: number;
}

export interface RenderOptions {
  /** Output size in pixels. The source region is scaled to fill it. */
  width: number;
  height: number;
  /** Region to take from the source. Defaults to the whole image. */
  source?: Rect;
  type: string;
  /** Ignored by PNG, which is lossless. */
  quality?: number;
}

export function isSupportedImage(file: File): boolean {
  return resolveType(file) !== null;
}

/**
 * Reads and decodes a file. Called once as it arrives rather than at render
 * time, so a problem is reported next to the file that caused it and the tool
 * can show what it's holding.
 */
export async function loadSourceImage(file: File): Promise<LoadResult> {
  const type = resolveType(file);
  if (type === null) {
    return { ok: false, error: `${file.name} isn't a JPG, PNG or WebP.` };
  }
  if (file.size === 0) {
    return { ok: false, error: `${file.name} is empty.` };
  }
  if (file.size > MAX_INPUT_BYTES) {
    return { ok: false, error: "That file is over 25 MB — too big to work on in the browser." };
  }

  try {
    // from-image applies the EXIF turn while decoding, so a phone photo is
    // upright everywhere downstream: the dimensions shown, the crop box drawn
    // over the preview, and the pixels written out all agree.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    if (bitmap.width === 0 || bitmap.height === 0) {
      bitmap.close();
      return { ok: false, error: `Couldn't read ${file.name} — it has no dimensions.` };
    }

    return {
      ok: true,
      image: {
        name: file.name,
        size: file.size,
        type,
        width: bitmap.width,
        height: bitmap.height,
        bitmap,
      },
    };
  } catch (error) {
    return { ok: false, error: describeError(error, file.name) };
  }
}

/**
 * Frees the decoded pixels. An ImageBitmap holds its buffer until it's closed,
 * so a tool that lets you drop file after file would keep every one of them.
 */
export function releaseSourceImage(image: SourceImage | null): void {
  // A bitmap that's already closed throws nothing on a second close, but a
  // bitmap being drawn from does — which is why callers close on replacement,
  // never mid-render.
  image?.bitmap.close();
}

/**
 * Draws a region of the source at a given output size and encodes it. The one
 * place in these three tools that touches a canvas.
 */
export async function renderToBlob(
  image: SourceImage,
  options: RenderOptions,
): Promise<RenderResult> {
  const width = Math.round(options.width);
  const height = Math.round(options.height);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return { ok: false, error: "Width and height both have to be at least 1 pixel." };
  }
  if (width * height > MAX_OUTPUT_PIXELS) {
    return {
      ok: false,
      error: `${width} × ${height} is too large to draw in the browser — try under 40 megapixels.`,
    };
  }

  const source = options.source ?? { x: 0, y: 0, width: image.width, height: image.height };

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (context === null) throw new Error("no-context");

    // JPEG has no alpha channel, and an unpainted canvas is transparent black:
    // handed to the JPEG encoder, every see-through pixel of a PNG comes out
    // black. White is what a viewer would have shown behind it anyway.
    if (!hasAlpha(options.type)) {
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, width, height);
    }

    // Matters when shrinking, which is most of what Resize does: without it the
    // browser is free to point-sample and hair and text come out speckled.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(
      image.bitmap,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      width,
      height,
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, options.type, options.quality);
    });
    if (blob === null) throw new Error("no-blob");

    // A browser that can't encode the type asked for doesn't say so: toBlob
    // falls back to PNG and hands it over with a straight face. Without this
    // check a "convert to AVIF" would download a .avif full of PNG bytes.
    if (blob.type !== options.type) {
      return { ok: false, error: `This browser can't write ${formatLabel(options.type)} files.` };
    }

    return { ok: true, blob };
  } catch (error) {
    return { ok: false, error: describeError(error, image.name) };
  }
}

/**
 * Whether this browser can encode a type, by asking it to. There is no feature
 * flag to read, and the only honest test is a real encode — a 1 × 1 one, which
 * is quick enough to run for every format a tool offers.
 */
const encodable = new Map<string, Promise<boolean>>();

export function canEncode(type: string): Promise<boolean> {
  const cached = encodable.get(type);
  if (cached !== undefined) return cached;

  const probe = (async () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, type);
      });
      return blob !== null && blob.type === type;
    } catch {
      return false;
    }
  })();

  encodable.set(type, probe);
  return probe;
}

/** PNG, WebP and AVIF carry transparency; JPEG doesn't. */
export function hasAlpha(type: string): boolean {
  return type !== "image/jpeg";
}

export function extensionFor(type: string): string {
  return EXTENSIONS[type]?.[0] ?? "png";
}

/**
 * How a format is written on a button or in a sentence — the format's own name
 * rather than its extension upper-cased, which would give "WEBP".
 */
const LABELS: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/avif": "AVIF",
};

export function formatLabel(type: string): string {
  return LABELS[type] ?? extensionFor(type).toUpperCase();
}

/**
 * photo.png becomes photo-800x600.jpg. The suffix keeps a download from
 * overwriting the original sitting in the same folder, and the extension is
 * rewritten from the output type rather than kept, since these tools can change
 * the format underneath it.
 */
export function suffixedFileName(name: string, suffix: string, type: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim();
  const stem = base === "" ? "image" : base;

  return `${stem}${suffix === "" ? "" : `-${suffix}`}.${extensionFor(type)}`;
}

/** The canonical type of a file, or null if it isn't one these tools take. */
function resolveType(file: File): string | null {
  if (file.type !== "") {
    return (ACCEPTED_TYPES as readonly string[]).includes(file.type) ? file.type : null;
  }

  // Some sources hand over a file with an empty type — a drag out of an archive
  // tool, or an unregistered extension on Linux. The name is all that's left to
  // go on; createImageBitmap gets the final say.
  const extension = fileExtension(file.name);
  const match = ACCEPTED_TYPES.find((type) => EXTENSIONS[type].includes(extension));

  return match ?? null;
}

const UNREADABLE = "it may be corrupt or in a format this browser can't decode";

/**
 * The failure people actually hit is a file that claims to be an image but
 * won't decode: truncated, renamed, or a format this browser doesn't ship.
 * createImageBitmap rejects that with a bare DOMException whose message is
 * often empty, so an unrecognised throw is reported as exactly that.
 */
function describeError(error: unknown, name: string): string {
  if (error instanceof Error) {
    if (error.message === "no-context" || error.message === "no-blob") {
      return `Couldn't redraw ${name} — the browser wouldn't give up a canvas.`;
    }
    if (error.message !== "" && !/decode|image|source|load/i.test(error.message)) {
      return error.message;
    }
  }

  return `Couldn't read ${name} — ${UNREADABLE}.`;
}

function fileExtension(name: string): string {
  const match = /\.([^.]+)$/.exec(name);
  return match ? match[1].toLowerCase() : "";
}
