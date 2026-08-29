import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { WordCounterTool } from "./word-counter-tool";

const SLUG = "word-counter";

export const metadata: Metadata = {
  title: "Word Counter",
  description: "Count words, characters, sentences and reading time.",
};

export default function WordCounterPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <WordCounterTool />
    </ToolLayout>
  );
}
