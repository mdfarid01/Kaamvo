# CONTEXT.md

Orientation for an AI assistant new to this codebase. Read this instead of re-reading the tree.

---

## 1. What Kaamvo is

Kaamvo is a collection of 41 small, single-purpose browser utilities — PDF editing, image manipulation, text tools, generators (invoice, payslip, certificate, QR), and calculators. It's a **Next.js 14 App Router** app in **TypeScript** (strict), styled with **Tailwind CSS** (fully custom theme, no plugins), using **pdf-lib** for PDF writing, **pdfjs-dist** for PDF rendering, **pptxgenjs**, **qrcode**, and **browser-image-compression**. The core philosophy is **client-side only**: there is no backend, no API route, no database, and nothing is ever uploaded — every tool reads a `File` from a drop zone, does the work in the browser, and hands back a `Blob` to download. The visual philosophy matches: a warm cream canvas, **no shadows anywhere**, **no elevation or scale transforms** (hover states change borders and colours only), small radii, and a single coral accent reserved for primary actions. Fonts are Geist Sans/Mono via the `geist` package.

Path alias: `@/*` → project root. Scripts: `npm run dev`, `build`, `start`, `lint`, `typecheck`.

---

## 2. Folder structure convention

Every tool is three files plus one registry entry:

| File | Role |
| --- | --- |
| `lib/<tool>.ts` | All the logic. Exports types, constants, option lists, and one or more entry functions. |
| `app/tools/<slug>/<slug>-tool.tsx` | `"use client"` component. Holds form/file state, renders UI, calls the lib. |
| `app/tools/<slug>/page.tsx` | Server component. Exports `metadata`, looks up the tool via `getTool(SLUG)`, wraps the tool component in `<ToolLayout>`. |
| `lib/tools.ts` | Registry entry in `TOOLS` with `status: "live"`. |

**Key conventions:**

- **Result unions, never throws.** Lib entry points return `{ ok: true; ... } | { ok: false; error: string }`. A corrupt file, a password-protected PDF, or half-typed input is an *outcome*, not an exception. The UI renders `error` in an alert panel.
- **Keep the lib pure where possible.** Pure arithmetic/parsing modules (`finance.ts`, `date-utils.ts`, `page-ranges.ts`, `text-stats.ts`) run on every keystroke. Modules that touch canvas or `File` decoding are documented as client-side-only.
- **Parse on drop, not on submit.** Files are decoded/parsed as they arrive so the UI can show page count or pixel dimensions and flag a bad file *before* any button is pressed.
- **Every lib file opens with a doc comment** explaining what it's for, which tools share it, whether it's pure, and any non-obvious decision. Match this — it's the codebase's main form of documentation.
- `app/tools/[tool-name]/page.tsx` is a fallback route that renders a placeholder for tools registered as `status: "planned"`. Static segments win over it, so shipping a tool = add the folder + flip the status.

---

## 3. Design system

Tokens live in [tailwind.config.ts](tailwind.config.ts) — always use the named token, never a raw hex.

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | `#F1EFE8` | Page background. |
| `surface` | `#F7F6F1` | One step up — cards, inputs. |
| `ink` | `#2C2C2A` | Primary text. |
| `muted` | `#6E6C64` | Secondary text. |
| `faint` | `#9A978D` | Placeholders, non-essential text. |
| `line` | `#B4B2A9` | Borders on interactive elements. |
| `line-soft` | `#D8D5CB` | Hairline internal dividers. |
| `accent` | `#D85A30` | Primary actions, active states. |
| `accent-hover` | `#C34D26` | Accent hover fill. |
| `accent-deep` | `#A33F1E` | Small text on an accent tint (clears 4.5:1). |
| `category-*-bg` | — | Per-category icon tints, deliberately desaturated. |

Also extended: `rounded` defaults to 6px and everything `lg` and above collapses to 8px; `border-hairline` is 0.5px; `max-w-content` is 1100px.

**Rules:**

