/**
 * Pure JSON transforms for the JSON Formatter tool. Strings in, strings out —
 * same split as lib/text-formatter.ts, so the UI layer stays a thin wrapper.
 *
 * Parsing is left to native JSON.parse; the extra machinery here exists only to
 * turn its SyntaxError into something a person can act on, since the engines
 * disagree wildly about what a parse error message looks like.
 */

export const INDENT_SPACES = 2;

export interface JsonError {
  /** Why it failed, with the engine-specific position suffix stripped off. */
  reason: string;
  /** 1-based, or null when the failure couldn't be pinned to a spot. */
  line: number | null;
  column: number | null;
  /** The offending source line with a caret line under the column. */
  excerpt: string | null;
}

export type JsonResult = { ok: true; text: string } | { ok: false; error: JsonError };

export function formatJson(input: string): JsonResult {
  return transform(input, (value) => JSON.stringify(value, null, INDENT_SPACES));
}

export function minifyJson(input: string): JsonResult {
  return transform(input, (value) => JSON.stringify(value));
}

function transform(input: string, render: (value: unknown) => string): JsonResult {
  try {
    return { ok: true, text: render(JSON.parse(input)) };
  } catch (error) {
    return { ok: false, error: describeError(input, error) };
  }
}

/* -------------------------------------------------------------------------- */
/* Error description                                                          */
/* -------------------------------------------------------------------------- */

function describeError(input: string, error: unknown): JsonError {
  const message = error instanceof Error ? error.message : String(error);
  const reason = cleanReason(message);
  const position = positionFromMessage(input, message) ?? findErrorPosition(input);

  if (position === null) return { reason, line: null, column: null, excerpt: null };

  const { line, column } = locate(input, position);
  return { reason, line, column, excerpt: buildExcerpt(input, line, column) };
}

/**
 * V8 appends "in JSON at position N (line L column C)"; Firefox ends with
 * "at line L column C of the JSON data". Either pins the failure exactly, so
 * they win over our own scan. V8 drops the position entirely for its
 * "Unexpected token 'x'" messages — that's what findErrorPosition covers.
 */
function positionFromMessage(input: string, message: string): number | null {
  const byPosition = /\bat position (\d+)/.exec(message);
  if (byPosition) return clamp(Number(byPosition[1]), 0, input.length);

  const byLineColumn = /\bat line (\d+) column (\d+)/.exec(message);
  if (byLineColumn) return offsetOf(input, Number(byLineColumn[1]), Number(byLineColumn[2]));

  return null;
}

const NOISE = [
  // V8: "Unexpected token ':' in JSON at position 7 (line 1 column 8)"
  /\s*at position \d+(?: \(line \d+ column \d+\))?\s*$/,
  // Leaves "... after JSON" alone, which reads fine on its own.
  /\s+in JSON$/,
  // V8 short-input form: `Unexpected token '}', "{"a":1,}" is not valid JSON`
  /,\s*(?:\.\.\.)?"[\s\S]*"\s*is not valid JSON\s*$/,
  // Firefox: "unexpected character at line 1 column 9 of the JSON data"
  /\s*at line \d+ column \d+ of the JSON data\s*$/,
];

/**
 * Strips the location out of the engine's message, leaving just the reason —
 * the location is reported separately, and formatted the same way regardless of
 * which browser produced it.
 */
