"use client";

import { useCallback, useRef, useState } from "react";
import type { DragEvent } from "react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  /** Handed the dropped or picked files. Nothing is uploaded anywhere. */
  onFiles?: (files: File[]) => void;
  /** Passed straight to the file input, e.g. "application/pdf" or "image/*". */
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}

export function DropZone({
  onFiles,
  accept,
  multiple = false,
  label = "Drop files here",
  hint = "or click to browse",
  disabled = false,
  className,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const emit = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      onFiles?.(Array.from(fileList));
    },
    [onFiles],
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    emit(event.dataTransfer.files);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    // Without preventDefault the browser navigates to the dropped file.
    event.preventDefault();
    // Only files light the zone up. Dragging a row of a reorderable list past
    // it is not a drop this zone can take, so it shouldn't look like one.
    if (!disabled && event.dataTransfer.types.includes("Files")) setIsDragging(true);
  };

  const open = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragging(false)}
      className={cn(
        "flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        isDragging ? "border-accent bg-accent/[0.04]" : "border-line bg-surface hover:border-ink",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="text-[13px] text-muted">{hint}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          emit(event.target.files);
          // Reset so picking the same file twice still fires onChange.
          event.target.value = "";
        }}
        className="hidden"
      />
    </div>
  );
}
