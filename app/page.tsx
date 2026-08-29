import { ToolSearch } from "@/components/tool-search";
import { CATEGORIES, type ToolCategory } from "@/lib/tools";

/**
 * `?category=PDF` (used by the tool-page breadcrumb) seeds the search box,
 * since the filter already matches on category.
 */
export default function HomePage({
  searchParams,
}: {
  searchParams?: { category?: string };
}) {
  const requested = searchParams?.category;
  const initialQuery =
    requested && CATEGORIES.includes(requested as ToolCategory) ? requested : "";

  return (
    <div className="mx-auto w-full max-w-content px-6 py-14 md:py-20">
      <header className="max-w-2xl">
        <h1 className="text-[32px] font-medium leading-tight tracking-[-0.015em] text-ink md:text-[40px]">
          Small tools that get the job done.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          PDFs, images, text. Each one does a single thing, quickly, in your browser.
        </p>
      </header>

      <div className="mt-8">
        <ToolSearch initialQuery={initialQuery} />
      </div>
    </div>
  );
}
