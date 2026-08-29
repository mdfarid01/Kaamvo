import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { Base64Tool } from "./base64-tool";

const SLUG = "base64";

export const metadata: Metadata = {
  title: "Base64 Encoder",
  description: "Encode text or a file to Base64, and decode Base64 back, in your browser.",
};

export default function Base64Page() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <Base64Tool />
    </ToolLayout>
  );
}
