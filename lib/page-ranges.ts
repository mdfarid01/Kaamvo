/**
 * Page selections — "1-3, 5, 8-10" — for the PDF tools that act on part of a
 * file rather than all of it: Split PDF and Rotate PDF.
 *
 * Unlike the rest of the pdf-* modules this is pure and synchronous, because it
 * runs on every keystroke to drive the summary line under the field. It returns
 * a result union rather than throwing for the same reason the others do: "1-"
 * is what a half-typed range looks like, not an exception.
 *
 * The grammar is deliberately small — a page number, or two separated by a
 * dash, in a comma-separated list. Open-ended ranges ("8-") are left out on
 * purpose: both tools show the page count right above the field, so the end is
 * never a thing you have to guess at, and every accepted form has exactly one
 * meaning.
 */

export type PageRangeResult = { ok: true; pages: number[] } | { ok: false; error: string };

/** What the field shows when it's empty, and the placeholder on the input. */
export const PAGE_RANGE_EXAMPLE = "1-3, 5, 8-10";

const SINGLE = /^(\d+)$/;
/** An en or em dash too — a range pasted out of a document rarely has a hyphen. */
const RANGE = /^(\d+)\s*[-–—]\s*(\d+)$/;

/**
 * Turns a written selection into page numbers, in the order they were written:
 * "5, 1-2" gives 5, 1, 2, and Split PDF puts them in the file that way round.
 *
 * A page named twice is only counted once. Extracting the same page twice is a
 * thing nobody asks for on purpose, and the summary line shows the pages that
 * came out, so the de-duplication isn't silent.
 */
export function parsePageRanges(input: string, pageCount: number): PageRangeResult {
  const parts = input
    .split(/[,\n]/)
    .map((part) => part.trim())
    // A trailing comma is what typing looks like mid-way through, and an empty
    // gap between two commas isn't worth stopping for either.
    .filter((part) => part !== "");

  if (parts.length === 0) {
    return { ok: false, error: `Type the pages you want, like ${PAGE_RANGE_EXAMPLE}.` };
  }

  const pages: number[] = [];
  const seen = new Set<number>();

  const take = (page: number) => {
    if (seen.has(page)) return;
    seen.add(page);
    pages.push(page);
  };

  for (const part of parts) {
    const single = SINGLE.exec(part);
    if (single) {
      const page = Number(single[1]);
      const problem = check(page, pageCount);
      if (problem) return { ok: false, error: problem };
      take(page);
      continue;
    }

    const range = RANGE.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);

      const problem = check(from, pageCount) ?? check(to, pageCount);
      if (problem) return { ok: false, error: problem };
      if (from > to) {
        // Guessing here would mean deciding whether "5-1" is five-to-one
        // backwards or a typo for 1-5. Both are plausible, so neither is worth
        // assuming on someone's behalf.
        return { ok: false, error: `“${part}” runs backwards — write it as ${to}-${from}.` };
      }

      for (let page = from; page <= to; page++) take(page);
      continue;
    }

    return { ok: false, error: `“${part}” isn’t a page number — try ${PAGE_RANGE_EXAMPLE}.` };
  }

  return { ok: true, pages };
}

/**
 * Page numbers back into the shortest text that means the same thing, for the
 * summary under the field: [1,2,3,5] reads as "1-3, 5". Only runs that are
 * already in ascending order collapse, so a deliberate "5, 1-2" still shows the
 * order the pages will come out in.
 */
export function formatPageList(pages: number[]): string {
  const parts: string[] = [];

  for (let i = 0; i < pages.length; i++) {
    const start = pages[i];
    let end = start;
    while (i + 1 < pages.length && pages[i + 1] === end + 1) {
      end = pages[i + 1];
      i++;
    }

    // A two-page run is written out — "4-5" is no shorter than "4, 5" and reads
    // as though something might be hiding in the middle.
    if (end - start >= 2) parts.push(`${start}-${end}`);
    else for (let page = start; page <= end; page++) parts.push(String(page));
  }

  return parts.join(", ");
}

/** "1 page" / "7 pages", which both tools say in more than one place. */
export function pageWord(count: number): string {
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

function check(page: number, pageCount: number): string | null {
  if (page === 0) return "Pages start at 1.";
  if (page > pageCount) {
    return `There’s no page ${page} — this PDF has ${pageWord(pageCount)}.`;
  }
  return null;
}
