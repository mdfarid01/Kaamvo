"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { diffTexts } from "@/lib/text-diff";
import type { DiffKind, DiffMode, DiffSegment, DiffStats } from "@/lib/text-diff";
import { cn } from "@/lib/utils";

/** Long enough to swallow a burst of typing, short enough to still read live. */
const DEBOUNCE_MS = 300;

const MODES: Array<{ mode: DiffMode; label: string; hint: string }> = [
  { mode: "lines", label: "By line", hint: "reads like a patch" },
  { mode: "words", label: "By word", hint: "catches edits inside a line" },
];

const BOX_CLASSES =
  "min-h-[240px] w-full resize-y rounded-lg border border-line bg-surface px-4 py-3 font-mono text-[13px] leading-relaxed text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20";

/**
 * The palette has one accent and no red, so the two sides can't be the usual
 * green and red. Additions take the accent tint — the same "this is the thing
 * that happened" treatment the rest of the site uses — and deletions are struck
 * through and dropped to muted, which reads as removed without needing a hue.
 */
const ROW_STYLES: Record<DiffKind, string> = {
  equal: "text-ink",
  added: "bg-accent/[0.10]",
  removed: "bg-ink/[0.03] text-muted",
};

/**
 * The strikethrough goes on the text, not the row: text-decoration draws
 * through every inline descendant and a child can't switch it back off, so
 * striking the row would strike the line numbers and the marker with it.
 */
const TEXT_STYLES: Record<DiffKind, string> = {
  equal: "",
  added: "",
  removed: "line-through decoration-faint",
};

const SPAN_STYLES: Record<DiffKind, string> = {
  equal: "",
  added: "rounded-sm bg-accent/[0.14] text-accent-deep",
  removed: "text-muted line-through decoration-faint",
};

const MARKERS: Record<DiffKind, string> = { equal: "", added: "+", removed: "−" };

const MARKER_STYLES: Record<DiffKind, string> = {
  equal: "text-transparent",
  added: "text-accent-deep",
  removed: "text-faint",
};

