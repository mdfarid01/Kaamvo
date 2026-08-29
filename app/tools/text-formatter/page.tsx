import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { TextFormatterTool } from "./text-formatter-tool";

const SLUG = "text-formatter";

export const metadata: Metadata = {
  title: "Text Formatter",
  description: "Change text case and strip extra whitespace, instantly in your browser.",
};

export default function TextFormatterPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <TextFormatterTool />
    </ToolLayout>
  );
}
