import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { PercentageCalculatorTool } from "./percentage-calculator-tool";

const SLUG = "percentage-calculator";

export const metadata: Metadata = {
  title: "Percentage Calculator",
  description:
    "Work out a percentage of a number, a share of a total, and percentage increases or decreases.",
};

export default function PercentageCalculatorPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <PercentageCalculatorTool />
    </ToolLayout>
  );
}
