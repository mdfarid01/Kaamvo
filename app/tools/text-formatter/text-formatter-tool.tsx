"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CASE_FORMATS, applyCase, collapseWhitespace } from "@/lib/text-formatter";
import type { CaseFormat } from "@/lib/text-formatter";
import { getTextStats } from "@/lib/text-stats";

type CopyState = "idle" | "copied" | "failed";

const COPY_RESET_MS = 1600;

const COPY_LABELS: Record<CopyState, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

export function TextFormatterTool() {
  const [text, setText] = useState("");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();

  const stats = useMemo(() => getTextStats(text), [text]);
  const isEmpty = text === "";

  // Any edit invalidates the "Copied" confirmation — it would otherwise claim
  // the clipboard holds text the user has since changed.
  useEffect(() => {
    setCopyState("idle");
  }, [text]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const flashCopyState = useCallback((state: CopyState) => {
    setCopyState(state);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState("idle"), COPY_RESET_MS);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      flashCopyState("copied");
    } catch {
      // Denied permission or a non-secure context — say so instead of
      // silently pretending the copy worked.
      flashCopyState("failed");
    }
  }, [flashCopyState, text]);

  const metrics: Array<{ label: string; value: string }> = [
    { label: "Characters", value: stats.characters.toLocaleString() },
    { label: "Words", value: stats.words.toLocaleString() },
    { label: "Lines", value: (isEmpty ? 0 : text.split("\n").length).toLocaleString() },
  ];

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-3">
        {metrics.map((metric) => (
          <Card key={metric.label} className="px-3.5 py-3">
            <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              {metric.label}
            </dt>
            <dd className="mt-1 text-[22px] font-medium leading-none tabular-nums text-ink">
              {metric.value}
            </dd>
          </Card>
        ))}
      </dl>

      <div>
        <label htmlFor="text-formatter-input" className="sr-only">
          Text to format
        </label>
        <textarea
          id="text-formatter-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type or paste your text, then pick a format…"
          spellCheck={false}
          className="min-h-[320px] w-full resize-y rounded-lg border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
        />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          Change case
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {CASE_FORMATS.map(({ format, label }) => (
            <CaseButton
              key={format}
              label={label}
              disabled={isEmpty}
              onClick={() => setText((current) => applyCase(current, format))}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={isEmpty}
          onClick={() => setText(collapseWhitespace)}
        >
          Remove extra whitespace
        </Button>
        <Button disabled={isEmpty} onClick={handleCopy}>
          {COPY_LABELS[copyState]}
        </Button>
        <Button variant="secondary" disabled={isEmpty} onClick={() => setText("")}>
          Clear
        </Button>
        <span aria-live="polite" className="sr-only">
          {copyState === "copied" ? "Text copied to clipboard" : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Every transform runs in your browser, on the text in the box above. Nothing is sent
        anywhere.
      </p>
    </div>
  );
}

/**
 * Case buttons need to render their own label verbatim — a shouty UPPERCASE
 * label shouldn't be re-cased by the button styles — so they use the tinted
 * accent treatment from Tag rather than the Button variants.
 */
function CaseButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 items-center rounded-md border border-transparent bg-accent/[0.10] px-3 font-mono text-[13px] font-medium text-accent-deep transition-colors duration-150 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent"
    >
      {label}
    </button>
  );
}
