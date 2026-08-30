import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { PdfMetadataEditorTool } from "./pdf-metadata-editor-tool";

const SLUG = "pdf-metadata-editor";

export const metadata: Metadata = {
  title: "PDF Metadata Editor",
  description: "Read and rewrite a PDF's title, author, subject and keywords in your browser.",
};

export default function PdfMetadataEditorPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <PdfMetadataEditorTool />
    </ToolLayout>
  );
}
