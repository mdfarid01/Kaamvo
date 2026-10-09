import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { PdfToImageTool } from "./pdf-to-image-tool";

const SLUG = "pdf-to-image";

export const metadata: Metadata = {
  title: "PDF to Image",
  description:
    "Render every page of a PDF as a PNG or JPG and download them, without uploading the file anywhere.",
};

export default function PdfToImagePage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <PdfToImageTool />
    </ToolLayout>
  );
}
