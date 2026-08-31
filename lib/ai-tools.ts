/**
 * Placeholder catalogue for the AI section. These are unbuilt — the page renders
 * them as "coming soon" cards. Deliberately kept out of `lib/tools.ts` so the
 * homepage search, the sitemap and the "N tools, zero uploads" count keep
 * describing only tools that actually run.
 */
export interface AiTool {
  slug: string;
  name: string;
  description: string;
}

export const AI_TOOLS: AiTool[] = [
  {
    slug: "resume-bullets",
    name: "Resume Bullet Rewriter",
    description:
      "Paste a flat job duty and get back a few tighter bullets with the verbs and numbers pulled forward.",
  },
  {
    slug: "pdf-summary",
    name: "PDF Summarizer",
    description:
      "Drop in a long report or notice and get a short plain-language summary of what it actually says.",
  },
  {
    slug: "email-reply",
    name: "Email Reply Drafter",
    description:
      "Give it the mail you received and a one-line intent, and it drafts the reply in your tone.",
  },
  {
    slug: "alt-text",
    name: "Image Alt Text Writer",
    description:
      "Describes an image in one accurate sentence, sized for a screen reader rather than for SEO.",
  },
  {
    slug: "letter-drafter",
    name: "Letter Drafter",
    description:
      "Offer letters, leave applications, rent notices — filled from a few fields, in the usual format.",
  },
  {
    slug: "text-cleanup",
    name: "Text Cleanup",
    description:
      "Fixes spacing, casing and stray line breaks in text copied out of a PDF or a scan.",
  },
];
