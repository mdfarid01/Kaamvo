import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { SplitPdfTool } from "./split-pdf-tool";

const SLUG = "split-pdf";

export const metadata: Metadata = {
  title: "Split PDF",
  description: "Pull pages or page ranges out of a PDF in your browser, into a new file.",
};

export default function SplitPdfPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <SplitPdfTool />
    </ToolLayout>
  );
}
