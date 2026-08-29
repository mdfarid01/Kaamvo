export type ToolCategory =
  | "PDF"
  | "Image"
  | "Text"
  | "Convert"
  | "Generate"
  | "Finance"
  | "Everyday";

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

export const CATEGORIES: ToolCategory[] = [
  "PDF",
  "Image",
  "Text",
  "Convert",
  "Generate",
  "Finance",
  // The calculators that aren't about money: dates, ages, percentages. Finance
  // would imply they are, and Generate is for tools that produce a file.
  "Everyday",
];

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
    description: "Pull out single pages or page ranges into a new file.",
    category: "PDF",
    status: "live",
    keywords: ["extract", "pages", "separate", "range"],
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
    status: "live",
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
    slug: "pdf-to-ppt",
    name: "PDF to PPT",
    // The limitation belongs in the description: it's what someone reads on the
    // home page before they click, and it's the whole difference between this
    // tool and what "PDF to PowerPoint" usually promises.
    description: "Put each PDF page on its own slide as an image — not editable text.",
    category: "Convert",
    status: "live",
    keywords: ["powerpoint", "pptx", "slides", "presentation", "deck", "keynote", "google slides"],
  },
  {
    slug: "image-to-pdf",
    name: "Image to PDF",
    description: "Wrap one or more images into a single PDF document.",
    category: "Convert",
    status: "live",
    keywords: ["png", "jpg", "photos", "scan", "combine", "album"],
  },
  {
    slug: "resize-image",
    name: "Resize Image",
    description: "Change an image's dimensions by pixels or percentage.",
    category: "Image",
    status: "live",
    keywords: ["scale", "dimensions", "shrink", "enlarge"],
  },
  {
    slug: "image-compressor",
    name: "Image Compressor",
    description: "Cut image file size with adjustable quality.",
    category: "Image",
    status: "live",
    keywords: ["compress", "optimize", "quality", "smaller", "jpeg", "jpg", "png", "webp"],
  },
  {
    slug: "crop-image",
    name: "Crop Image",
    description: "Trim an image to a selection or a fixed aspect ratio.",
    category: "Image",
    status: "live",
    keywords: ["trim", "cut", "aspect ratio"],
  },
  {
    slug: "convert-image",
    name: "Convert Image",
    // AVIF is offered whenever a browser can encode it (see lib/image-convert.ts),
    // but none can today, so promising it here would be promising a button that
    // isn't there.
    description: "Move between PNG, JPG and WebP formats.",
    category: "Convert",
    status: "live",
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
    slug: "text-formatter",
    name: "Text Formatter",
    description: "Switch text between upper, lower, title, sentence, camel and snake case.",
    category: "Text",
    status: "live",
    keywords: [
      "uppercase",
      "lowercase",
      "title case",
      "capitalize",
      "camelcase",
      "snake case",
      "whitespace",
      "trim",
    ],
  },
  {
    slug: "json-formatter",
    name: "JSON Formatter",
    description: "Pretty-print, minify and validate JSON.",
    category: "Text",
    status: "live",
    keywords: ["pretty print", "beautify", "minify", "validate"],
  },
  {
    slug: "diff-checker",
    name: "Diff Checker",
    description: "Compare two blocks of text and highlight what changed.",
    category: "Text",
    status: "live",
    keywords: ["compare", "changes", "difference"],
  },
  {
    slug: "qr-generator",
    name: "QR Code Generator",
    description: "Turn a link or block of text into a downloadable QR code.",
    category: "Generate",
    status: "live",
    keywords: ["barcode", "link", "scan", "png", "url"],
  },
  {
    slug: "password-generator",
    name: "Password Generator",
    description: "Build strong random passwords with rules you set.",
    category: "Generate",
    status: "live",
    keywords: ["random", "secure", "passphrase"],
  },
  {
    slug: "hash-generator",
    name: "Hash Generator",
    description: "Compute SHA-1, SHA-256 and SHA-512 digests of text or files.",
    category: "Generate",
    status: "live",
    keywords: ["sha", "md5", "checksum", "digest"],
  },
  {
    slug: "invoice-generator",
    name: "Invoice Generator",
    description: "Fill in a form and download a clean PDF invoice with your logo.",
    category: "Generate",
    status: "live",
    keywords: ["bill", "billing", "gst", "tax", "freelance", "pdf", "logo", "line items"],
  },
  {
    slug: "rent-receipt",
    name: "Rent Receipt Generator",
    description: "Make a printable rent receipt for an HRA claim, with a signature line.",
    category: "Generate",
    status: "live",
    keywords: ["hra", "house rent allowance", "landlord", "tenant", "pan", "10(13a)", "pdf"],
  },
  {
    slug: "worksheet-maker",
    name: "Worksheet Maker",
    description: "Type out questions and get a printable A4 worksheet with answer space.",
    category: "Generate",
    status: "live",
    keywords: [
      "teacher",
      "school",
      "homework",
      "question paper",
      "practice",
      "exam",
      "class",
      "printable",
      "pdf",
    ],
  },
  {
    slug: "passport-photo",
    name: "Passport Photo Maker",
    description: "Crop a photo to a passport or PAN card size at 300 DPI, ready to print.",
    category: "Image",
    status: "live",
    keywords: ["passport", "visa", "pan card", "35x45", "2x2", "print", "300 dpi", "id photo"],
  },
  {
    slug: "base64",
    name: "Base64 Encoder",
    description: "Encode and decode text or files as Base64.",
    category: "Convert",
    status: "live",
    keywords: ["encode", "decode", "data uri"],
  },
  {
    slug: "unit-converter",
    name: "Unit Converter",
    description: "Convert length, weight, temperature, speed, area and data sizes.",
    category: "Convert",
    status: "live",
    keywords: [
      "metric",
      "imperial",
      "km to miles",
      "kg to pounds",
      "celsius",
      "fahrenheit",
      "inches",
      "feet",
      "acre",
      "mb to gb",
    ],
  },
  {
    slug: "emi-calculator",
    name: "EMI Calculator",
    description: "Work out the monthly instalment, total interest and total payment on a loan.",
    category: "Finance",
    status: "live",
    keywords: ["loan", "home loan", "car loan", "instalment", "installment", "interest", "tenure"],
  },
  {
    slug: "sip-calculator",
    name: "SIP Calculator",
    description: "See what a monthly investment grows to, and how much of it is returns.",
    category: "Finance",
    status: "live",
    keywords: ["mutual fund", "systematic investment plan", "monthly investment", "returns", "maturity"],
  },
  {
    slug: "compound-interest",
    name: "Compound Interest Calculator",
    description: "Grow a principal at a rate over time, compounded as often as you like.",
    category: "Finance",
    status: "live",
    keywords: ["interest", "fd", "deposit", "savings", "compounding", "annual", "quarterly"],
  },
  {
    slug: "age-calculator",
    name: "Age Calculator",
    description: "Find an exact age in years, months and days, with a countdown to the next birthday.",
    category: "Everyday",
    status: "live",
    keywords: [
      "date of birth",
      "dob",
      "how old",
      "birthday",
      "days lived",
      "age in days",
      "age on date",
    ],
  },
  {
    slug: "date-difference",
    name: "Date Difference Calculator",
    description: "Count the years, months, days and weeks between two dates.",
    category: "Everyday",
    status: "live",
    keywords: [
      "days between dates",
      "date calculator",
      "duration",
      "how many days",
      "weeks between",
      "deadline",
    ],
  },
  {
    slug: "percentage-calculator",
    name: "Percentage Calculator",
    description: "Percent of a number, a share of a total, and increases or decreases by percent.",
    category: "Everyday",
    status: "live",
    keywords: [
      "percent",
      "%",
      "percentage change",
      "increase",
      "decrease",
      "discount",
      "marks",
      "out of",
    ],
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
