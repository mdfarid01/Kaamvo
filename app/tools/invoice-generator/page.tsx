import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { InvoiceGeneratorTool } from "./invoice-generator-tool";

const SLUG = "invoice-generator";

export const metadata: Metadata = {
  title: "Invoice Generator",
  description:
    "Make a clean PDF invoice in your browser — your logo, line items, tax and total, with nothing uploaded.",
};

export default function InvoiceGeneratorPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <InvoiceGeneratorTool />
    </ToolLayout>
  );
}
