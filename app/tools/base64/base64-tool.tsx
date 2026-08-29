"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/ui/drop-zone";
import { FileSummary } from "@/components/ui/file-summary";
import {
  decodeBase64,
  decodedFileName,
  encodeBytes,
  encodeText,
  encodedFileName,
} from "@/lib/base64";
import { bytesToBlob, cn, formatBytes } from "@/lib/utils";

/** Long enough to swallow a burst of typing, short enough to still read live. */
const DEBOUNCE_MS = 300;

const COPY_RESET_MS = 1600;

/**
 * Base64 is a third larger than the bytes it carries, and both the input and
 * the output have to be strings in memory at once — so the ceiling here is
 * lower than a tool that just hashes what it reads.
 */
const MAX_FILE_BYTES = 64 * 1024 * 1024;

type Direction = "encode" | "decode";

type CopyState = "idle" | "copied" | "failed";

const COPY_LABELS: Record<CopyState, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

const DIRECTIONS: Array<{ direction: Direction; label: string }> = [
  { direction: "encode", label: "Encode" },
  { direction: "decode", label: "Decode" },
];

const COPY: Record<
  Direction,
  { inputLabel: string; outputLabel: string; placeholder: string; dropHint: string }
> = {
  encode: {
    inputLabel: "Text to encode",
    outputLabel: "Base64",
    placeholder: "Type or paste text to encode",
    // Encoding reads the file as bytes, so any format works.
    dropHint: "any file — it stays on your device",
  },
  decode: {
    inputLabel: "Base64 to decode",
    outputLabel: "Decoded",
    placeholder: "Paste Base64 to decode — line breaks and URL-safe -_ are fine",
    // Decoding reads the file as text, because what's in it is Base64.
    dropHint: "a text file holding Base64",
  },
};

/**
 * What the output panel is showing. `text` is null when the decoded bytes
 * aren't UTF-8: there's nothing to put in the box or on the clipboard, but the
 * download is still exactly right.
 */
interface Output {
  text: string | null;
  blob: Blob;
  fileName: string;
  byteLength: number;
}

