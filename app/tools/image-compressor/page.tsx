import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { ImageCompressorTool } from "./image-compressor-tool";

const SLUG = "image-compressor";

export const metadata: Metadata = {
  title: "Image Compressor",
  description: "Shrink a JPG, PNG or WebP in your browser with an adjustable quality setting.",
};

export default function ImageCompressorPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <ImageCompressorTool />
    </ToolLayout>
  );
}
