"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import { FileList } from "@/components/ui/file-list";
import type { FileListItem } from "@/components/ui/file-list";
import {
  ACCEPT_ATTRIBUTE,
  DEFAULT_PAGE_SIZING,
  MAX_TOTAL_BYTES,
  PAGE_SIZINGS,
  imagesToPdf,
  loadImage,
  pdfFileName,
} from "@/lib/image-to-pdf";
import type { LoadedImage, PageSizing } from "@/lib/image-to-pdf";
import { cn, formatBytes, moveItem } from "@/lib/utils";

/**
 * One dropped file. The read happens on arrival, so `image` is what the file
 * turned out to be: null while it's still being read, and null with an `error`
 * if it couldn't be. Rejected files stay in the list — a file that silently
 * fails to appear looks like a bug in the drop zone.
 */
interface Entry {
  id: string;
  name: string;
  size: number;
  image: LoadedImage | null;
  error?: string;
  pending: boolean;
  /** Blob URL for the row's preview square. Empty once there's nothing to show. */
  thumbnailUrl: string;
}

interface BuiltPdf {
  blob: Blob;
  pageCount: number;
  /** Names in page order, for naming the download. */
  names: string[];
}

let sequence = 0;
const nextId = () => `image-${(sequence += 1)}`;

export function ImageToPdfTool() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sizing, setSizing] = useState<PageSizing>(DEFAULT_PAGE_SIZING);
  const [result, setResult] = useState<BuiltPdf | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bytes currently held as embeddable image data, checked against
  // MAX_TOTAL_BYTES before another file is read. A ref rather than derived
  // state: a drop of twenty photos decides on each one before a render lands.
  const heldBytes = useRef(0);
  // Every preview URL handed out, so none of them outlive the page.
  const previewUrls = useRef(new Set<string>());

  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current.clear();
    },
    [],
  );

  const releasePreview = (url: string) => {
    if (url === "") return;
    URL.revokeObjectURL(url);
    previewUrls.current.delete(url);
  };

  const readFiles = useCallback(async (queued: Array<{ id: string; file: File }>) => {
    // Sequentially, not in parallel: a re-encode goes through a canvas the size
    // of the image, and twenty of those at once is how a tab runs out of memory.
    for (const { id, file } of queued) {
      const outcome = await loadImage(file);

      if (!outcome.ok) {
        // Nothing was retained, so those bytes go back to the budget.
        heldBytes.current -= file.size;
      }

      setEntries((current) =>
        current.map((entry) => {
          if (entry.id !== id) return entry;
          if (outcome.ok) return { ...entry, image: outcome.image, pending: false };

          // A file that won't decode has nothing to preview either, and a live
          // blob URL would leave a broken image icon in the row.
          releasePreview(entry.thumbnailUrl);
          return { ...entry, image: null, pending: false, error: outcome.error, thumbnailUrl: "" };
        }),
      );
    }
  }, []);

  const handleFiles = useCallback(
    (incoming: File[]) => {
      const added: Entry[] = [];
      const queued: Array<{ id: string; file: File }> = [];

      for (const file of incoming) {
        const id = nextId();

        if (heldBytes.current + file.size > MAX_TOTAL_BYTES) {
          added.push({
            id,
            name: file.name,
            size: file.size,
            image: null,
            pending: false,
            error: `Skipped — that would take the total past ${formatBytes(MAX_TOTAL_BYTES)}.`,
            thumbnailUrl: "",
          });
          continue;
        }

        // The preview comes from the original file, so the row fills in while
        // the bytes are still being checked. An <img> applies EXIF rotation on
        // its own, which is the same turn the page will get.
        const thumbnailUrl = URL.createObjectURL(file);
        previewUrls.current.add(thumbnailUrl);

        heldBytes.current += file.size;
        added.push({ id, name: file.name, size: file.size, image: null, pending: true, thumbnailUrl });
        queued.push({ id, file });
      }

      setEntries((current) => [...current, ...added]);
      // Whatever was built before doesn't include these.
      setResult(null);
      setError(null);
      void readFiles(queued);
    },
    [readFiles],
  );

  const handleMove = useCallback((from: number, to: number) => {
    setEntries((current) => moveItem(current, from, to));
    // Page order is the whole point of the list, so a PDF built from the old
    // order can't be left sitting there as if it were current.
    setResult(null);
  }, []);

  const handleRemove = useCallback((id: string) => {
    setEntries((current) => {
      const going = current.find((entry) => entry.id === id);
      if (going) {
        if (going.pending || going.image !== null) heldBytes.current -= going.size;
        releasePreview(going.thumbnailUrl);
      }
      return current.filter((entry) => entry.id !== id);
    });
    setResult(null);
    setError(null);
  }, []);

  const handleClear = useCallback(() => {
    setEntries((current) => {
      current.forEach((entry) => releasePreview(entry.thumbnailUrl));
      return [];
    });
    setResult(null);
    setError(null);
    heldBytes.current = 0;
  }, []);

  const handleSizing = useCallback((next: PageSizing) => {
    setSizing(next);
    setResult(null);
  }, []);

  const handleBuild = useCallback(async () => {
    const ready = entries.filter(
      (entry): entry is Entry & { image: LoadedImage } => entry.image !== null,
    );
    if (ready.length === 0) return;

    setIsBuilding(true);
    setError(null);

    // Embedding holds the main thread, so this yields once to let the button's
    // disabled state and the "Building…" line actually paint first.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const outcome = await imagesToPdf(
      ready.map((entry) => entry.image),
      sizing,
    );
    setIsBuilding(false);

    if (!outcome.ok) {
      setResult(null);
      setError(outcome.error);
      return;
    }

    setResult({
      blob: outcome.blob,
      pageCount: outcome.pageCount,
      names: ready.map((entry) => entry.name),
    });
  }, [entries, sizing]);

  const handleDownload = useCallback(() => {
    if (result === null) return;

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = pdfFileName(result.names);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [result]);

  const items: FileListItem[] = entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    size: entry.size,
    invalid: entry.error !== undefined,
    pending: entry.pending,
    detail: describe(entry),
    thumbnailUrl: entry.thumbnailUrl,
  }));

  const readyCount = entries.filter((entry) => entry.image !== null).length;
  const isReading = entries.some((entry) => entry.pending);

  return (
    <div className="space-y-4">
      {entries.length > 0 && (
        <FileList items={items} onMove={handleMove} onRemove={handleRemove} noun="image" />
      )}

      <DropZone
        accept={ACCEPT_ATTRIBUTE}
        multiple
        label={entries.length === 0 ? "Drop images here" : "Drop more images here"}
        hint="JPG or PNG — they stay on your device"
        onFiles={handleFiles}
      />

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Page size</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {PAGE_SIZINGS.map((option) => (
            <SizingButton
              key={option.value}
              label={option.label}
              hint={option.hint}
              active={option.value === sizing}
              onClick={() => handleSizing(option.value)}
            />
          ))}
        </div>
      </div>

      {error && <ErrorNotice message={error} />}

      {result && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">PDF</p>
            {/* Mono for the figures only — the app doesn't set prose in it. */}
            <p className="mt-1.5 text-[15px] text-ink">
              <span className="font-mono tabular-nums">{result.pageCount}</span>{" "}
              {result.pageCount === 1 ? "page" : "pages"} ·{" "}
              <span className="font-mono tabular-nums">{formatBytes(result.blob.size)}</span>
            </p>
          </div>
          <Button onClick={handleDownload}>Download PDF</Button>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={readyCount === 0 || isBuilding} onClick={handleBuild}>
          {isBuilding ? "Building…" : "Create PDF"}
        </Button>
        <Button variant="secondary" disabled={entries.length === 0} onClick={handleClear}>
          Clear
        </Button>
        {isReading && <span className="text-[13px] text-muted">Reading…</span>}
        <span aria-live="polite" className="sr-only">
          {result ? `PDF ready, ${result.pageCount} pages, ${formatBytes(result.blob.size)}` : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        One page per image, in the order above, written in your browser — nothing is uploaded. Your
        files are carried across untouched, so nothing is re-compressed and nothing is scaled. The
        two kinds that can’t be — a progressive JPG, or a photo a camera marked as mirrored — are
        redrawn first, and the row says so when that happens.
      </p>
    </div>
  );
}

/** The row's second line: what the image is, or what's wrong with it. */
function describe(entry: Entry): string {
  if (entry.error !== undefined) return entry.error;
  if (entry.pending) return "Reading…";
  if (entry.image === null) return formatBytes(entry.size);

  const { width, height, reencoded } = entry.image;
  return `${width} × ${height} · ${formatBytes(entry.size)}${reencoded ? " · redrawn" : ""}`;
}

/**
 * Tinted accent when idle, solid accent when selected — the same treatment the
 * QR generator's size buttons use, since it's the same kind of choice.
 */
function SizingButton({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        active
          ? "border-accent bg-accent text-canvas"
          : "border-transparent bg-accent/[0.10] text-accent-deep hover:border-accent",
      )}
    >
      {label}
      <span className="text-[11px] opacity-70">{hint}</span>
    </button>
  );
}

/** Same accent-tinted panel the JSON formatter uses — the palette has no red. */
function ErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-accent bg-accent/[0.06] px-4 py-3">
      <p className="text-[13px] font-medium leading-relaxed text-accent-deep">{message}</p>
    </div>
  );
}
