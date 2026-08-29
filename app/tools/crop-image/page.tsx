import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { CropImageTool } from "./crop-image-tool";

const SLUG = "crop-image";

export const metadata: Metadata = {
  title: "Crop Image",
  description:
    "Trim a JPG, PNG or WebP in your browser with a draggable box, free or at a fixed aspect ratio.",
};

export default function CropImagePage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <CropImageTool />
    </ToolLayout>
  );
}
