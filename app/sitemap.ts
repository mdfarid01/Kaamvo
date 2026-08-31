import type { MetadataRoute } from "next";
import { TOOLS } from "@/lib/tools";

const BASE_URL = "https://kaamvo.in";

/**
 * Only `live` tools go in. `planned` ones fall through to the [tool-name]
 * placeholder, and /ai-tools, /sign-in and /sign-up are left out entirely —
 * there's nothing on them worth indexing yet.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: BASE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...TOOLS.filter((tool) => tool.status === "live").map((tool) => ({
      url: `${BASE_URL}/tools/${tool.slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
