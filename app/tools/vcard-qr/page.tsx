import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { VCardQrTool } from "./vcard-qr-tool";

const SLUG = "vcard-qr";

export const metadata: Metadata = {
  title: "vCard QR Code Generator",
  description:
    "Turn your contact details into a QR code that saves straight into a phone's address book.",
};

export default function VCardQrPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <VCardQrTool />
    </ToolLayout>
  );
}
