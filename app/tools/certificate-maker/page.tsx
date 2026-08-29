import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { CertificateMakerTool } from "./certificate-maker-tool";

const SLUG = "certificate-maker";

export const metadata: Metadata = {
  title: "Certificate Maker",
  description:
    "Fill in a name, an event and a date, and download a landscape A4 certificate PDF with a printed border.",
};

export default function CertificateMakerPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <CertificateMakerTool />
    </ToolLayout>
  );
}
