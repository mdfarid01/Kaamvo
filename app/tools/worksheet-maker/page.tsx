import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { WorksheetMakerTool } from "./worksheet-maker-tool";

const SLUG = "worksheet-maker";

export const metadata: Metadata = {
  title: "Worksheet Maker",
  description:
    "Build a printable A4 worksheet in your browser — numbered questions, marks, answer space and your school logo, with nothing uploaded.",
};

export default function WorksheetMakerPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <WorksheetMakerTool />
    </ToolLayout>
  );
}
