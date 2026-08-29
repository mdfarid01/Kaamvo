import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  children: ReactNode;
  className?: string;
  /** When set, the whole card becomes a link. */
  href?: string;
}

const base = "rounded-lg border border-line bg-surface";

export function Card({ children, className, href }: CardProps) {
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          // Border-only hover — no elevation, no scale transform.
          "block transition-colors duration-150 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          className,
        )}
      >
        {children}
      </Link>
    );
  }

  return <div className={cn(base, className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-[15px] font-medium leading-snug text-ink", className)}>{children}</h3>;
}

export function CardDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn("text-[13px] leading-relaxed text-muted", className)}>{children}</p>;
}