export function Base64Tool() {
  const [direction, setDirection] = useState<Direction>("encode");
  const [text, setText] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [output, setOutput] = useState<Output | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const copyTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copy = COPY[direction];

  // A file wins over the box, same as the hash tool: it's the more deliberate
  // of the two inputs, and converting both would leave two outputs with no way
  // to tell which is which.
  useEffect(() => {
    let active = true;

    const run = async () => {
      const settle = (next: Output | null, message: string | null) => {
        if (!active) return;
        setOutput(next);
        setError(message);
        setIsWorking(false);
      };

      if (file !== null) {
        if (file.size > MAX_FILE_BYTES) {
          settle(
            null,
            `${file.name} is ${formatBytes(file.size)} — this converts files up to ${formatBytes(MAX_FILE_BYTES)}.`,
          );
          return;
        }

        setIsWorking(true);

        if (direction === "encode") {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const encoded = encodeBytes(bytes);
          settle(
            {
              text: encoded,
              blob: new Blob([encoded], { type: "text/plain" }),
              fileName: encodedFileName(file.name),
              byteLength: encoded.length,
            },
            null,
          );
          return;
        }

        const decoded = decodeBase64(await file.text());
        if (!decoded.ok) {
          settle(null, decoded.error);
          return;
        }
        settle(toDecodedOutput(decoded.bytes, decoded.text, file.name), null);
        return;
      }

      if (debouncedText === "") {
        settle(null, null);
        return;
      }

      if (direction === "encode") {
        const encoded = encodeText(debouncedText);
        settle(
          {
            text: encoded,
            blob: new Blob([encoded], { type: "text/plain" }),
            fileName: encodedFileName(null),
            byteLength: encoded.length,
          },
          null,
        );
        return;
      }

      const decoded = decodeBase64(debouncedText);
      if (!decoded.ok) {
        settle(null, decoded.error);
        return;
      }
      settle(toDecodedOutput(decoded.bytes, decoded.text, null), null);
    };

    // A file read settles a tick after it's asked for, so without the guard a
    // slower earlier input could land on top of a newer one.
    void run();

    return () => {
      active = false;
    };
  }, [debouncedText, direction, file]);

  // A new output invalidates the "Copied" confirmation, which would otherwise
  // sit under text the user has since replaced.
  useEffect(() => setCopyState("idle"), [output]);

  const handleFiles = useCallback((incoming: File[]) => {
    const next = incoming[0];
    if (next === undefined) return;
    setFile(next);
  }, []);

  const handleCopy = useCallback(async () => {
    if (output?.text == null) return;

    try {
      await navigator.clipboard.writeText(output.text);
      setCopyState("copied");
    } catch {
      // Denied permission or a non-secure context — say so instead of
      // silently pretending the copy worked.
      setCopyState("failed");
    }
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState("idle"), COPY_RESET_MS);
  }, [output]);

  const handleDownload = useCallback(() => {
    if (output === null) return;

    const url = URL.createObjectURL(output.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = output.fileName;
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [output]);

  const handleClear = useCallback(() => {
    setText("");
    setDebouncedText("");
    setFile(null);
  }, []);

  /**
   * Sends the output back through as the input, which is how you check a round
   * trip without copying and pasting between two tabs.
   */
  const handleUseAsInput = useCallback(() => {
    if (output?.text == null) return;
    setFile(null);
    setText(output.text);
    setDebouncedText(output.text);
    setDirection(direction === "encode" ? "decode" : "encode");
  }, [direction, output]);

  const hasInput = text !== "" || file !== null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Direction</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIRECTIONS.map((option) => (
            <DirectionButton
              key={option.direction}
              label={option.label}
              active={option.direction === direction}
              onClick={() => setDirection(option.direction)}
            />
          ))}
        </div>
      </div>

      <div>
        <label
          htmlFor="base64-input"
          className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted"
        >
          {copy.inputLabel}
        </label>
        <textarea
          id="base64-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={copy.placeholder}
          spellCheck={false}
          disabled={file !== null}
          className="mt-2 min-h-[160px] w-full resize-y rounded-lg border border-line bg-surface px-4 py-3 font-mono text-[13px] leading-relaxed text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20 disabled:opacity-50"
        />
      </div>

      {file !== null ? (
        <>
          <FileSummary
            name={file.name}
            detail={isWorking ? "Reading…" : formatBytes(file.size)}
            onRemove={() => setFile(null)}
          />
          <p className="text-[13px] text-muted">
            The file is what&rsquo;s being converted — remove it to go back to the text box.
          </p>
        </>
      ) : (
        <DropZone
          label="Or drop a file here"
          hint={copy.dropHint}
          onFiles={handleFiles}
          className="min-h-[120px] py-6"
        />
      )}

      {error !== null && <ErrorNotice message={error} />}

      <div>
        <label
          htmlFor="base64-output"
          className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted"
        >
          {copy.outputLabel}
        </label>
        {output?.text == null && output !== null ? (
          <BinaryNotice fileName={output.fileName} byteLength={output.byteLength} />
        ) : (
          <textarea
            id="base64-output"
            readOnly
            value={output?.text ?? ""}
            placeholder={isWorking ? "Working…" : "The result appears here."}
            spellCheck={false}
            className="mt-2 min-h-[160px] w-full resize-y rounded-lg border border-line bg-surface px-4 py-3 font-mono text-[13px] leading-relaxed text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={output?.text == null} onClick={handleCopy}>
          {COPY_LABELS[copyState]}
        </Button>
        <Button variant="secondary" disabled={output === null} onClick={handleDownload}>
          Download
        </Button>
        <Button variant="secondary" disabled={output?.text == null} onClick={handleUseAsInput}>
          {direction === "encode" ? "Decode this" : "Encode this"}
        </Button>
        <Button variant="secondary" disabled={!hasInput} onClick={handleClear}>
          Clear
        </Button>
        {output !== null && !isWorking && (
          <span className="text-[13px] text-muted">
            <span className="font-mono tabular-nums">{formatBytes(output.byteLength)}</span> out.
          </span>
        )}
        <span aria-live="polite" className="sr-only">
          {copyState === "copied" ? `${copy.outputLabel} copied to clipboard` : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Everything is converted in your browser — nothing is uploaded. Text goes through as UTF-8, so
        accents and emoji survive the round trip. Decoding accepts line breaks, missing{" "}
        <span className="font-mono">=</span> padding and the URL-safe{" "}
        <span className="font-mono">-_</span> alphabet, so Base64 copied out of a URL or a JWT works
        as-is.
      </p>
    </div>
  );
}

function toDecodedOutput(bytes: Uint8Array, text: string | null, sourceName: string | null): Output {
  return {
    text,
    // A generic type, because the bytes could be anything — claiming a specific
    // one would make the browser save it under the wrong extension.
    blob: bytesToBlob(bytes, "application/octet-stream"),
    fileName: decodedFileName(sourceName),
    byteLength: bytes.length,
  };
}

/** Shown in place of the output box when the decoded bytes aren't text. */
function BinaryNotice({ fileName, byteLength }: { fileName: string; byteLength: number }) {
  return (
    <div className="mt-2 rounded-lg border border-line bg-surface px-4 py-6 text-center">
      <p className="text-sm font-medium text-ink">
        <span className="font-mono tabular-nums">{formatBytes(byteLength)}</span> of data, not text
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
        The Base64 decoded cleanly, but the bytes aren&rsquo;t UTF-8 — it&rsquo;s an image, an
        archive or something similar. Download it as{" "}
        <span className="font-mono">{fileName}</span> to get the file itself.
      </p>
    </div>
  );
}

/**
 * Tinted accent when idle, solid accent when selected — the same toggle the QR
 * generator uses for its sizes.
 */
function DirectionButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        active
          ? "border-accent bg-accent text-canvas"
          : "border-transparent bg-accent/[0.10] text-accent-deep hover:border-accent",
      )}
    >
      {label}
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
