import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { PdfToPptTool } from "./pdf-to-ppt-tool";

const SLUG = "pdf-to-ppt";

export const metadata: Metadata = {
  title: "PDF to PPT",
  description:
    "Turn a PDF into a PowerPoint deck, one slide per page. The slides are page images, not editable text.",
};

export default function PdfToPptPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <PdfToPptTool />
    </ToolLayout>
  );
}
