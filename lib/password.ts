/**
 * Password generation for the Password Generator tool. Length and a set of
 * toggles in, a password and its strength out — the same split as
 * lib/qr-code.ts, so the UI layer stays a thin wrapper.
 *
 * These functions are not pure: every random choice comes from
 * crypto.getRandomValues, never Math.random. Math.random is seeded from a
 * predictable source and is documented as unsuitable for anything
 * security-related, which a password is. There is no fallback to it here on
 * purpose — a browser without Web Crypto should fail loudly rather than hand
 * back a guessable password.
 *
 * generatePassword returns a result union rather than throwing, so "no
 * character types selected" reaches the UI as a message like every other
 * recoverable state in this codebase.
 */

export type CharacterSet = "uppercase" | "lowercase" | "numbers" | "symbols";

/** Which character types the user has switched on. */
export type SetToggles = Record<CharacterSet, boolean>;

/**
 * Symbols stay inside the ASCII punctuation that password fields reliably
 * accept, and leave out the quote, backslash and backtick — those are the
 * characters that get mangled when a password is pasted through a shell or a
 * config file.
 */
export const CHARACTER_SETS: Array<{
  set: CharacterSet;
  label: string;
  /** Sample shown under the checkbox, so the set isn't a guess. */
  hint: string;
  chars: string;
}> = [
  { set: "uppercase", label: "Uppercase", hint: "A–Z", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
  { set: "lowercase", label: "Lowercase", hint: "a–z", chars: "abcdefghijklmnopqrstuvwxyz" },
  { set: "numbers", label: "Numbers", hint: "0–9", chars: "0123456789" },
  { set: "symbols", label: "Symbols", hint: "!@#$…", chars: "!@#$%^&*()-_=+[]{};:,.?/" },
];

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 64;
export const DEFAULT_LENGTH = 20;

export const DEFAULT_TOGGLES: SetToggles = {
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
};

export type StrengthLevel = "weak" | "medium" | "strong";

export interface Strength {
  level: StrengthLevel;
  /** Shannon entropy of the generating process, rounded to a whole bit. */
  bits: number;
}

export type PasswordResult =
  | { ok: true; password: string; strength: Strength }
  | { ok: false; error: string };

/**
 * Builds a password of `length` characters drawn from the selected sets, with
 * at least one character from each — see fillRequired for why that isn't left
 * to chance.
 *
 * `length` is clamped rather than rejected: a slider can't leave the range, and
 * clamping keeps the floor at MIN_LENGTH, which is comfortably above the four
 * character sets a password may have to satisfy.
 */
export function generatePassword(length: number, toggles: SetToggles): PasswordResult {
  const sets = CHARACTER_SETS.filter((entry) => toggles[entry.set]);

  if (sets.length === 0) {
    return { ok: false, error: "Pick at least one character type to generate a password." };
  }

  const pool = sets.map((entry) => entry.chars).join("");
  const size = clampLength(length);

  const chars = fillRequired(sets.map((entry) => entry.chars));
  while (chars.length < size) {
    chars.push(pickChar(pool));
  }

  shuffle(chars);

  return {
    ok: true,
    password: chars.join(""),
    strength: getStrength(size, pool.length),
  };
}

export function clampLength(length: number): number {
  // Math.round covers a non-integer arriving from anywhere but the slider.
  return Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.round(length)));
}

/**
 * Seeds the password with one character from every selected set. Drawing the
 * whole password from the combined pool would satisfy the sets only most of the
 * time — a 10-character password from all four sets is missing at least one of
 * them roughly one time in twenty, and a form that demands a symbol would
 * reject it. Seeding first and shuffling afterwards makes it certain without
 * biasing where those characters land.
 */
function fillRequired(setChars: string[]): string[] {
  return setChars.map((chars) => pickChar(chars));
}

function pickChar(chars: string): string {
  return chars[randomBelow(chars.length)];
}

/** In-place Fisher–Yates, so every ordering is equally likely. */
function shuffle(chars: string[]): void {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
}

/**
 * A uniform integer in [0, bound) from crypto.getRandomValues.
 *
 * The plain `value % bound` would skew towards the low end whenever bound isn't
 * a power of two — with a 24-symbol set that's a measurable bias in which
 * characters show up. Discarding the short tail above the last whole multiple of
 * bound removes it. The loop retries with probability under 2^-32 per draw for
 * any bound this tool uses, so it is not a practical cost.
 */
function randomBelow(bound: number): number {
  const range = 0x100000000;
  const limit = range - (range % bound);
  const scratch = new Uint32Array(1);

  let value: number;
  do {
    crypto.getRandomValues(scratch);
    value = scratch[0];
  } while (value >= limit);

  return value % bound;
}

/**
 * Strength as the entropy of the generating process — length × bits per
 * character — which is the one number that accounts for both things the user
 * controls, rather than scoring them separately.
 *
 * The cut-offs are the conventional ones: below 50 bits is inside reach of an
 * offline attack against a leaked hash, and 90 bits is past the point where
 * more length stops being the weak link.
 */
export function getStrength(length: number, poolSize: number): Strength {
  const bits = poolSize <= 1 ? 0 : Math.round(length * Math.log2(poolSize));

  if (bits < 50) return { level: "weak", bits };
  if (bits < 90) return { level: "medium", bits };
  return { level: "strong", bits };
}

export const STRENGTH_LABELS: Record<StrengthLevel, string> = {
  weak: "Weak",
  medium: "Medium",
  strong: "Strong",
};
