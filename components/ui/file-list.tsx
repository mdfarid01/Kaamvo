"use client";

import { useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { cn, formatBytes } from "@/lib/utils";

/**
 * The reorderable file list behind Merge PDF and Image to PDF. Both tools put
 * files in an order that the output depends on, so the list owns the dragging,
 * the keyboard equivalent and the numbering, and the tools only own what a row
 * says about a file.
 *
 * Reordering is reported as a from/to pair rather than a new array — the tools
 * hold richer entries than a row shows, and lib/utils' moveItem does the move.
 */

export interface FileListItem {
  id: string;
  name: string;
  size: number;
  /** Second line: page count, pixel size, or why the file was rejected. */
  detail?: string;
  /** A preview square. Left out for files that have nothing to show. */
  thumbnailUrl?: string;
  /** Rejected files stay in the list, flagged, instead of vanishing silently. */
  invalid?: boolean;
  /** Still being read, so its detail line isn't final yet. */
  pending?: boolean;
}

interface FileListProps {
  items: FileListItem[];
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  /** Singular, lower case, for the labels: "PDF", "image". */
  noun: string;
}

export function FileList({ items, onMove, onRemove, noun }: FileListProps) {
  // The id, not the index: the list reorders underneath a drag in progress, and
  // an index captured at dragstart would be pointing at the wrong row by the
  // second swap.
  const draggingId = useRef<string | null>(null);
  const [draggingRow, setDraggingRow] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const move = (from: number, to: number, name: string) => {
    onMove(from, to);
    setAnnouncement(`${name} moved to position ${to + 1} of ${items.length}.`);
  };

  const handleDragOver = (event: DragEvent<HTMLLIElement>, index: number) => {
    // Without preventDefault this position never becomes a valid drop target.
    event.preventDefault();

    const id = draggingId.current;
    if (id === null) return;

    const from = items.findIndex((item) => item.id === id);
    if (from === -1 || from === index) return;

    // Swapping the moment the pointer touches a row makes a tall row flicker
    // between two places; waiting for its midpoint gives each swap a full row
    // of travel before the next one can undo it.
    const box = event.currentTarget.getBoundingClientRect();
    const pastMiddle = event.clientY > box.top + box.height / 2;
    if (index > from && !pastMiddle) return;
    if (index < from && pastMiddle) return;

    onMove(from, index);
  };

  const endDrag = () => {
    draggingId.current = null;
    setDraggingRow(null);
  };

  // Only the files that will end up in the output are numbered, so a rejected
  // one can't imply it's page 3 of the result.
  let position = 0;

  return (
    <div className="rounded-lg border border-line bg-surface">
      <ul
        aria-label={`${noun}s to combine, in order`}
        className="divide-y divide-line-soft"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => event.preventDefault()}
      >
        {items.map((item, index) => {
          if (!item.invalid) position += 1;

          return (
            <li
              key={item.id}
              draggable
              onDragStart={(event) => {
                draggingId.current = item.id;
                setDraggingRow(item.id);
                event.dataTransfer.effectAllowed = "move";
                // Firefox won't start a drag without data on the transfer.
                event.dataTransfer.setData("text/plain", item.id);
              }}
              onDragOver={(event) => handleDragOver(event, index)}
              onDragEnd={endDrag}
              onDrop={endDrag}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 transition-colors duration-150",
                draggingRow === item.id && "bg-accent/[0.06]",
              )}
            >
              <Grip />

              <span
                aria-hidden={item.invalid}
                className={cn(
                  "w-5 shrink-0 text-right font-mono text-[13px] tabular-nums",
                  item.invalid ? "text-faint" : "text-muted",
                )}
              >
                {item.invalid ? "—" : position}
              </span>

              {item.thumbnailUrl !== undefined && <Thumbnail url={item.thumbnailUrl} name={item.name} />}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{item.name}</p>
                <p
                  className={cn(
                    "mt-0.5 truncate text-[13px]",
                    item.invalid ? "text-accent-deep" : "text-muted",
                  )}
                >
                  {item.detail ?? formatBytes(item.size)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {/* The keyboard route to the same reorder — a drag handle on its
                    own would leave the order unreachable without a mouse. */}
                <IconButton
                  label={`Move ${item.name} up`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1, item.name)}
                >
                  <ArrowUp />
                </IconButton>
                <IconButton
                  label={`Move ${item.name} down`}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, index + 1, item.name)}
                >
                  <ArrowDown />
                </IconButton>
                <button
                  type="button"
                  onClick={() => {
                    onRemove(item.id);
                    setAnnouncement(`${item.name} removed.`);
                  }}
                  className="ml-1 rounded-md px-2 py-1 text-[13px] font-medium text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

/** Thumbnails are square and cropped, so rows keep one height whatever's in them. */
function Thumbnail({ url, name }: { url: string; name: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-line-soft bg-canvas">
      {url === "" ? (
        <span aria-hidden="true" className="text-[13px] text-faint">
          ?
        </span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- a blob URL for a
           local file; there is nothing for next/image to fetch or optimize. */
        <img src={url} alt={`Preview of ${name}`} className="h-full w-full object-cover" />
      )}
    </span>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition-colors hover:border-line hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Signals "this row can be dragged"; the drag itself is on the whole row. */
function Grip() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 16"
      className="h-4 w-2.5 shrink-0 cursor-grab text-faint"
      fill="currentColor"
    >
      <circle cx="2" cy="4" r="1" />
      <circle cx="8" cy="4" r="1" />
      <circle cx="2" cy="8" r="1" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="2" cy="12" r="1" />
      <circle cx="8" cy="12" r="1" />
    </svg>
  );
}

function ArrowUp() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 14 14"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 11.5V2.5M3 6.5 7 2.5l4 4" />
    </svg>
  );
}

function ArrowDown() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 14 14"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 2.5v9M3 7.5l4 4 4-4" />
    </svg>
  );
}
