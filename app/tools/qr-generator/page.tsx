import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { QrGeneratorTool } from "./qr-generator-tool";

const SLUG = "qr-generator";

export const metadata: Metadata = {
  title: "QR Code Generator",
  description: "Turn a link or block of text into a QR code and download it as a PNG.",
};

export default function QrGeneratorPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <QrGeneratorTool />
    </ToolLayout>
  );
}
