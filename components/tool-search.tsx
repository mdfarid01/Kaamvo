"use client";

import { useMemo, useState } from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { CATEGORY_ICON_BG, CategoryIcon } from "@/components/ui/category-icon";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { filterTools } from "@/lib/search";
import { CATEGORIES, TOOLS, type ToolCategory } from "@/lib/tools";

/** "All" is the pill, `null` is the state — no category means no narrowing. */
type CategoryFilter = ToolCategory | null;

export function ToolSearch({
  initialCategory = null,
}: {
  initialCategory?: CategoryFilter;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);

  // Filtering 18 items on every keystroke is cheap — no debounce needed. The
  // category narrows first, so the search only ever looks inside it.
  const results = useMemo(() => {
    const scope = category ? TOOLS.filter((tool) => tool.category === category) : TOOLS;
    return filterTools(scope, query);
  }, [category, query]);

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
          className="h-12 w-full rounded-md border border-line bg-surface px-4 text-[16px] text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
        />
        <p className="mt-3 text-[14px] text-muted">
          No account required. Files never leave your device.
        </p>
      </div>

      <div className="mt-12 flex flex-wrap gap-2">
        <CategoryPill
          label="All"
          active={category === null}
          onClick={() => setCategory(null)}
        />
        {CATEGORIES.map((name) => (
          <CategoryPill
            key={name}
            label={name}
            active={category === name}
            onClick={() => setCategory(name)}
          />
        ))}
      </div>

      <div className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">
            {query ? "Results" : category ? `${category} tools` : "All tools"}
          </h2>
          <Tag>
            {results.length} {results.length === 1 ? "tool" : "tools"}
          </Tag>
        </div>

        {results.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-line bg-surface px-6 py-14 text-center">
            <p className="text-[15px] text-ink">
              No {category ?? ""} tools match “{query}”.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCategory(null);
              }}
              className="mt-2.5 text-[14px] text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((tool) => (
              <li key={tool.slug}>
                <Card href={`/tools/${tool.slug}`} className="h-full p-5">
                  {/* Inner flex row rather than flexing the Card itself — the
                      linked variant sets `block` on the same element. */}
                  <div className="flex gap-3.5">
                    <span
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line-soft text-ink/70",
                        CATEGORY_ICON_BG[tool.category],
                      )}
                    >
                      <CategoryIcon category={tool.category} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="text-[16px]">{tool.name}</CardTitle>
                        <Tag className="mt-[3px] shrink-0">{tool.category}</Tag>
                      </div>
                      <CardDescription className="mt-2 text-[14px]">
                        {tool.description}
                      </CardDescription>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** Same accent-tint / solid-accent toggle the tool pages use for their options. */
function CategoryPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        active
          ? "border-accent bg-accent text-canvas"
          : "border-transparent bg-accent/[0.10] text-accent-deep hover:border-accent",
      )}
    >
      {label}
    </button>
  );
}
