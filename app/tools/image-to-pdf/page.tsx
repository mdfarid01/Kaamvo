import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { ImageToPdfTool } from "./image-to-pdf-tool";

const SLUG = "image-to-pdf";

export const metadata: Metadata = {
  title: "Image to PDF",
  description: "Combine JPGs and PNGs into a single PDF in your browser, one page per image.",
};

export default function ImageToPdfPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <ImageToPdfTool />
    </ToolLayout>
  );
}
