import { cn } from "@/lib/utils";

/**
 * The figure card and split bar the three finance calculators answer with — EMI,
 * SIP and Compound Interest.
 *
 * They live here rather than as a local Stat in each page, the way Rent Receipt
 * has one, because all three show the same shape of answer: a headline number,
 * two or three supporting ones, and a bar splitting a total into what was put in
 * and what the interest added. Three copies of that would drift apart.
 *
 * Numbers are tabular-nums and monospace so a figure doesn't jump sideways as it
 * updates on every keystroke.
 */

interface ResultStatProps {
  label: string;
  value: string;
  /** A unit, a term, or what the figure is made of. */
  hint?: string;
  /** The one answer the page exists for — accent border, larger type. */
  primary?: boolean;
}

export function ResultStat({ label, value, hint, primary = false }: ResultStatProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-surface px-4 py-3.5",
        primary ? "border-accent" : "border-line",
      )}
    >
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-1.5 font-mono font-medium leading-none tabular-nums",
          primary ? "text-[24px] text-accent-deep" : "text-[19px] text-ink",
        )}
      >
        {value}
      </dd>
      {hint !== undefined && hint !== "" && <p className="mt-2 text-[12px] text-faint">{hint}</p>}
    </div>
  );
}

interface SplitBarProps {
  /** Share of the total taken by the first part, 0–100. */
  percent: number;
  leadLabel: string;
  restLabel: string;
}

/**
 * A total split in two — principal against interest, or invested against gains.
 * The labels carry the numbers, so the bar itself only has to show the
 * proportion, and the legend keeps it readable without relying on colour alone.
 */
export function SplitBar({ percent, leadLabel, restLabel }: SplitBarProps) {
  const width = Math.min(100, Math.max(0, percent));

  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-line-soft">
        <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-muted">
        <Legend className="bg-accent" label={leadLabel} />
        <Legend className="bg-line-soft" label={restLabel} />
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", className)} />
      {label}
    </span>
  );
}