export function DiffCheckerTool() {
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [mode, setMode] = useState<DiffMode>("lines");

  // What the diff on screen was computed from. Kept apart from the boxes so a
  // long paste doesn't re-diff on every keystroke.
  const [pair, setPair] = useState({ before: "", after: "" });

  useEffect(() => {
    const timer = setTimeout(() => setPair({ before, after }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [before, after]);

  // A mode click is deliberate, so it re-renders the diff it already has rather
  // than waiting out the debounce — only the typing is delayed.
  const result = useMemo(() => diffTexts(pair.before, pair.after, mode), [pair, mode]);

  const handleSwap = useCallback(() => {
    setBefore(after);
    setAfter(before);
    // Skips the debounce, so the swap lands with the click.
    setPair({ before: after, after: before });
  }, [after, before]);

  const handleClear = useCallback(() => {
    setBefore("");
    setAfter("");
    setPair({ before: "", after: "" });
  }, []);

  const isEmpty = pair.before === "" && pair.after === "";
  const hasText = before !== "" || after !== "";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Box
          id="diff-checker-before"
          label="Before"
          value={before}
          onChange={setBefore}
          placeholder="Paste the original text here"
        />
        <Box
          id="diff-checker-after"
          label="After"
          value={after}
          onChange={setAfter}
          placeholder="Paste the changed text here"
        />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Compare</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {MODES.map((option) => (
            <ModeButton
              key={option.mode}
              label={option.label}
              hint={option.hint}
              active={option.mode === mode}
              onClick={() => setMode(option.mode)}
            />
          ))}
        </div>
      </div>

      {!result.ok && <ErrorNotice message={result.error} />}

      {result.ok && !isEmpty && <Summary stats={result.stats} />}

      <div id="diff-checker-result" className="overflow-hidden rounded-lg border border-line bg-surface">
        {isEmpty ? (
          <p className="px-4 py-12 text-center text-[13px] text-muted">
            Paste text into both boxes and the differences show up here.
          </p>
        ) : result.ok ? (
          <DiffView mode={result.mode} segments={result.segments} stats={result.stats} />
        ) : (
          <p className="px-4 py-12 text-center text-[13px] text-muted">
            Nothing to show — the comparison didn&rsquo;t run.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={!hasText} onClick={handleSwap}>
          Swap sides
        </Button>
        <Button variant="secondary" disabled={!hasText} onClick={handleClear}>
          Clear
        </Button>
        <span aria-live="polite" className="sr-only">
          {result.ok && !isEmpty ? describeStats(result.stats) : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Both texts are compared in your browser — neither is sent anywhere. Additions are marked with
        an accent tint, deletions are struck through and greyed. Windows line endings are treated as
        the same as Unix ones, so a file saved on either platform doesn&rsquo;t come out as changed
        on every line.
      </p>
    </div>
  );
}

function Box({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted"
      >
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        // Mono on both sides: the comparison is column-by-column, and proportional
        // text makes two nearly-identical lines hard to line up by eye.
        className={cn("mt-2", BOX_CLASSES)}
      />
    </div>
  );
}

function DiffView({
  mode,
  segments,
  stats,
}: {
  mode: DiffMode;
  segments: DiffSegment[];
  stats: DiffStats;
}) {
  if (stats.added === 0 && stats.removed === 0) {
    return (
      <p className="px-4 py-12 text-center text-[13px] text-muted">
        The two sides are identical.
      </p>
    );
  }

  if (mode === "words") {
    return (
      <p className="overflow-x-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[13px] leading-[1.7] text-ink">
        {segments.map((segment, index) => (
          <span key={index} className={SPAN_STYLES[segment.kind]}>
            {segment.text}
          </span>
        ))}
      </p>
    );
  }

  return (
    // Named, because otherwise a screen reader announces a list of some number
    // of items with nothing to say what the list is.
    <ol aria-label="Differences, line by line" className="overflow-x-auto py-1">
      {segments.map((segment, index) => (
        <li
          key={index}
          className={cn(
            "flex font-mono text-[13px] leading-[1.6]",
            ROW_STYLES[segment.kind],
          )}
        >
          <Gutter value={segment.beforeLine} />
          <Gutter value={segment.afterLine} />
          <span
            aria-hidden="true"
            className={cn(
              "w-5 shrink-0 select-none text-center",
              MARKER_STYLES[segment.kind],
            )}
          >
            {MARKERS[segment.kind]}
          </span>
          {/* A non-breaking space keeps a blank line from collapsing to nothing,
              so removing one still shows as a row. */}
          <span className={cn("whitespace-pre-wrap break-words pr-4", TEXT_STYLES[segment.kind])}>
            {segment.text === "" ? " " : segment.text}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Gutter({ value }: { value: number | null }) {
  return (
    <span className="w-11 shrink-0 select-none pr-2 text-right text-faint tabular-nums">
      {value ?? ""}
    </span>
  );
}

function Summary({ stats }: { stats: DiffStats }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
      <span className="text-accent-deep">
        <span className="font-mono tabular-nums">{stats.added}</span>{" "}
        {plural(stats.added, stats.unit)} added
      </span>
      <span className="text-muted">
        <span className="font-mono tabular-nums">{stats.removed}</span>{" "}
        {plural(stats.removed, stats.unit)} removed
      </span>
      <span className="text-faint">
        <span className="font-mono tabular-nums">{stats.unchanged}</span> unchanged
      </span>
    </div>
  );
}

function describeStats(stats: DiffStats): string {
  if (stats.added === 0 && stats.removed === 0) return "The two sides are identical";
  return `${stats.added} ${plural(stats.added, stats.unit)} added, ${stats.removed} ${plural(stats.removed, stats.unit)} removed`;
}

function plural(count: number, unit: "line" | "word"): string {
  return count === 1 ? unit : `${unit}s`;
}

/**
 * Tinted accent when idle, solid accent when selected — the same toggle the QR
 * generator uses for its sizes.
 */
function ModeButton({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        active
          ? "border-accent bg-accent text-canvas"
          : "border-transparent bg-accent/[0.10] text-accent-deep hover:border-accent",
      )}
    >
      {label}
      <span className="text-[11px] font-normal opacity-70">{hint}</span>
    </button>
  );
}

/** Same accent-tinted panel the JSON formatter uses — the palette has no red. */
function ErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-accent bg-accent/[0.06] px-4 py-3">
      <p className="text-[13px] font-medium leading-relaxed text-accent-deep">{message}</p>
    </div>
  );
}
