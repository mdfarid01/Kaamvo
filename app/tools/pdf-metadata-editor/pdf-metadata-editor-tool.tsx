"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropZone } from "@/components/ui/drop-zone";
import { FileSummary } from "@/components/ui/file-summary";
import { TextAreaField, TextField } from "@/components/ui/field";
import { pageWord } from "@/lib/page-ranges";
import { ACCEPT_ATTRIBUTE, loadPdf } from "@/lib/pdf-load";
import type { LoadedPdf } from "@/lib/pdf-load";
import {
  EMPTY_METADATA,
  readMetadata,
  readProvenance,
  splitKeywords,
  updatedFileName,
  writeMetadata,
} from "@/lib/pdf-metadata";
import type { Metadata, Provenance } from "@/lib/pdf-metadata";
import { formatBytes } from "@/lib/utils";

/**
 * Same shape as the other PDF tools', with one addition: the fields the file
 * arrived with, kept so the form can be put back to them.
 */
interface Entry {
  file: File;
  name: string;
  size: number;
  pdf: LoadedPdf | null;
  original?: Metadata;
  provenance?: Provenance;
  error?: string;
  pending: boolean;
}

export function PdfMetadataEditorTool() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [fields, setFields] = useState<Metadata>(EMPTY_METADATA);
  const [result, setResult] = useState<{ blob: Blob; sourceName: string } | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Which drop the tool is waiting on, so a slower earlier parse can't land on
  // top of a newer one — and, here, can't overwrite the form with its fields.
  const loading = useRef(0);

  const handleFiles = useCallback((incoming: File[]) => {
    const file = incoming[0];
    if (file === undefined) return;

    const token = (loading.current += 1);

    setEntry({ file, name: file.name, size: file.size, pdf: null, pending: true });
    setFields(EMPTY_METADATA);
    setResult(null);
    setError(null);
    setNotice(
      incoming.length > 1 ? `Only ${file.name} was taken — this tool edits one PDF.` : null,
    );

    void loadPdf(file).then((outcome) => {
      if (loading.current !== token) return;

      if (!outcome.ok) {
        setEntry((current) =>
          current?.file === file
            ? { ...current, pdf: null, pending: false, error: outcome.error }
            : current,
        );
        return;
      }

      // The form is filled in from the file, which is what makes this an editor
      // rather than a form that quietly wipes three fields to set a fourth.
      const original = readMetadata(outcome.pdf.doc);
      setFields(original);
      setEntry((current) =>
        current?.file === file
          ? {
              ...current,
              pdf: outcome.pdf,
              pending: false,
              original,
              provenance: readProvenance(outcome.pdf.doc),
            }
          : current,
      );
    });
  }, []);

  const handleRemove = useCallback(() => {
    loading.current += 1;
    setEntry(null);
    setFields(EMPTY_METADATA);
    setResult(null);
    setError(null);
    setNotice(null);
  }, []);

  const update = useCallback((patch: Partial<Metadata>) => {
    setFields((current) => ({ ...current, ...patch }));
    // Any edit makes the file already written stale.
    setResult(null);
    setError(null);
  }, []);

  const handleRevert = useCallback(() => {
    if (entry?.original === undefined) return;
    setFields(entry.original);
    setResult(null);
    setError(null);
  }, [entry]);

  const pdf = entry?.pdf ?? null;

  const handleSave = useCallback(async () => {
    if (entry === null || pdf === null) return;

    setIsWorking(true);
    setError(null);

    // Rewriting holds the main thread, so this yields once to let the button's
    // disabled state paint first.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const outcome = await writeMetadata(entry.file, fields);
    setIsWorking(false);

    if (!outcome.ok) {
      setResult(null);
      setError(outcome.error);
      return;
    }

    setResult({ blob: outcome.blob, sourceName: entry.name });
  }, [entry, fields, pdf]);

  const handleDownload = useCallback(() => {
    if (result === null) return;

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = updatedFileName(result.sourceName);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [result]);

  const keywordCount = splitKeywords(fields.keywords).length;

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

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          Document properties
        </h2>
        <div className="mt-4 space-y-4">
          <TextField
            label="Title"
            value={fields.title}
            onChange={(next) => update({ title: next })}
            placeholder="Quarterly report"
            hint="What a reader's tab and window title show, in place of the file name."
          />
          <TextField
            label="Author"
            value={fields.author}
            onChange={(next) => update({ author: next })}
            placeholder="Your name"
          />
          <TextField
            label="Subject"
            value={fields.subject}
            onChange={(next) => update({ subject: next })}
            placeholder="What the document is about"
          />
          <TextAreaField
            label="Keywords"
            value={fields.keywords}
            onChange={(next) => update({ keywords: next })}
            placeholder="report, 2026, finance"
            rows={2}
            hint={
              keywordCount === 0
                ? "Separate them with commas."
                : `${keywordCount} ${keywordCount === 1 ? "keyword" : "keywords"}, separated by commas.`
            }
          />
        </div>
      </div>

      {entry?.provenance && (entry.provenance.creator !== "" || entry.provenance.producer !== "") && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            Written by
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {[entry.provenance.creator, entry.provenance.producer].filter((v) => v !== "").join(" · ")}
            {" — left as it is; these say which program made the file."}
          </p>
        </div>
      )}

      {error && <ErrorNotice message={error} />}

      {result && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Saved</p>
            <p className="mt-1.5 text-[15px] text-ink">
              <span className="font-mono tabular-nums">{formatBytes(result.blob.size)}</span>
            </p>
          </div>
          <Button onClick={handleDownload}>Download PDF</Button>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pdf === null || isWorking} onClick={handleSave}>
          {isWorking ? "Saving…" : "Save properties"}
        </Button>
        <Button
          variant="secondary"
          disabled={entry?.original === undefined}
          onClick={handleRevert}
        >
          Reset to file
        </Button>
        <Button variant="secondary" disabled={entry === null} onClick={handleRemove}>
          Clear
        </Button>
        {entry?.pending === true && <span className="text-[13px] text-muted">Reading…</span>}
        <span aria-live="polite" className="sr-only">
          {result ? "Properties saved" : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        All four fields are written every time, so clearing one here clears it in the file. The pages
        themselves aren’t touched, and neither is the line saying which program produced the PDF. Any
        of this can still be read by anyone who opens the file — it’s a label, not a secret. It runs
        in your browser; nothing is uploaded.
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
