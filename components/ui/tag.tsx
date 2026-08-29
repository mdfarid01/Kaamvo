import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type TagVariant = "accent" | "neutral";

const variants: Record<TagVariant, string> = {
  // Light accent tint with darkened accent text, so it reads as a badge
  // without introducing a fill strong enough to compete with buttons.
  accent: "bg-accent/[0.10] text-accent-deep",
  neutral: "bg-ink/[0.05] text-muted",
};

interface TagProps {
  children: ReactNode;
  variant?: TagVariant;
  className?: string;
}

export function Tag({ children, variant = "accent", className }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em]",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
