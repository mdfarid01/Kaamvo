"use client";

import { useMemo, useState } from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { filterTools } from "@/lib/search";
import { TOOLS } from "@/lib/tools";

export function ToolSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);

  // Filtering 18 items on every keystroke is cheap — no debounce needed.
  const results = useMemo(() => filterTools(TOOLS, query), [query]);

  return (
    <>
      <div className="max-w-xl">
        <label htmlFor="tool-search" className="sr-only">
          Search tools
        </label>
        <input
          id="tool-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools — try “pdf” or “resize”"
          autoComplete="off"
          className="h-11 w-full rounded-md border border-line bg-surface px-3.5 text-[15px] text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
        />
        <p className="mt-2.5 text-[13px] text-muted">
          No account required. Files never leave your device.
        </p>
      </div>

      <div className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted">
            {query ? "Results" : "All tools"}
          </h2>
          <Tag>
            {results.length} {results.length === 1 ? "tool" : "tools"}
          </Tag>
        </div>

        {results.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center">
            <p className="text-sm text-ink">No tools match “{query}”.</p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-2 text-[13px] text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Clear search
            </button>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((tool) => (
              <li key={tool.slug}>
                <Card href={`/tools/${tool.slug}`} className="h-full p-4">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>{tool.name}</CardTitle>
                    <Tag className="mt-0.5 shrink-0">{tool.category}</Tag>
                  </div>
                  <CardDescription className="mt-1.5">{tool.description}</CardDescription>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
