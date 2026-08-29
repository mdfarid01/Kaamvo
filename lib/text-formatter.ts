/**
 * Pure text transforms for the Text Formatter tool. Every function takes a
 * string and returns a string, so the UI layer stays a thin wrapper — same
 * split as lib/text-stats.ts.
 */

export type CaseFormat = "upper" | "lower" | "title" | "sentence" | "camel" | "snake";

export const CASE_FORMATS: Array<{ format: CaseFormat; label: string }> = [
  { format: "upper", label: "UPPERCASE" },
  { format: "lower", label: "lowercase" },
  { format: "title", label: "Title Case" },
  { format: "sentence", label: "Sentence case" },
  { format: "camel", label: "camelCase" },
  { format: "snake", label: "snake_case" },
];

const TRANSFORMS: Record<CaseFormat, (text: string) => string> = {
  upper: toUpperCase,
  lower: toLowerCase,
  title: toTitleCase,
  sentence: toSentenceCase,
  camel: toCamelCase,
  snake: toSnakeCase,
};

export function applyCase(text: string, format: CaseFormat): string {
  return TRANSFORMS[format](text);
}

export function toUpperCase(text: string): string {
  return text.toUpperCase();
}

export function toLowerCase(text: string): string {
  return text.toLowerCase();
}

/**
 * Capitalizes the first letter of every word and lowercases the rest.
 * Matching the letter rather than the first character means leading quotes and
 * brackets don't swallow the capital: `"hello` becomes `"Hello`.
 *
 * This is the plain form — "of", "the" and friends are capitalized too, since
 * a style-aware small-word list would be wrong as often as it was right.
 */
export function toTitleCase(text: string): string {
  return text.replace(/\S+/g, (word) => capitalizeFirstLetter(word.toLowerCase()));
}

/**
 * Lowercases everything, then capitalizes the start of the text and of each
 * run following a sentence terminator or a line break. Same terminator set as
 * countSentences in lib/text-stats.ts, so the two tools agree on what a
 * sentence is.
 */
export function toSentenceCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^\s*|[.!?…]\s+|\n\s*)(\S+)/g, (_match, prefix: string, word: string) =>
      prefix + capitalizeFirstLetter(word),
    );
}

/**
 * Upcases the first cased character, leaving anything before it alone, so
 * `"hello` becomes `"Hello` instead of being left untouched. Detecting "cased"
 * by comparing the two cases keeps accented letters working without needing
 * unicode property escapes.
 */
function capitalizeFirstLetter(word: string): string {
  for (let index = 0; index < word.length; index += 1) {
    const char = word[index];
    // A digit means the word starts with a number, so there is no letter to
    // capitalize — without this, "3rd" would become "3Rd".
    if (char >= "0" && char <= "9") return word;
    if (char.toUpperCase() !== char.toLowerCase()) {
      return word.slice(0, index) + char.toUpperCase() + word.slice(index + 1);
    }
  }
  return word;
}

/**
 * Identifier casings run per line, so a pasted list of names converts to a
 * list of identifiers instead of collapsing into one giant token.
 */
export function toCamelCase(text: string): string {
  return mapLines(text, (line) =>
    splitWords(line)
      .map((word, index) =>
        index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
      )
      .join(""),
  );
}

export function toSnakeCase(text: string): string {
  return mapLines(text, (line) =>
    splitWords(line)
      .map((word) => word.toLowerCase())
      .join("_"),
  );
}

/**
 * Splits a line into identifier words. Existing camelCase humps count as
 * boundaries, so `parseHTTPResponse` round-trips to `parse_http_response`
 * rather than one unreadable run.
 */
function splitWords(line: string): string[] {
  return line
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== "");
}

function mapLines(text: string, transform: (line: string) => string): string {
  return text.split("\n").map(transform).join("\n");
}

/**
 * Collapses runs of spaces and tabs to a single space, trims each line, and
 * drops blank lines. Deliberately keeps single line breaks — flattening a
 * document into one paragraph is harder to undo than it is useful.
 */
export function collapseWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}
