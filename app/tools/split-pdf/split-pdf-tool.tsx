"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import { FileSummary } from "@/components/ui/file-summary";
import { PageRangeField } from "@/components/ui/page-range-field";
import { pageWord, parsePageRanges } from "@/lib/page-ranges";
import { ACCEPT_ATTRIBUTE, loadPdf } from "@/lib/pdf-load";
import type { LoadedPdf } from "@/lib/pdf-load";
import { splitFileName, splitPdf } from "@/lib/pdf-split";
import { formatBytes } from "@/lib/utils";

/**
 * The dropped file. The parse happens on arrival, so `pdf` is what the file
 * turned out to be: null while it's still being read, and null with an `error`
 * if it couldn't be. A rejected file stays on screen — a file that silently
 * fails to appear looks like a bug in the drop zone.
 */
interface Entry {
  file: File;
  name: string;
  size: number;
  pdf: LoadedPdf | null;
  error?: string;
  pending: boolean;
}

interface SplitPdf {
  blob: Blob;
  pageCount: number;
  /** The source name and the pages taken, for naming the download. */
  sourceName: string;
  pages: number[];
}

export function SplitPdfTool() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [spec, setSpec] = useState("");
  const [result, setResult] = useState<SplitPdf | null>(null);
  const [isSplitting, setIsSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Which drop the tool is currently waiting on. Dropping a second file while
  // the first is still parsing is easy to do with a big PDF, and without this
  // the slower parse would land last and win.
  const loading = useRef(0);

  const handleFiles = useCallback((incoming: File[]) => {
    const file = incoming[0];
    if (file === undefined) return;

    const token = (loading.current += 1);

    setEntry({ file, name: file.name, size: file.size, pdf: null, pending: true });
    setResult(null);
    setError(null);
    // This tool works on one file, and the input isn't multiple, but a drag can
    // still carry several. Taking the first quietly would look like the others
    // failed to register.
    setNotice(
      incoming.length > 1 ? `Only ${file.name} was taken — this tool splits one PDF.` : null,
    );

    void loadPdf(file).then((outcome) => {
      if (loading.current !== token) return;

      setEntry((current) => {
        if (current === null || current.file !== file) return current;
        return outcome.ok
          ? { ...current, pdf: outcome.pdf, pending: false }
          : { ...current, pdf: null, pending: false, error: outcome.error };
      });
    });
  }, []);

  const handleRemove = useCallback(() => {
    loading.current += 1;
    setEntry(null);
    setResult(null);
    setError(null);
    setNotice(null);
  }, []);

  const handleClear = useCallback(() => {
    handleRemove();
    setSpec("");
  }, [handleRemove]);

  const handleSpec = useCallback((next: string) => {
    setSpec(next);
    // The selection is the whole point of the tool, so a file built from the
    // old one can't be left sitting there as if it were current.
    setResult(null);
    setError(null);
  }, []);

  const pdf = entry?.pdf ?? null;
  const pageCount = pdf?.pageCount ?? 0;

  const parsed = useMemo(() => parsePageRanges(spec, pageCount), [spec, pageCount]);
  const selection = parsed.ok ? parsed.pages : null;

  const handleSplit = useCallback(async () => {
    if (pdf === null || selection === null) return;

    setIsSplitting(true);
    setError(null);

    // Writing a PDF holds the main thread, so this yields once to let the
    // button's disabled state and the "Extracting…" line actually paint first.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const outcome = await splitPdf(pdf, selection);
    setIsSplitting(false);

    if (!outcome.ok) {
      setResult(null);
      setError(outcome.error);
      return;
    }

    setResult({
      blob: outcome.blob,
      pageCount: outcome.pageCount,
      sourceName: pdf.name,
      pages: selection,
    });
  }, [pdf, selection]);

  const handleDownload = useCallback(() => {
    if (result === null) return;

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = splitFileName(result.sourceName, result.pages);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [result]);

  return (
    <div className="space-y-4">
      {entry && (
        <FileSummary
          name={entry.name}
          detail={describe(entry)}
          invalid={entry.error !== undefined}
          onRemove={handleRemove}
        />
      )}

      <DropZone
        accept={ACCEPT_ATTRIBUTE}
        label={entry === null ? "Drop a PDF here" : "Drop a different PDF here"}
        hint="or click to browse — it stays on your device"
        onFiles={handleFiles}
      />

      {notice && <p className="text-[13px] text-muted">{notice}</p>}

      {pdf && (
        <PageRangeField
          label="Pages to pull out"
          value={spec}
          onChange={handleSpec}
          pageCount={pdf.pageCount}
          result={parsed}
          disabled={isSplitting}
        />
      )}

      {error && <ErrorNotice message={error} />}

      {result && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Extracted
            </p>
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
        <Button disabled={pdf === null || selection === null || isSplitting} onClick={handleSplit}>
          {isSplitting ? "Extracting…" : "Extract pages"}
        </Button>
        <Button variant="secondary" disabled={entry === null && spec === ""} onClick={handleClear}>
          Clear
        </Button>
        {entry?.pending === true && <span className="text-[13px] text-muted">Reading…</span>}
        {selection !== null && !isSplitting && (
          <span className="text-[13px] text-muted">
            {pageWord(selection.length)} out of {pageWord(pageCount)}.
          </span>
        )}
        <span aria-live="polite" className="sr-only">
          {result
            ? `Extracted ${pageWord(result.pageCount)}, ${formatBytes(result.blob.size)}`
            : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        You get one PDF holding the pages you asked for, written in your browser — nothing is
        uploaded. Pages come out in the order you type them, so <span className="font-mono">5, 1-3</span>{" "}
        rearranges as it extracts; name a page twice and it still only appears once. Text, images,
        links and page rotation come across intact; bookmarks and fillable form fields don’t survive
        being pulled out of the file they were defined in.
      </p>
    </div>
  );
}

/** The row's second line: what the file is, or what's wrong with it. */
function describe(entry: Entry): string {
  if (entry.error !== undefined) return entry.error;
  if (entry.pending) return "Reading…";
  if (entry.pdf === null) return formatBytes(entry.size);

  return `${pageWord(entry.pdf.pageCount)} · ${formatBytes(entry.size)}`;
}

/** Same accent-tinted panel the JSON formatter uses — the palette has no red. */
function ErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-accent bg-accent/[0.06] px-4 py-3">
      <p className="text-[13px] font-medium leading-relaxed text-accent-deep">{message}</p>
    </div>
  );
}