1. **No shadows.** No `shadow-*`, no elevation, no `scale` on hover.
2. **Border-only hover.** Cards and secondary buttons change border colour (`hover:border-accent` / `hover:border-ink`) and nothing else.
3. **Accent is reserved.** Coral means "primary action" or "active state". Don't use it for decoration.
4. **There is no red in the palette.** Errors, warnings, and diff-deletions use an accent tint. The standard alert panel is:
   ```tsx
   <div role="alert" className="rounded-lg border border-accent bg-accent/[0.06] px-4 py-3">
     <p className="text-[13px] font-medium leading-relaxed text-accent-deep">{message}</p>
   </div>
   ```
5. **Focus rings** are `focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-canvas` on buttons/cards, `focus:ring-[3px] ring-accent/20 focus:border-accent` on fields.
6. **Numbers** that update live are monospace + `tabular-nums` so they don't jump sideways.
7. Type sizes are set explicitly in brackets (`text-[15px]`, `text-[13px]`) rather than Tailwind's scale.

---

## 4. Shared components and utilities

**Check this list before writing anything new — most primitives already exist.**

### `components/`
- [tool-layout.tsx](components/tool-layout.tsx) — `ToolLayout`: breadcrumb, `<h1>`, description, tool slot, and an auto-generated "Related tools" grid. Every tool page uses it.
- [tool-search.tsx](components/tool-search.tsx) — the home page's search box + category filter pills.

### `components/ui/` (all re-exported from [index.ts](components/ui/index.ts))
- `Button`, `ButtonLink` — variants `primary` / `secondary` / `ghost`, sizes `sm` / `md`.
- `Card`, `CardTitle`, `CardDescription` — bordered surface panel; pass `href` to make the whole card a link.
- `DropZone` — drag-and-drop + click-to-pick file input. Takes `accept`, `multiple`, `label`, `hint`.
- `FileList` + `FileListItem` — reorderable (drag + keyboard) numbered file list, for tools where output order matters. Reports a `from`/`to` pair; pair it with `moveItem`.
- `FileSummary` — the single-file counterpart to `FileList`, with an `invalid` flag.
- `FieldGroup`, `TextField`, `TextAreaField`, `SelectField` — labelled form controls for the form-heavy generators.
- `PageRangeField` — the "which pages?" input, driven by a `PageRangeResult` prop.
- `ResultStat`, `SplitBar` — the figure card and principal/interest bar the calculators answer with.
- `Tag` — small badge, `accent` or `neutral`.
- `CategoryIcon`, `CATEGORY_ICON_BG` — hand-inlined lucide-style glyph per category (lucide-react is *not* a dependency).

