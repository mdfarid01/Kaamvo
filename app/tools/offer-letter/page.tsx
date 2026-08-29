import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { OfferLetterTool } from "./offer-letter-tool";

const SLUG = "offer-letter";

export const metadata: Metadata = {
  title: "Offer Letter Generator",
  description:
    "Write a professional employment offer letter and download it as an A4 PDF — letterhead with your logo, body paragraphs, terms and a signature block.",
};

export default function OfferLetterPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <OfferLetterTool />
    </ToolLayout>
  );
}
