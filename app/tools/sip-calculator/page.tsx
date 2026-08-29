import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { SipCalculatorTool } from "./sip-calculator-tool";

const SLUG = "sip-calculator";

export const metadata: Metadata = {
  title: "SIP Calculator",
  description: "See what a monthly investment grows to, and how much of it is returns.",
};

export default function SipCalculatorPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <SipCalculatorTool />
    </ToolLayout>
  );
}
