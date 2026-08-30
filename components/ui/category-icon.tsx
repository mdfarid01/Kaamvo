import { cn } from "@/lib/utils";
import type { ToolCategory } from "@/lib/tools";

/**
 * Hand-inlined lucide-style glyphs (24px grid, 1.75 stroke, round joins) —
 * lucide-react isn't a dependency and one icon per category isn't worth adding
 * one for.
 */
const paths: Record<ToolCategory, React.ReactNode> = {
  PDF: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </>
  ),
  Image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </>
  ),
  Text: (
    <>
      <path d="M4 7V4h16v3" />
      <path d="M12 4v16" />
      <path d="M9 20h6" />
    </>
  ),
  Convert: (
    <>
      <path d="m16 3 4 4-4 4" />
      <path d="M20 7H4" />
      <path d="m8 21-4-4 4-4" />
      <path d="M4 17h16" />
    </>
  ),
  Generate: (
    <>
      <path d="M12 3l1.8 4.9L18.7 9.7 13.8 11.5 12 16.4 10.2 11.5 5.3 9.7 10.2 7.9Z" />
      <path d="M18 16.5v3.5" />
      <path d="M16.25 18.25h3.5" />
    </>
  ),
  Finance: (
    <>
      <path d="M6 3h12" />
      <path d="M6 8h12" />
      <path d="m6 13 8.5 8" />
      <path d="M6 13h3" />
      <path d="M9 13c6.7 0 6.7-10 0-10" />
    </>
  ),
  Everyday: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 6h8" />
      <path d="M8 11h.01" />
      <path d="M12 11h.01" />
      <path d="M16 11h.01" />
      <path d="M8 15h.01" />
      <path d="M12 15h.01" />
      <path d="M16 18h.01" />
      <path d="M8 18h4" />
    </>
  ),
};

export function CategoryIcon({
  category,
  className,
}: {
  category: ToolCategory;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-[18px] w-[18px]", className)}
      aria-hidden="true"
      focusable="false"
    >
      {paths[category]}
    </svg>
  );
}
