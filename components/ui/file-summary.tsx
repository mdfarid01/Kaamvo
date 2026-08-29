import { cn } from "@/lib/utils";

/**
 * The one-file counterpart to FileList, behind Split PDF and Rotate PDF. Both
 * take a single file and act on it in place, so there's no order to drag and
 * nothing to number — what's left is the row: what the file is, and a way to
 * put it back.
 *
 * It borrows FileList's frame and type so the two read as the same component
 * family, because to anyone using the site they are.
 */

interface FileSummaryProps {
  name: string;
  /** Second line: page count and size, or why the file was rejected. */
  detail: string;
  /** A rejected file stays on screen, flagged, rather than vanishing silently. */
  invalid?: boolean;
  onRemove: () => void;
}

export function FileSummary({ name, detail, invalid = false, onRemove }: FileSummaryProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
      <PageIcon />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{name}</p>
        <p className={cn("mt-0.5 truncate text-[13px]", invalid ? "text-accent-deep" : "text-muted")}>
          {detail}
        </p>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        Remove
      </button>
    </div>
  );
}

/** Stands in for FileList's grip and thumbnail, so the rows line up. */
function PageIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-5 w-5 shrink-0 text-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinejoin="round"
    >
      <path d="M3.5 1.5h6l3 3v10h-9z" />
      <path d="M9.5 1.5v3h3" />
    </svg>
  );
}
