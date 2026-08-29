import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { EmiCalculatorTool } from "./emi-calculator-tool";

const SLUG = "emi-calculator";

export const metadata: Metadata = {
  title: "EMI Calculator",
  description: "Work out the monthly instalment, total interest and total payment on a loan.",
};

export default function EmiCalculatorPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <EmiCalculatorTool />
    </ToolLayout>
  );
}
