/** Average adult silent-reading speed, used for the reading-time estimate. */
export const WORDS_PER_MINUTE = 200;

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  /** Fractional minutes at WORDS_PER_MINUTE — format with formatReadingTime. */
  readingMinutes: number;
}

export function getTextStats(text: string): TextStats {
  const words = countWords(text);

  return {
    words,
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, "").length,
    sentences: countSentences(text),
    paragraphs: countParagraphs(text),
    readingMinutes: words / WORDS_PER_MINUTE,
  };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Counts runs of text closed by . ! ? … — a trailing fragment with no
 * terminator still counts, so "hello" is one sentence. Abbreviations like
 * "Dr. Smith" will over-count; that trade-off keeps this dependency-free.
 */
function countSentences(text: string): number {
  const matches = text.match(/[^.!?…]+[.!?…]*/g);
  if (!matches) return 0;
  return matches.filter((segment) => /\S/.test(segment)).length;
}

/**
 * Any run of newlines starts a new paragraph, so single-Enter breaks in a
 * textarea count — that matches what people see while typing.
 */
function countParagraphs(text: string): number {
  return text.split(/\n+/).filter((block) => block.trim() !== "").length;
}

export function formatReadingTime(minutes: number): string {
  if (minutes === 0) return "0 min";
  if (minutes < 1) return "< 1 min";
  return `${Math.round(minutes)} min`;
}
