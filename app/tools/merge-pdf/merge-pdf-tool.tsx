"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/ui/drop-zone";
import { formatBytes } from "@/lib/utils";

/**
 * Scaffold only — it collects files and lists them. The actual merge step is
 * intentionally not implemented yet.
 */
export function MergePdfTool() {
  const [files, setFiles] = useState<File[]>([]);

  return (
    <div className="space-y-4">
      <DropZone
        accept="application/pdf"
        multiple
        label="Drop PDFs here"
        hint="or click to browse — they stay on your device"
        onFiles={(incoming) => setFiles((current) => [...current, ...incoming])}
      />

      {files.length > 0 && (
        <div className="rounded-lg border border-line bg-surface">
          <ul className="divide-y divide-line-soft">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <span className="truncate text-sm text-ink">{file.name}</span>
                <span className="shrink-0 text-[13px] text-muted">{formatBytes(file.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button disabled={files.length < 2}>Merge PDFs</Button>
        <Button variant="secondary" disabled={files.length === 0} onClick={() => setFiles([])}>
          Clear
        </Button>
        {files.length > 0 && files.length < 2 && (
          <span className="text-[13px] text-muted">Add at least two files.</span>
        )}
      </div>

      <p className="text-[13px] text-muted">
        Merging isn’t wired up yet — this page exists to confirm the layout pattern.
      </p>
    </div>
  );
}
