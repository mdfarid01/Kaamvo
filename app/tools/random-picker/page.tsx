import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { RandomPickerTool } from "./random-picker-tool";

const SLUG = "random-picker";

export const metadata: Metadata = {
  title: "Random Picker",
  description:
    "Paste a list of names and pick one at random, or split the list into random teams.",
};

export default function RandomPickerPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <RandomPickerTool />
    </ToolLayout>
  );
}
