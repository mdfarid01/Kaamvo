import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { CompressPdfTool } from "./compress-pdf-tool";

const SLUG = "compress-pdf";

export const metadata: Metadata = {
  title: "Compress PDF",
  description:
    "Rewrite a PDF without the leftovers of earlier saves to make it smaller, in your browser. Best on text documents; photo-heavy files barely move.",
};

export default function CompressPdfPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <CompressPdfTool />
    </ToolLayout>
  );
}
