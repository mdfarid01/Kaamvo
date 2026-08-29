import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { ConvertImageTool } from "./convert-image-tool";

const SLUG = "convert-image";

export const metadata: Metadata = {
  title: "Convert Image",
  description:
    "Convert a JPG, PNG or WebP to another format in your browser, at the same size and resolution.",
};

export default function ConvertImagePage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <ConvertImageTool />
    </ToolLayout>
  );
}
