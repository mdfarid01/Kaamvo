import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { UnitConverterTool } from "./unit-converter-tool";

const SLUG = "unit-converter";

export const metadata: Metadata = {
  title: "Unit Converter",
  description: "Convert length, weight, temperature, speed, area and data sizes.",
};

export default function UnitConverterPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <UnitConverterTool />
    </ToolLayout>
  );
}
