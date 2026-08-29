"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import { FileList } from "@/components/ui/file-list";
import type { FileListItem } from "@/components/ui/file-list";
import { ACCEPT_ATTRIBUTE, loadPdf } from "@/lib/pdf-load";
import type { LoadedPdf } from "@/lib/pdf-load";
import { MAX_TOTAL_BYTES, mergePdfs, mergedFileName } from "@/lib/pdf-merge";
import { formatBytes, moveItem } from "@/lib/utils";

/**
 * One dropped file. The parse happens on arrival, so `pdf` is what the file
 * turned out to be: null while it's still being read, and null with an `error`
 * if it couldn't be. Rejected files stay in the list — a file that silently
 * fails to appear looks like a bug in the drop zone.
 */
interface Entry {
  id: string;
  name: string;
  size: number;
  pdf: LoadedPdf | null;
  error?: string;
  pending: boolean;
}

interface MergedPdf {
  blob: Blob;
  pageCount: number;
  /** Names in the order they were merged, for naming the download. */
  names: string[];
}

let sequence = 0;
const nextId = () => `pdf-${(sequence += 1)}`;

export function MergePdfTool() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [result, setResult] = useState<MergedPdf | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bytes currently held in parsed documents, checked against MAX_TOTAL_BYTES
  // before another file is read. A ref rather than derived state: a drop of ten
  // files decides on each one before the first render lands.
  const heldBytes = useRef(0);

  const readFiles = useCallback(async (queued: Array<{ id: string; file: File }>) => {
    // Sequentially, not in parallel: parsing two 100 MB files at once is how a
    // tab runs out of memory, and the list fills in top to bottom either way.
    for (const { id, file } of queued) {
      const outcome = await loadPdf(file);

      if (!outcome.ok) {
        // Nothing was retained, so those bytes go back to the budget.
        heldBytes.current -= file.size;
      }

      setEntries((current) =>
        current.map((entry) => {
          if (entry.id !== id) return entry;
          return outcome.ok
            ? { ...entry, pdf: outcome.pdf, pending: false }
            : { ...entry, pdf: null, pending: false, error: outcome.error };
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
            pdf: null,
            pending: false,
            error: `Skipped — that would take the total past ${formatBytes(MAX_TOTAL_BYTES)}.`,
          });
          continue;
        }

        heldBytes.current += file.size;
        added.push({ id, name: file.name, size: file.size, pdf: null, pending: true });
        queued.push({ id, file });
      }

      setEntries((current) => [...current, ...added]);
      // Whatever was merged before doesn't include these.
      setResult(null);
      setError(null);
      void readFiles(queued);
    },
    [readFiles],
  );

  const handleMove = useCallback((from: number, to: number) => {
    setEntries((current) => moveItem(current, from, to));
    // The order is the whole point of the tool, so a merged file from the old
    // order can't be left sitting there as if it were current.
    setResult(null);
  }, []);

  const handleRemove = useCallback((id: string) => {
    setEntries((current) => {
      const going = current.find((entry) => entry.id === id);
      if (going && (going.pending || going.pdf !== null)) heldBytes.current -= going.size;
      return current.filter((entry) => entry.id !== id);
    });
    setResult(null);
    setError(null);
  }, []);

  const handleClear = useCallback(() => {
    setEntries([]);
    setResult(null);
    setError(null);
    heldBytes.current = 0;
  }, []);

  const handleMerge = useCallback(async () => {
    const ready = entries.filter((entry): entry is Entry & { pdf: LoadedPdf } => entry.pdf !== null);
    if (ready.length === 0) return;

    setIsMerging(true);
    setError(null);

    // Writing a large PDF holds the main thread, so this yields once to let the
    // button's disabled state and the "Merging…" line actually paint first.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const outcome = await mergePdfs(ready.map((entry) => entry.pdf));
    setIsMerging(false);

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
  }, [entries]);

  const handleDownload = useCallback(() => {
    if (result === null) return;

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = mergedFileName(result.names);
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
  }));

  const readyCount = entries.filter((entry) => entry.pdf !== null).length;
  const isReading = entries.some((entry) => entry.pending);

  return (
    <div className="space-y-4">
      {entries.length > 0 && (
        <FileList items={items} onMove={handleMove} onRemove={handleRemove} noun="PDF" />
      )}

      <DropZone
        accept={ACCEPT_ATTRIBUTE}
        multiple
        label={entries.length === 0 ? "Drop PDFs here" : "Drop more PDFs here"}
        hint="or click to browse — they stay on your device"
        onFiles={handleFiles}
      />

      {error && <ErrorNotice message={error} />}

      {result && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Merged</p>
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
        <Button disabled={readyCount === 0 || isMerging} onClick={handleMerge}>
          {isMerging ? "Merging…" : "Merge PDFs"}
        </Button>
        <Button variant="secondary" disabled={entries.length === 0} onClick={handleClear}>
          Clear
        </Button>
        {isReading && <span className="text-[13px] text-muted">Reading…</span>}
        {!isReading && readyCount === 1 && (
          <span className="text-[13px] text-muted">
            One file — you’ll get a copy of it, in a new PDF.
          </span>
        )}
        <span aria-live="polite" className="sr-only">
          {result ? `Merged into ${result.pageCount} pages, ${formatBytes(result.blob.size)}` : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Pages are copied in the order above, and the merged file is written in your browser — nothing
        is uploaded. Text, images and links come across intact; bookmarks and fillable form fields
        don’t survive a merge.
      </p>
    </div>
  );
}

/** The row's second line: what the file is, or what's wrong with it. */
function describe(entry: Entry): string {
  if (entry.error !== undefined) return entry.error;
  if (entry.pending) return "Reading…";
  if (entry.pdf === null) return formatBytes(entry.size);

  const pages = entry.pdf.pageCount;
  return `${pages} ${pages === 1 ? "page" : "pages"} · ${formatBytes(entry.size)}`;
}

/** Same accent-tinted panel the JSON formatter uses — the palette has no red. */
function ErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-accent bg-accent/[0.06] px-4 py-3">
      <p className="text-[13px] font-medium leading-relaxed text-accent-deep">{message}</p>
    </div>
  );
}
