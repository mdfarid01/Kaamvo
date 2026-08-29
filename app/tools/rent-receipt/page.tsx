import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { RentReceiptTool } from "./rent-receipt-tool";

const SLUG = "rent-receipt";

export const metadata: Metadata = {
  title: "Rent Receipt Generator",
  description:
    "Generate a printable rent receipt PDF for an HRA claim — landlord, tenant, amount, period and PAN, with a signature line.",
};

export default function RentReceiptPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <RentReceiptTool />
    </ToolLayout>
  );
}
