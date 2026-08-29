"use client";

import { useId } from "react";
import { PAGE_RANGE_EXAMPLE, formatPageList, pageWord } from "@/lib/page-ranges";
import type { PageRangeResult } from "@/lib/page-ranges";
import { cn } from "@/lib/utils";

/**
 * The "which pages?" field, shared by Split PDF and Rotate PDF. Both ask the
 * same question in the same grammar, so both ask it in the same place, the same
 * way.
 *
 * The parse itself stays with the tool — it needs the page numbers to do the
 * work, and parsing twice to render is silly — so the result arrives as a prop
 * and this only decides what to say about it. Which is: the pages that came
 * out, written back as text, so a selection that de-duplicated or came out in
 * an unexpected order says so before anything is written.
 */

interface PageRangeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** For the "of N pages" hint, and to show the field is worth filling in. */
  pageCount: number;
  /** parsePageRanges(value, pageCount) — ignored while the field is empty. */
  result: PageRangeResult;
  disabled?: boolean;
}

export function PageRangeField({
  label,
  value,
  onChange,
  pageCount,
  result,
  disabled = false,
}: PageRangeFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;

  // An empty field isn't a mistake, it's a field nobody has typed in yet, so it
  // gets the example rather than the parser's complaint about not having one.
  const empty = value.trim() === "";
  const invalid = !empty && !result.ok;

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label
          htmlFor={id}
          className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted"
        >
          {label}
        </label>
        <span className="text-[11px] text-faint">
          this PDF has <span className="font-mono tabular-nums">{pageCount}</span>
          {pageCount === 1 ? " page" : " pages"}
        </span>
      </div>

      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={PAGE_RANGE_EXAMPLE}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={invalid}
        aria-describedby={noteId}
        className={cn(
          "mt-3 h-10 w-full rounded-md border bg-surface px-3 font-mono text-[15px] tabular-nums text-ink transition-colors duration-150 placeholder:font-sans placeholder:text-faint focus:outline-none focus:ring-[3px] focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50",
          invalid ? "border-accent" : "border-line focus:border-accent",
        )}
      />

      <p
        id={noteId}
        aria-live="polite"
        className={cn(
          "mt-2 text-[13px] leading-relaxed",
          invalid ? "font-medium text-accent-deep" : "text-muted",
        )}
      >
        {note(empty, result)}
      </p>
    </div>
  );
}

function note(empty: boolean, result: PageRangeResult): string {
  if (empty) return `Single pages, ranges, or both — ${PAGE_RANGE_EXAMPLE}.`;
  if (!result.ok) return result.error;

  return `${pageWord(result.pages.length)}: ${formatPageList(result.pages)}`;
}
