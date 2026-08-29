"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatJson, minifyJson } from "@/lib/json-formatter";
import type { JsonError, JsonResult } from "@/lib/json-formatter";

type CopyState = "idle" | "copied" | "failed";

const COPY_RESET_MS = 1600;

const COPY_LABELS: Record<CopyState, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

export function JsonFormatterTool() {
  const [text, setText] = useState("");
  const [error, setError] = useState<JsonError | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();

  const isEmpty = text.trim() === "";

  // Any edit invalidates both the "Copied" confirmation and the error, which
  // would otherwise point at line numbers from text the user has since changed.
  useEffect(() => {
    setCopyState("idle");
    setError(null);
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

  // Both buttons rewrite the box in place, so the result is what gets copied,
  // re-formatted or edited next — one source of truth, as in text-formatter.
  // Invalid input is left exactly as typed: the error names the spot, and
  // rewriting the box would move the cursor away from it.
  const run = useCallback(
    (transform: (input: string) => JsonResult) => {
      const result = transform(text);
      if (result.ok) {
        setText(result.text);
        setError(null);
        return;
      }
      setError(result.error);
    },
    [text],
  );

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="json-formatter-input" className="sr-only">
          JSON to format
        </label>
        <textarea
          id="json-formatter-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder='Paste your JSON, e.g. {"name":"kaamvo","tools":18}'
          spellCheck={false}
          // Mono here, unlike the prose tools: alignment and indentation are
          // the point once the text has been pretty-printed.
          className="min-h-[320px] w-full resize-y rounded-lg border border-line bg-surface px-4 py-3 font-mono text-[13px] leading-relaxed text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
        />
      </div>

      {error && <ErrorNotice error={error} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={isEmpty} onClick={() => run(formatJson)}>
          Format
        </Button>
        <Button variant="secondary" disabled={isEmpty} onClick={() => run(minifyJson)}>
          Minify
        </Button>
        <Button variant="secondary" disabled={isEmpty} onClick={handleCopy}>
          {COPY_LABELS[copyState]}
        </Button>
        <Button variant="secondary" disabled={text === ""} onClick={() => setText("")}>
          Clear
        </Button>
        <span aria-live="polite" className="sr-only">
          {copyState === "copied" ? "JSON copied to clipboard" : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Format indents with two spaces; minify strips every byte of whitespace between tokens. Both
        run in your browser on the text in the box above — nothing is sent anywhere.
      </p>
    </div>
  );
}

/**
 * The accent tint doubles as the error treatment — the palette has one accent
 * and no red, and a tinted panel keeps the "no shadows" rule intact.
 */
function ErrorNotice({ error }: { error: JsonError }) {
  return (
    <div role="alert" className="rounded-lg border border-accent bg-accent/[0.06] px-4 py-3">
      <p className="text-[13px] font-medium leading-relaxed text-accent-deep">
        {error.reason}
        {error.line !== null && (
          <span className="font-normal">
            {" — line "}
            <span className="tabular-nums">{error.line}</span>
            {", column "}
            <span className="tabular-nums">{error.column}</span>
          </span>
        )}
      </p>
      {error.excerpt && (
        <pre className="mt-2 overflow-x-auto font-mono text-[12px] leading-[1.5] text-muted">
          {error.excerpt}
        </pre>
      )}
    </div>
  );
}
