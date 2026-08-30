import { ToolSearch } from "@/components/tool-search";
import { CATEGORIES, TOOLS, type ToolCategory } from "@/lib/tools";

/**
 * `?category=PDF` (used by the tool-page breadcrumb) pre-selects that category's
 * filter pill.
 */
export default function HomePage({
  searchParams,
}: {
  searchParams?: { category?: string };
}) {
  const requested = searchParams?.category;
  const initialCategory =
    requested && CATEGORIES.includes(requested as ToolCategory)
      ? (requested as ToolCategory)
      : null;

  return (
    <div className="mx-auto w-full max-w-content px-6 py-20 md:py-28">
      <header className="max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-line-soft bg-surface px-3 py-1 text-[13px] font-medium text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          {TOOLS.length} tools, zero uploads
        </span>
        <h1 className="mt-5 text-[42px] font-medium leading-[1.08] tracking-[-0.02em] text-ink md:text-[56px]">
          Small tools that get the job done.
        </h1>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
          PDFs, images, text. Each one does a single thing, quickly, in your browser.
        </p>
      </header>

      <div className="mt-10">
        <ToolSearch initialCategory={initialCategory} />
      </div>
    </div>
  );
}
