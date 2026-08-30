import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { PdfWatermarkTool } from "./pdf-watermark-tool";

const SLUG = "pdf-watermark";

export const metadata: Metadata = {
  title: "Watermark PDF",
  description:
    "Stamp your own text across every page of a PDF, at the opacity and angle you choose.",
};

export default function PdfWatermarkPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <PdfWatermarkTool />
    </ToolLayout>
  );
}
