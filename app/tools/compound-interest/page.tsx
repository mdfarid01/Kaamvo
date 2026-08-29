import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { CompoundInterestTool } from "./compound-interest-tool";

const SLUG = "compound-interest";

export const metadata: Metadata = {
  title: "Compound Interest Calculator",
  description: "Grow a principal at a rate over time, compounded as often as you like.",
};

export default function CompoundInterestPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <CompoundInterestTool />
    </ToolLayout>
  );
}
