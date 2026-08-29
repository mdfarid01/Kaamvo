import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { MergePdfTool } from "./merge-pdf-tool";

const SLUG = "merge-pdf";

export const metadata: Metadata = {
  title: "Merge PDF",
  description: "Combine several PDFs into one file, in the order you choose.",
};

export default function MergePdfPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <MergePdfTool />
    </ToolLayout>
  );
}
