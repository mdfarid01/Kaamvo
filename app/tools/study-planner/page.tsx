import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { StudyPlannerTool } from "./study-planner-tool";

const SLUG = "study-planner";

export const metadata: Metadata = {
  title: "Weekly Study Planner",
  description:
    "Build a weekly study timetable with your own time slots and breaks, put any subject in any cell, and download it as a printable PDF.",
};

export default function StudyPlannerPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <StudyPlannerTool />
    </ToolLayout>
  );
}
