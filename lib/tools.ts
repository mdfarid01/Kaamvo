export type ToolCategory = "PDF" | "Image" | "Text" | "Convert" | "Generate";

/**
 * `live` tools have a hand-written page under app/tools/<slug>/page.tsx.
 * `planned` tools fall through to the [tool-name] dynamic route, which
 * renders a placeholder inside the same ToolLayout.
 */
export type ToolStatus = "live" | "planned";

export interface Tool {
  slug: string;
  name: string;
  description: string;
  category: ToolCategory;
  status: ToolStatus;
  /** Extra search terms that aren't in the name or description. */
  keywords?: string[];
}

export const CATEGORIES: ToolCategory[] = ["PDF", "Image", "Text", "Convert", "Generate"];

export const TOOLS: Tool[] = [
  {
    slug: "merge-pdf",
    name: "Merge PDF",
    description: "Combine several PDFs into one file, in the order you choose.",
    category: "PDF",
    status: "live",
    keywords: ["combine", "join", "append"],
  },
  {
    slug: "split-pdf",
    name: "Split PDF",
    description: "Pull out single pages or page ranges into separate files.",
    category: "PDF",
    status: "planned",
    keywords: ["extract", "pages", "separate"],
  },
  {
    slug: "compress-pdf",
    name: "Compress PDF",
    description: "Shrink a PDF's file size while keeping it readable.",
    category: "PDF",
    status: "planned",
    keywords: ["reduce", "optimize", "smaller"],
  },
  {
    slug: "rotate-pdf",
    name: "Rotate PDF",
    description: "Turn pages 90, 180 or 270 degrees and save the result.",
    category: "PDF",
    status: "planned",
    keywords: ["turn", "orientation", "sideways"],
  },
  {
    slug: "pdf-to-image",
    name: "PDF to Image",
    description: "Render each page of a PDF as a PNG or JPG.",
    category: "Convert",
    status: "planned",
    keywords: ["png", "jpg", "render", "screenshot"],
  },
  {
    slug: "image-to-pdf",
    name: "Image to PDF",
    description: "Wrap one or more images into a single PDF document.",
    category: "Convert",
    status: "planned",
    keywords: ["png", "jpg", "photos", "scan"],
  },
  {
    slug: "resize-image",
    name: "Resize Image",
    description: "Change an image's dimensions by pixels or percentage.",
    category: "Image",
    status: "planned",
    keywords: ["scale", "dimensions", "shrink", "enlarge"],
  },
  {
    slug: "compress-image",
    name: "Compress Image",
    description: "Cut image file size with adjustable quality.",
    category: "Image",
    status: "planned",
    keywords: ["optimize", "quality", "smaller", "jpeg"],
  },
  {
    slug: "crop-image",
    name: "Crop Image",
    description: "Trim an image to a selection or a fixed aspect ratio.",
    category: "Image",
    status: "planned",
    keywords: ["trim", "cut", "aspect ratio"],
  },
  {
    slug: "convert-image",
    name: "Convert Image",
    description: "Move between PNG, JPG, WebP and AVIF formats.",
    category: "Convert",
    status: "planned",
    keywords: ["png", "jpg", "webp", "avif", "format"],
  },
  {
    slug: "word-counter",
    name: "Word Counter",
    description: "Count words, characters, sentences and reading time.",
    category: "Text",
    status: "live",
    keywords: ["characters", "length", "reading time"],
  },
  {
    slug: "case-converter",
    name: "Case Converter",
    description: "Switch text between upper, lower, title and sentence case.",
    category: "Text",
    status: "planned",
    keywords: ["uppercase", "lowercase", "title case", "capitalize"],
  },
  {
    slug: "json-formatter",
    name: "JSON Formatter",
    description: "Pretty-print, minify and validate JSON.",
    category: "Text",
    status: "planned",
    keywords: ["pretty print", "beautify", "minify", "validate"],
  },
  {
    slug: "diff-checker",
    name: "Diff Checker",
    description: "Compare two blocks of text and highlight what changed.",
    category: "Text",
    status: "planned",
    keywords: ["compare", "changes", "difference"],
  },
  {
    slug: "qr-code",
    name: "QR Code Generator",
    description: "Turn a link or block of text into a downloadable QR code.",
    category: "Generate",
    status: "planned",
    keywords: ["barcode", "link", "scan"],
  },
  {
    slug: "password-generator",
    name: "Password Generator",
    description: "Build strong random passwords with rules you set.",
    category: "Generate",
    status: "planned",
    keywords: ["random", "secure", "passphrase"],
  },
  {
    slug: "hash-generator",
    name: "Hash Generator",
    description: "Compute SHA-1, SHA-256 and SHA-512 digests of text or files.",
    category: "Generate",
    status: "planned",
    keywords: ["sha", "md5", "checksum", "digest"],
  },
  {
    slug: "base64",
    name: "Base64 Encoder",
    description: "Encode and decode text or files as Base64.",
    category: "Convert",
    status: "planned",
    keywords: ["encode", "decode", "data uri"],
  },
];

export function getTool(slug: string): Tool | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

/**
 * Same-category tools first, then anything else, so a tool page always has
 * something to show in "Related tools" even in a thin category.
 */
export function getRelatedTools(slug: string, limit = 4): Tool[] {
  const tool = getTool(slug);
  if (!tool) return TOOLS.slice(0, limit);

  const sameCategory = TOOLS.filter((t) => t.slug !== slug && t.category === tool.category);
  const rest = TOOLS.filter((t) => t.slug !== slug && t.category !== tool.category);

  return [...sameCategory, ...rest].slice(0, limit);
}
