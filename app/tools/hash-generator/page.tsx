import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { HashGeneratorTool } from "./hash-generator-tool";

const SLUG = "hash-generator";

export const metadata: Metadata = {
  title: "Hash Generator",
  description: "Compute SHA-1, SHA-256 and SHA-512 digests of text or a file, in your browser.",
};

export default function HashGeneratorPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <HashGeneratorTool />
    </ToolLayout>
  );
}
