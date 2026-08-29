import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { PassportPhotoTool } from "./passport-photo-tool";

const SLUG = "passport-photo";

export const metadata: Metadata = {
  title: "Passport Photo Maker",
  description:
    "Crop a photo to an India passport, US passport, PAN card or square size at 300 DPI, and lay copies out on a 4 × 6 print.",
};

export default function PassportPhotoPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <PassportPhotoTool />
    </ToolLayout>
  );
}