function cleanReason(message: string): string {
  // Firefox prefixes "JSON.parse:", Safari "JSON Parse error:".
  let reason = message.replace(/^JSON\.parse:\s*/, "").replace(/^JSON Parse error:\s*/, "");
  for (const pattern of NOISE) reason = reason.replace(pattern, "");
  reason = reason.trim().replace(/\.$/, "");

  if (reason === "") return "Invalid JSON";
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

function locate(input: string, position: number): { line: number; column: number } {
  const linesBefore = input.slice(0, clamp(position, 0, input.length)).split("\n");
  return {
    line: linesBefore.length,
    column: linesBefore[linesBefore.length - 1].length + 1,
  };
}

function offsetOf(input: string, line: number, column: number): number {
  const lines = input.split("\n");
  let offset = 0;
  for (let index = 0; index < line - 1 && index < lines.length; index += 1) {
    offset += lines[index].length + 1;
  }
  return clamp(offset + column - 1, 0, input.length);
}

/** Roughly a comfortable reading width for the excerpt line. */
const EXCERPT_MAX_CHARS = 68;

/**
 * Renders the failing line with a caret underneath the column. Long lines — a
 * minified document is a single very long line — get a window around the caret,
 * marked with ellipses so it's obvious the line was clipped.
 */
function buildExcerpt(input: string, line: number, column: number): string | null {
  const source = input.split("\n")[line - 1];
  if (source === undefined) return null;

  // A tab would throw the caret out of alignment in the monospace excerpt;
  // swapping each for one space keeps columns 1:1 with the original. The
  // trailing \r goes too, so CRLF input doesn't render a stray glyph.
  const text = source.replace(/\r$/, "").replace(/\t/g, " ");

  let start = 0;
  let end = text.length;
  if (text.length > EXCERPT_MAX_CHARS) {
    const centered = column - 1 - Math.floor(EXCERPT_MAX_CHARS / 2);
    start = clamp(centered, 0, text.length - EXCERPT_MAX_CHARS);
    end = start + EXCERPT_MAX_CHARS;
  }

  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  // The column can sit one past the last character when the line simply ended
  // too early, so the caret is allowed to land just after the shown text.
  const caretOffset = prefix.length + clamp(column - 1 - start, 0, end - start);

  return `${prefix}${text.slice(start, end)}${suffix}\n${" ".repeat(caretOffset)}^`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/* -------------------------------------------------------------------------- */
/* Position fallback                                                          */
/* -------------------------------------------------------------------------- */

interface Scanner {
  text: string;
  index: number;
}

/**
 * Finds the first character that breaks JSON syntax, for the messages that
 * arrive without a position — in V8 that includes `[1, 2, 3,]`, which is the
 * mistake people actually make. JSON.parse stays the authority on *whether*
 * text is valid; this only answers *where*. Returns null if the scan can't
 * reproduce the failure, in which case the caller reports the reason alone
 * rather than guessing at a location.
 */
function findErrorPosition(input: string): number | null {
  const scanner: Scanner = { text: input, index: 0 };

  skipWhitespace(scanner);
  if (!scanValue(scanner)) return scanner.index;

  skipWhitespace(scanner);
  // Anything left over is trailing junk, e.g. `{"a":1} oops`.
  if (scanner.index !== input.length) return scanner.index;

  return null;
}

/**
 * Every scan* function advances `index` past what it consumed and returns true,
 * or returns false leaving `index` on the offending character (or at the end of
 * the text, when it ran out).
 */
function scanValue(scanner: Scanner): boolean {
  const char = scanner.text[scanner.index];
  if (char === undefined) return false;
  if (char === "{") return scanObject(scanner);
  if (char === "[") return scanArray(scanner);
  if (char === '"') return scanString(scanner);
  if (char === "-" || (char >= "0" && char <= "9")) return scanNumber(scanner);

  for (const literal of ["true", "false", "null"]) {
    if (scanner.text.startsWith(literal, scanner.index)) {
      scanner.index += literal.length;
      return true;
    }
  }
  return false;
}

function scanObject(scanner: Scanner): boolean {
  scanner.index += 1; // past "{"
  skipWhitespace(scanner);
  if (scanner.text[scanner.index] === "}") {
    scanner.index += 1;
    return true;
  }

  for (;;) {
    skipWhitespace(scanner);
    // A key has to be a quoted string — this is where `{"a":1,}` lands.
    if (scanner.text[scanner.index] !== '"') return false;
    if (!scanString(scanner)) return false;

    skipWhitespace(scanner);
    if (scanner.text[scanner.index] !== ":") return false;
    scanner.index += 1;

    skipWhitespace(scanner);
    if (!scanValue(scanner)) return false;

    skipWhitespace(scanner);
    const next = scanner.text[scanner.index];
    if (next === ",") {
      scanner.index += 1;
      continue;
    }
    if (next === "}") {
      scanner.index += 1;
      return true;
    }
    return false;
  }
}

function scanArray(scanner: Scanner): boolean {
  scanner.index += 1; // past "["
  skipWhitespace(scanner);
  if (scanner.text[scanner.index] === "]") {
    scanner.index += 1;
    return true;
  }

  for (;;) {
    skipWhitespace(scanner);
    if (!scanValue(scanner)) return false;

    skipWhitespace(scanner);
    const next = scanner.text[scanner.index];
    if (next === ",") {
      scanner.index += 1;
      continue;
    }
    if (next === "]") {
      scanner.index += 1;
      return true;
    }
    return false;
  }
}

const VALID_ESCAPES = '"\\/bfnrt';

function scanString(scanner: Scanner): boolean {
  scanner.index += 1; // past the opening quote

  for (;;) {
    const char = scanner.text[scanner.index];
    if (char === undefined) return false;

    if (char === '"') {
      scanner.index += 1;
      return true;
    }

    if (char === "\\") {
      const escape = scanner.text[scanner.index + 1];
      scanner.index += 1; // point at the escape itself if it turns out to be bad
      if (escape === undefined) return false;
      if (escape === "u") {
        if (!/^[0-9a-fA-F]{4}$/.test(scanner.text.slice(scanner.index + 1, scanner.index + 5))) {
          return false;
        }
        scanner.index += 5;
        continue;
      }
      if (!VALID_ESCAPES.includes(escape)) return false;
      scanner.index += 1;
      continue;
    }

    // Raw control characters have to be escaped inside a JSON string.
    if (char < " ") return false;

    scanner.index += 1;
  }
}

/** The JSON number grammar: no leading +, no leading zeros, no bare ".5". */
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;

function scanNumber(scanner: Scanner): boolean {
  // Anchored on a slice rather than a sticky regex — this runs once, on the
  // error path, so the copy is cheaper than it looks.
  const match = NUMBER.exec(scanner.text.slice(scanner.index));
  if (!match) return false; // a lone "-", or "-." and friends

  scanner.index += match[0].length;
  return true;
}

/** JSON allows exactly these four as whitespace — no form feeds, no NBSP. */
function skipWhitespace(scanner: Scanner): void {
  for (;;) {
    const char = scanner.text[scanner.index];
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      scanner.index += 1;
      continue;
    }
    return;
  }
}
