import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { PasswordGeneratorTool } from "./password-generator-tool";

const SLUG = "password-generator";

export const metadata: Metadata = {
  title: "Password Generator",
  description:
    "Generate a strong random password in your browser — pick the length and which character types to include.",
};

export default function PasswordGeneratorPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <PasswordGeneratorTool />
    </ToolLayout>
  );
}
