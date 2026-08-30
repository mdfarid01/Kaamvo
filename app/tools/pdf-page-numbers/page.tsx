import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { PdfPageNumbersTool } from "./pdf-page-numbers-tool";

const SLUG = "pdf-page-numbers";

export const metadata: Metadata = {
  title: "Add Page Numbers to PDF",
  description:
    "Number every page of a PDF — bottom centre, bottom right or top right, as 1, Page 1 or 1 of N.",
};

export default function PdfPageNumbersPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <PdfPageNumbersTool />
    </ToolLayout>
  );
}