### Most-reused `lib/` files
- [tools.ts](lib/tools.ts) — the registry: `Tool`, `ToolCategory`, `CATEGORIES`, `TOOLS`, `getTool`, `getRelatedTools`.
- [utils.ts](lib/utils.ts) — `cn` (class joiner, no clsx), `moveItem`, `bytesToBlob`, `formatBytes`.
- [image-canvas.ts](lib/image-canvas.ts) — canvas plumbing for Resize/Crop/Convert/Watermark: decode a `File` once into a `SourceImage`, render a rect back out as encoded bytes. Also `ACCEPTED_TYPES`, `ACCEPT_ATTRIBUTE`, `MAX_INPUT_BYTES`, `MAX_OUTPUT_PIXELS`, `DEFAULT_QUALITY`.
- [pdf-load.ts](lib/pdf-load.ts) — reading a PDF in: `loadPdf`, `parsePdf`, `LoadedPdf`, `describeLoadError`, `isOutOfMemory`, `ACCEPT_ATTRIBUTE`. Used by every PDF tool.
- [page-ranges.ts](lib/page-ranges.ts) — pure parser for `"1-3, 5, 8-10"`, plus `formatPageList`, `pageWord`, `PAGE_RANGE_EXAMPLE`.
- [pdf-text.ts](lib/pdf-text.ts) — shared pdf-lib typesetting for every generated document: `A4_WIDTH`/`A4_HEIGHT`, `MARGIN`, `mm()`, the `INK`/`MUTED`/`LINE`/`ACCENT` rgb constants, `loadFonts`, text wrapping, and **`toWinAnsi`** — apply it to every string going onto a page, or an un-encodable character throws mid-save and kills the whole download.
- [invoice.ts](lib/invoice.ts) — invoice PDF, and exports `loadLogo` (normalises an uploaded logo/signature to PNG bytes), reused by Certificate and the other letterheaded docs.
- [finance.ts](lib/finance.ts) — pure EMI / SIP / compound-interest maths + a money formatter (deliberately duplicated from `pdf-text.ts` so calculator pages don't ship pdf-lib).
- [date-utils.ts](lib/date-utils.ts) — calendar arithmetic pinned to UTC midnight (local midnight breaks across DST).
- [text-stats.ts](lib/text-stats.ts), [qr-code.ts](lib/qr-code.ts), [search.ts](lib/search.ts) — word/char counts, QR PNG data URLs, home-page tool filtering.

Everything else in `lib/` is one file per tool, named after it.

---

## 5. What's already built

**41 tools registered, 39 live.** The only `status: "planned"` entries are `compress-pdf` and `pdf-to-image`.

Categories (`CATEGORIES` in [lib/tools.ts](lib/tools.ts)):

| Category | Count | Tools |
| --- | --- | --- |
| **PDF** | 7 | Merge, Split, Compress *(planned)*, Rotate, Watermark, Add Page Numbers, Metadata Editor |
| **Image** | 5 | Resize, Compressor, Crop, Watermark, Passport Photo Maker |
| **Text** | 4 | Word Counter, Text Formatter, JSON Formatter, Diff Checker |
| **Convert** | 6 | PDF to Image *(planned)*, PDF to PPT, Image to PDF, Convert Image, Base64, Unit Converter |
| **Generate** | 12 | QR Code, Password, Hash, Invoice, Rent Receipt, Salary Slip, Offer Letter, Weekly Study Planner, Worksheet Maker, Certificate Maker, vCard QR, Signature Pad |
| **Finance** | 3 | EMI, SIP, Compound Interest |
| **Everyday** | 4 | Random Picker, Age, Date Difference, Percentage |

"Everyday" exists for calculators that aren't about money (dates, ages, percentages); "Generate" is for tools that produce a file.

---

## 6. How to add a new tool

1. **`lib/<tool>.ts`** — logic first. Open with a doc comment. Export the option types/constants the UI needs, and an entry function returning a result union. Reuse `pdf-load`, `pdf-text`, `image-canvas`, `page-ranges`, `utils` rather than reimplementing.
2. **`app/tools/<slug>/<slug>-tool.tsx`** — `"use client"`. State + `DropZone`/`Field*` + a `primary` `Button` + the accent alert panel for errors. Compose from `components/ui/`.
3. **`app/tools/<slug>/page.tsx`** — copy an existing one: `const SLUG = "<slug>"`, `export const metadata`, `getTool(SLUG)` → `notFound()` if missing, render `<ToolLayout ...><Tool /></ToolLayout>`. Metadata description can be longer/more SEO-shaped than the registry one.
4. **Register in [lib/tools.ts](lib/tools.ts)** — add to `TOOLS` (or flip an existing `planned` entry to `live`) with `slug`, `name`, `description`, `category`, `status`, and generous `keywords` (the home-page search matches every term against name + description + category + keywords).
5. **Verify** — `npm run typecheck`, `npm run lint`, `npm run build`.

---

## 7. Verification discipline

For a typical tool addition or small change, **`typecheck` + `lint` + `build` is sufficient** and is the expected level of verification. Don't escalate beyond it by default.

Deeper verification — starting a dev server, driving the page in a headless browser, opening generated PDFs/PNGs — is expensive and should be done **only when explicitly requested**, or when the change is one a build genuinely cannot validate (canvas rendering geometry, PDF visual layout, drag interactions). If you do run a server, note that `next dev` and `next start` share `.next`: run only one at a time, or you'll get unstyled, unhydrated pages and mistake it for a real bug.
