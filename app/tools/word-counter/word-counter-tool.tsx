"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatReadingTime, getTextStats, WORDS_PER_MINUTE } from "@/lib/text-stats";

export function WordCounterTool() {
  const [text, setText] = useState("");
  const stats = useMemo(() => getTextStats(text), [text]);

  const metrics: Array<{ label: string; value: string; hint?: string }> = [
    { label: "Words", value: stats.words.toLocaleString() },
    { label: "Characters", value: stats.characters.toLocaleString(), hint: "with spaces" },
    {
      label: "Characters",
      value: stats.charactersNoSpaces.toLocaleString(),
      hint: "without spaces",
    },
    { label: "Sentences", value: stats.sentences.toLocaleString() },
    { label: "Paragraphs", value: stats.paragraphs.toLocaleString() },
    {
      label: "Reading time",
      value: formatReadingTime(stats.readingMinutes),
      hint: `at ${WORDS_PER_MINUTE} wpm`,
    },
  ];

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((metric) => (
          <Card key={`${metric.label}-${metric.hint ?? ""}`} className="px-3.5 py-3">
            <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              {metric.label}
            </dt>
            <dd className="mt-1 text-[22px] font-medium leading-none tabular-nums text-ink">
              {metric.value}
            </dd>
            {metric.hint && <p className="mt-1 text-[11px] text-faint">{metric.hint}</p>}
          </Card>
        ))}
      </dl>

      <div>
        <label htmlFor="word-counter-input" className="sr-only">
          Text to count
        </label>
        <textarea
          id="word-counter-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Start typing or paste your text here…"
          spellCheck={false}
          className="min-h-[320px] w-full resize-y rounded-lg border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button variant="secondary" disabled={text === ""} onClick={() => setText("")}>
          Clear
        </Button>
        <span className="text-[13px] text-muted">Counts update as you type. Nothing is sent anywhere.</span>
      </div>
    </div>
  );
}
