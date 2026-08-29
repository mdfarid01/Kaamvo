import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { RotatePdfTool } from "./rotate-pdf-tool";

const SLUG = "rotate-pdf";

export const metadata: Metadata = {
  title: "Rotate PDF",
  description: "Turn every page of a PDF, or just the ones you pick, 90, 180 or 270 degrees.",
};

export default function RotatePdfPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <RotatePdfTool />
    </ToolLayout>
  );
}
