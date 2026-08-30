import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { ImageWatermarkTool } from "./image-watermark-tool";

const SLUG = "image-watermark";

export const metadata: Metadata = {
  title: "Watermark Image",
  description:
    "Add your own text over a photo — pick the corner, size, colour and opacity, and download it.",
};

export default function ImageWatermarkPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <ImageWatermarkTool />
    </ToolLayout>
  );
}
