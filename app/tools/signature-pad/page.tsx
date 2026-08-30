import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { SignaturePadTool } from "./signature-pad-tool";

const SLUG = "signature-pad";

export const metadata: Metadata = {
  title: "Signature Pad",
  description:
    "Sign with a mouse, pen or finger and download a transparent PNG of your signature.",
};

export default function SignaturePadPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <SignaturePadTool />
    </ToolLayout>
  );
}
