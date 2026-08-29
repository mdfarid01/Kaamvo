import type { Tool } from "./tools";

/**
 * Client-side substring match over name, description, category and keywords.
 * Every term in the query must appear somewhere, so "pdf merge" works.
 */
export function filterTools(tools: Tool[], query: string): Tool[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return tools;

  return tools.filter((tool) => {
    const haystack = [tool.name, tool.description, tool.category, ...(tool.keywords ?? [])]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
