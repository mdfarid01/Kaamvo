import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { TOOLS, getTool } from "@/lib/tools";

/**
 * Fallback route for registered tools that don't have their own directory yet.
 * Static segments (e.g. app/tools/merge-pdf) take precedence over this one, so
 * building a tool is just a matter of adding its folder and flipping the
 * registry status to "live".
 */

interface PageProps {
  params: { "tool-name": string };
}

export function generateStaticParams() {
  // "live" tools own a static route, so prerendering them here is wasted work.
  return TOOLS.filter((tool) => tool.status === "planned").map((tool) => ({
    "tool-name": tool.slug,
  }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const tool = getTool(params["tool-name"]);
  if (!tool) return { title: "Tool not found" };

  return { title: tool.name, description: tool.description };
}

export default function ToolPage({ params }: PageProps) {
  const tool = getTool(params["tool-name"]);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center">
        <p className="text-sm font-medium text-ink">Not built yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
          This tool is scaffolded but has no logic behind it. When it ships it will run entirely in
          your browser, like everything else here.
        </p>
      </div>
    </ToolLayout>
  );
}
