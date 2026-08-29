/**
 * Digests for the Hash Generator tool. Bytes in, hex out — the same split as
 * lib/json-formatter.ts, so the UI layer stays a thin wrapper and nothing
 * outside this file touches crypto.subtle.
 *
 * All three algorithms come from the browser's own Web Crypto, so there's no
 * hashing code here to get wrong. What is here is the result union: subtle is
 * only defined in a secure context, which is a real thing to hit and worth a
 * sentence rather than a thrown TypeError.
 *
 * MD5 is a search keyword for this tool but not an option in it — Web Crypto
 * deliberately omits broken algorithms, and shipping a hand-rolled MD5 to
 * match a keyword isn't worth the bytes.
 */

export const HASH_ALGORITHMS = ["SHA-1", "SHA-256", "SHA-512"] as const;

export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

/** Lowercase hex digest per algorithm — the form every checksum tool prints. */
export type Digests = Record<HashAlgorithm, string>;

export type HashResult = { ok: true; digests: Digests } | { ok: false; error: string };

/** Bit length of each digest, for labelling the rows. */
export const DIGEST_BITS: Record<HashAlgorithm, number> = {
  "SHA-1": 160,
  "SHA-256": 256,
  "SHA-512": 512,
};

/**
 * All three digests of the same bytes, computed together: the input is already
 * in memory and hashing it three times costs less than making someone pick.
 */
export async function hashBytes(data: BufferSource): Promise<HashResult> {
  if (typeof crypto === "undefined" || crypto.subtle === undefined) {
    return {
      ok: false,
      error: "This browser doesn't expose Web Crypto here — it needs an https:// or localhost page.",
    };
  }

  try {
    const digests = await Promise.all(
      HASH_ALGORITHMS.map((algorithm) => crypto.subtle.digest(algorithm, data)),
    );

    const entries = HASH_ALGORITHMS.map(
      (algorithm, index) => [algorithm, toHex(digests[index])] as const,
    );

    return { ok: true, digests: Object.fromEntries(entries) as Digests };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message === "" ? "Couldn't hash that input." : message };
  }
}

export async function hashText(text: string): Promise<HashResult> {
  // UTF-8, which is what every other tool means by the bytes of a string —
  // hashing UTF-16 code units would disagree with `shasum` on any non-ASCII
  // input, and silently agree on ASCII, which is the worst of both.
  return hashBytes(new TextEncoder().encode(text));
}

const HEX = "0123456789abcdef";

/**
 * Indexed off a lookup string rather than toString(16).padStart — a digest is
 * at most 64 bytes, so this is about being obviously allocation-free, not fast.
 */
export function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";

  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    hex += HEX[byte >> 4] + HEX[byte & 0x0f];
  }

  return hex;
}
