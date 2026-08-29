import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { DateDifferenceTool } from "./date-difference-tool";

const SLUG = "date-difference";

export const metadata: Metadata = {
  title: "Date Difference Calculator",
  description: "Count the years, months, days and weeks between two dates.",
};

export default function DateDifferencePage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <DateDifferenceTool />
    </ToolLayout>
  );
}
