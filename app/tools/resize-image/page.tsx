import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { ResizeImageTool } from "./resize-image-tool";

const SLUG = "resize-image";

export const metadata: Metadata = {
  title: "Resize Image",
  description:
    "Change a JPG, PNG or WebP's width and height in your browser, with the proportions locked or free.",
};

export default function ResizeImagePage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <ResizeImageTool />
    </ToolLayout>
  );
}
