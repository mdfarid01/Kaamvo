"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import { FileSummary } from "@/components/ui/file-summary";
import { pageWord } from "@/lib/page-ranges";
import {
  compressPdf,
  compressedFileName,
  isMeaningfulSaving,
  savingsPercent,
} from "@/lib/pdf-compress";
import { ACCEPT_ATTRIBUTE, loadPdf } from "@/lib/pdf-load";
import type { LoadedPdf } from "@/lib/pdf-load";
import { cn, formatBytes } from "@/lib/utils";

/**
 * The dropped file. The parse happens on arrival, so `pdf` is what the file
 * turned out to be: null while it's still being read, and null with an `error`
 * if it couldn't be. A rejected file stays on screen — a file that silently
 * fails to appear looks like a bug in the drop zone.
 *
 * The File itself is kept because compressing re-reads it (see lib/pdf-compress.ts).
 */
interface Entry {
  file: File;
  name: string;
  size: number;
  pdf: LoadedPdf | null;
  error?: string;
  pending: boolean;
}

interface Result {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  reduced: boolean;
  sourceName: string;
}

export function CompressPdfTool() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [working, setWorking] = useState(false);
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
    setNotice(
      incoming.length > 1 ? `Only ${file.name} was taken — this tool compresses one PDF.` : null,
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

  const pdf = entry?.pdf ?? null;
  const ready = pdf !== null && !working;

  const handleCompress = useCallback(async () => {
    if (entry === null || pdf === null) return;

    setWorking(true);
    setError(null);
    setResult(null);

    // Rewriting holds the main thread, so this yields once to let the button's
    // disabled state paint first.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const outcome = await compressPdf(entry.file);
    setWorking(false);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }

    setResult({
      blob: outcome.blob,
      originalSize: outcome.originalSize,
      compressedSize: outcome.compressedSize,
      reduced: outcome.reduced,
      sourceName: entry.name,
    });
  }, [entry, pdf]);

  const handleDownload = useCallback(() => {
    if (result === null) return;

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = compressedFileName(result.sourceName);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [result]);

  return (
    <div className="space-y-4">
      {/* Said before anything is dropped, not after the download: someone here
          with a 40 MB scan should find out what this can and can't do for it
          before they wait on a rewrite that won't move the number much. */}
      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="text-[13px] leading-relaxed text-ink">
          <span className="font-medium">This removes redundant PDF structure, not image data.</span>{" "}
          The file is rebuilt from scratch, which drops the leftovers of earlier saves and packs
          what&apos;s left more tightly. Text-heavy documents, forms and files that have been edited
          and re-saved a few times can lose a useful chunk. If the size is mostly scanned pages or
          photographs, expect very little — the pictures inside are left exactly as they are.
        </p>
      </div>

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
        disabled={working}
        onFiles={handleFiles}
      />

      {notice && <p className="text-[13px] text-muted">{notice}</p>}

      {error && (
        <div role="alert" className="rounded-lg border border-accent bg-accent/[0.06] px-4 py-3">
          <p className="text-[13px] font-medium leading-relaxed text-accent-deep">{error}</p>
        </div>
      )}

      <ResultCard result={result} working={working} />

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!ready} onClick={handleCompress}>
          {working ? "Compressing…" : "Compress PDF"}
        </Button>
        <Button
          variant="secondary"
          disabled={result === null}
          onClick={handleDownload}
        >
          Download PDF
        </Button>
        <Button variant="secondary" disabled={entry === null} onClick={handleRemove}>
          Clear
        </Button>
        {entry?.pending === true && <span className="text-[13px] text-muted">Reading…</span>}
        <span aria-live="polite" className="sr-only">
          {result === null
            ? ""
            : isMeaningfulSaving(result.originalSize, result.compressedSize)
              ? `Compressed to ${formatBytes(result.compressedSize)}, ${savingsPercent(result.originalSize, result.compressedSize)} percent smaller`
              : "This PDF's structure is already efficient, so there was nothing left to strip out"}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Nothing is re-encoded and no pages are changed, so the text stays selectable and the
        document reads exactly as it did. Everything runs in your browser, so the PDF is never
        uploaded. For a scan that has to get much smaller, re-scanning at a lower DPI does more
        than any rewrite can.
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

/**
 * Before and after side by side — the same shape the image compressor answers
 * with, since it's the same question, and the same honesty when the answer is
 * "nothing to gain here".
 */
function ResultCard({ result, working }: { result: Result | null; working: boolean }) {
  if (result === null) {
    return (
      <Card className="flex min-h-[104px] items-center justify-center p-6">
        <p className="text-[13px] text-muted">
          {working ? "Rewriting…" : "Before and after sizes will appear here."}
        </p>
      </Card>
    );
  }

  const saved = savingsPercent(result.originalSize, result.compressedSize);
  // A rewrite can come out smaller and still floor to 0%. That's a fact about
  // the file, not a failed run, so the card stops scoring and explains instead.
  const meaningful = isMeaningfulSaving(result.originalSize, result.compressedSize);

  return (
    <Card className={cn("p-4 transition-opacity duration-150", working && "opacity-60")}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Before" value={formatBytes(result.originalSize)} />
        <Stat label="After" value={formatBytes(result.compressedSize)} />
        <Stat
          label={meaningful ? "Saved" : "Difference"}
          value={meaningful ? `${saved}%` : "Already tight"}
          emphasis={meaningful}
        />
      </div>

      {!meaningful && (
        <p className="mt-4 border-t border-line-soft pt-3 text-[13px] leading-relaxed text-muted">
          This PDF&apos;s structure is already efficient — there were no leftover objects to drop
          and nothing left to pack tighter. Most of its size is the embedded images, which this
          tool deliberately doesn&apos;t re-encode, so the pages stay exactly as they are.{" "}
          {result.reduced
            ? "The download is the rebuilt file; it's a shade smaller, but not enough to be worth calling a saving."
            : "The download is your original file, untouched."}
        </p>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-mono text-[15px] tabular-nums",
          emphasis ? "text-accent-deep" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}
