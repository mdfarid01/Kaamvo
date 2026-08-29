import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { JsonFormatterTool } from "./json-formatter-tool";

const SLUG = "json-formatter";

export const metadata: Metadata = {
  title: "JSON Formatter",
  description: "Pretty-print or minify JSON, and see exactly where invalid JSON breaks.",
};

export default function JsonFormatterPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <JsonFormatterTool />
    </ToolLayout>
  );
}
