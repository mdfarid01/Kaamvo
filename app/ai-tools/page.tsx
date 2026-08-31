import type { Metadata } from "next";
import { AiToolAction } from "@/components/auth-controls";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { AI_TOOLS } from "@/lib/ai-tools";

export const metadata: Metadata = {
  title: "AI Tools",
  description:
    "AI-assisted writing and document tools for Kaamvo. In development — sign in to get access as they land.",
};

export default function AiToolsPage() {
  return (
    <div className="mx-auto w-full max-w-content px-6 py-20 md:py-28">
      <header className="max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-line-soft bg-surface px-3 py-1 text-[13px] font-medium text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          In development
        </span>
        <h1 className="mt-5 text-[42px] font-medium leading-[1.08] tracking-[-0.02em] text-ink md:text-[56px]">
          AI tools, coming soon.
        </h1>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
          The same idea as the rest of Kaamvo — one small job each, done quickly. Sign in
          now and you&rsquo;ll have access the day they ship.
        </p>
      </header>

      {/* The rest of the site promises nothing leaves the device. These can't keep
          that promise, so say so here rather than let the footer imply otherwise. */}
      <p className="mt-8 max-w-xl rounded-lg border border-dashed border-line bg-surface px-4 py-3 text-[14px] leading-relaxed text-muted">
        Unlike every other tool on Kaamvo, these will send what you give them to a model
        to be processed. That&rsquo;s why they need an account.
      </p>

      <div className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">
            Planned
          </h2>
          <Tag>{AI_TOOLS.length} tools</Tag>
        </div>

        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AI_TOOLS.map((tool) => (
            <li key={tool.slug}>
              <Card className="flex h-full flex-col p-5">
                <div className="flex gap-3.5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line-soft bg-category-generate-bg text-ink/70">
                    <SparkleIcon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-[16px]">{tool.name}</CardTitle>
                    <CardDescription className="mt-2 text-[14px]">
                      {tool.description}
                    </CardDescription>
                  </div>
                </div>

                <div className="mt-5 flex justify-end pt-1">
                  <AiToolAction />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />
      <path d="M18.5 4v3M20 5.5h-3" />
    </svg>
  );
}
