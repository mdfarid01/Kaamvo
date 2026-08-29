/**
 * Base64 for the Base64 Encoder tool. Text or bytes in, text or bytes out —
 * the same split as lib/json-formatter.ts, so the UI layer stays a thin wrapper
 * and nothing outside this file touches btoa or atob directly.
 *
 * Those two are the reason this file exists. btoa takes a string of code points
 * 0–255 and throws on anything above, so "café" fails and "café" encodes
 * as the wrong bytes; both sides here go through TextEncoder/TextDecoder so the
 * Base64 is of the UTF-8 bytes, which is what every other tool means by it.
 */

/**
 * Decoded bytes, plus those bytes as text when they happen to be UTF-8. `text`
 * being null isn't a failure — it means the input was a PNG or a zip, which the
 * caller offers as a download instead of putting in a box.
 */
export type DecodeResult =
  | { ok: true; bytes: Uint8Array; text: string | null }
  | { ok: false; error: string };

/**
 * Characters per btoa call. The bytes have to reach it as a string, and
 * String.fromCharCode takes them as arguments, so the whole file can't go in
 * one call — 32k at a time stays well under the argument-count limit.
 */
const CHUNK = 0x8000;

/* -------------------------------------------------------------------------- */
/* Encode                                                                     */
/* -------------------------------------------------------------------------- */

/** No result union: every string has UTF-8 bytes, and every byte encodes. */
export function encodeText(text: string): string {
  return encodeBytes(new TextEncoder().encode(text));
}

export function encodeBytes(bytes: Uint8Array): string {
  let latin1 = "";

  for (let start = 0; start < bytes.length; start += CHUNK) {
    const chunk = bytes.subarray(start, start + CHUNK);
    // Each byte becomes the code point of the same value, which is exactly the
    // string btoa is specified to take.
    latin1 += String.fromCharCode(...Array.from(chunk));
  }

  return btoa(latin1);
}

/* -------------------------------------------------------------------------- */
/* Decode                                                                     */
/* -------------------------------------------------------------------------- */

/** The standard alphabet, after the URL-safe swap below. */
const BASE64_CHARS = /^[A-Za-z0-9+/]*$/;

/**
 * Deliberately lenient about the things that are lossless to fix: line breaks
 * (every wrapped Base64 blob in an email header has them), the URL-safe -_
 * alphabet, and missing padding. It is strict about the one thing that can't be
 * fixed — a character that isn't Base64 at all — because that means the input
 * isn't what the user thinks it is.
 */
export function decodeBase64(input: string): DecodeResult {
  const cleaned = input.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (cleaned === "") return { ok: true, bytes: new Uint8Array(0), text: "" };

  const body = cleaned.replace(/=+$/, "");
  if (!BASE64_CHARS.test(body)) {
    const stray = /[^A-Za-z0-9+/]/.exec(body);
    const shown = stray === null ? "" : ` — "${stray[0]}" isn't a Base64 character`;
    return { ok: false, error: `That isn't Base64${shown}.` };
  }

  // Four characters carry three bytes, so a remainder of one is a length no
  // encoder could have produced: the input is truncated.
  if (body.length % 4 === 1) {
    return { ok: false, error: "That Base64 is cut short — it's missing at least one character." };
  }

  const padded = body + "=".repeat((4 - (body.length % 4)) % 4);

  let bytes: Uint8Array;
  try {
    const latin1 = atob(padded);
    bytes = new Uint8Array(latin1.length);
    for (let index = 0; index < latin1.length; index += 1) {
      bytes[index] = latin1.charCodeAt(index);
    }
  } catch {
    return { ok: false, error: "Couldn't decode that as Base64." };
  }

  return { ok: true, bytes, text: asUtf8(bytes) };
}

/**
 * The bytes as text, or null if they aren't UTF-8. Decoding is fatal on
 * purpose: without it invalid sequences arrive as U+FFFD, and a screen of
 * replacement characters looks like the tool mangled the input rather than
 * like the input was never text to begin with.
 */
function asUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Download names                                                             */
/* -------------------------------------------------------------------------- */

/** Keeps the original extension, so photo.png becomes photo.png.base64.txt. */
export function encodedFileName(sourceName: string | null): string {
  const base = (sourceName ?? "").trim();
  return base === "" ? "encoded.base64.txt" : `${base}.base64.txt`;
}

/**
 * Undoes encodedFileName where it can, so a round trip gets its name back
 * rather than accumulating suffixes. Anything else decodes to .bin: the bytes
 * could be any format, and guessing one in the filename would be a lie.
 */
export function decodedFileName(sourceName: string | null): string {
  const base = (sourceName ?? "").trim();
  if (base === "") return "decoded.bin";

  const unwrapped = base.replace(/\.base64\.txt$/i, "").replace(/\.(?:base64|b64|txt)$/i, "");
  return unwrapped === "" || unwrapped === base ? "decoded.bin" : unwrapped;
}
