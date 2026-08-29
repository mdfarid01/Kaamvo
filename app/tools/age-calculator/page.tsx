import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { AgeCalculatorTool } from "./age-calculator-tool";

const SLUG = "age-calculator";

export const metadata: Metadata = {
  title: "Age Calculator",
  description: "Work out an exact age in years, months and days, with the next birthday countdown.",
};

export default function AgeCalculatorPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <AgeCalculatorTool />
    </ToolLayout>
  );
}
