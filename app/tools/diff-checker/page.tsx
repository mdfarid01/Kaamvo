import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { DiffCheckerTool } from "./diff-checker-tool";

const SLUG = "diff-checker";

export const metadata: Metadata = {
  title: "Diff Checker",
  description: "Compare two blocks of text line by line or word by word, and see what changed.",
};

export default function DiffCheckerPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <DiffCheckerTool />
    </ToolLayout>
  );
}
