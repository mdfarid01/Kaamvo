import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLayout } from "@/components/tool-layout";
import { getTool } from "@/lib/tools";
import { SalarySlipTool } from "./salary-slip-tool";

const SLUG = "salary-slip";

export const metadata: Metadata = {
  title: "Salary Slip Generator",
  description:
    "Generate a clean A4 payslip PDF — company logo, employee details, earnings and deductions, with gross, deductions and net pay worked out for you.",
};

export default function SalarySlipPage() {
  const tool = getTool(SLUG);
  if (!tool) notFound();

  return (
    <ToolLayout
      slug={tool.slug}
      title={tool.name}
      description={tool.description}
      category={tool.category}
    >
      <SalarySlipTool />
    </ToolLayout>
  );
}
