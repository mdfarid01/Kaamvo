"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/ui/drop-zone";
import { FileSummary } from "@/components/ui/file-summary";
import { DIGEST_BITS, HASH_ALGORITHMS, hashBytes, hashText } from "@/lib/hash";
import type { Digests, HashAlgorithm } from "@/lib/hash";
import { cn, formatBytes } from "@/lib/utils";

/** Long enough to swallow a burst of typing, short enough to still read live. */
const DEBOUNCE_MS = 300;

const COPY_RESET_MS = 1600;

/**
 * A file this big takes a noticeable moment to read into memory, and Web Crypto
 * has no streaming digest to spread that over — so it's worth saying no rather
 * than locking the tab up for a minute.
 */
const MAX_FILE_BYTES = 256 * 1024 * 1024;

/** What the digests on screen were computed from, for labelling them. */
interface Source {
  kind: "text" | "file";
  label: string;
}

export function HashGeneratorTool() {
  const [text, setText] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [digests, setDigests] = useState<Digests | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHashing, setIsHashing] = useState(false);
  const [copied, setCopied] = useState<HashAlgorithm | null>(null);

  const copyTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  // A file wins over the box: it's the more deliberate of the two inputs, and
  // hashing both at once would leave two sets of digests with no way to tell
  // which is which.
  useEffect(() => {
    let active = true;

    const run = async () => {
      if (file !== null) {
        if (file.size > MAX_FILE_BYTES) {
          setDigests(null);
          setSource(null);
          setError(
            `${file.name} is ${formatBytes(file.size)} — this hashes files up to ${formatBytes(MAX_FILE_BYTES)}.`,
          );
          return;
        }

        setIsHashing(true);
        const bytes = await file.arrayBuffer();
        const outcome = await hashBytes(bytes);
        if (!active) return;

        setIsHashing(false);
        if (!outcome.ok) {
          setDigests(null);
          setSource(null);
          setError(outcome.error);
          return;
        }
        setDigests(outcome.digests);
        setSource({ kind: "file", label: file.name });
        setError(null);
        return;
      }

      if (debouncedText === "") {
        setDigests(null);
        setSource(null);
        setError(null);
        return;
      }

      const outcome = await hashText(debouncedText);
      if (!active) return;

      if (!outcome.ok) {
        setDigests(null);
        setSource(null);
        setError(outcome.error);
        return;
      }
      setDigests(outcome.digests);
      setSource({ kind: "text", label: "the text above" });
      setError(null);
    };

    // Digests settle a tick after they're asked for, so without this guard a
    // slower earlier input could land on top of a newer one.
    void run();

    return () => {
      active = false;
      setIsHashing(false);
    };
  }, [debouncedText, file]);

  // Any new input invalidates the "Copied" confirmation, which would otherwise
  // still be sitting under a digest the user has since replaced.
  useEffect(() => setCopied(null), [digests]);

  const handleFiles = useCallback((incoming: File[]) => {
    const next = incoming[0];
    if (next === undefined) return;
    setFile(next);
  }, []);

  const handleCopy = useCallback(async (algorithm: HashAlgorithm, digest: string) => {
    try {
      await navigator.clipboard.writeText(digest);
      setCopied(algorithm);
    } catch {
      // Denied permission or a non-secure context — the same context Web Crypto
      // needs, so this is worth reporting rather than faking.
      setCopied(null);
    }
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), COPY_RESET_MS);
  }, []);

  const handleClear = useCallback(() => {
    setText("");
    setDebouncedText("");
    setFile(null);
  }, []);

  const hasInput = text !== "" || file !== null;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="hash-generator-input" className="sr-only">
          Text to hash
        </label>
        <textarea
          id="hash-generator-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type or paste text to hash"
          spellCheck={false}
          disabled={file !== null}
          className="min-h-[160px] w-full resize-y rounded-lg border border-line bg-surface px-4 py-3 font-mono text-[13px] leading-relaxed text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20 disabled:opacity-50"
        />
      </div>

      {file !== null ? (
        <FileSummary
          name={file.name}
          detail={isHashing ? "Reading…" : formatBytes(file.size)}
          onRemove={() => setFile(null)}
        />
      ) : (
        <DropZone
          label="Or drop a file here"
          hint="or click to browse — it stays on your device"
          onFiles={handleFiles}
          className="min-h-[120px] py-6"
        />
      )}

      {file !== null && (
        <p className="text-[13px] text-muted">
          The file is what&rsquo;s being hashed — remove it to go back to the text box.
        </p>
      )}

      {error !== null && <ErrorNotice message={error} />}

      <div className="space-y-2">
        {HASH_ALGORITHMS.map((algorithm) => (
          <DigestRow
            key={algorithm}
            algorithm={algorithm}
            digest={digests?.[algorithm] ?? null}
            pending={isHashing}
            copied={copied === algorithm}
            onCopy={handleCopy}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={!hasInput} onClick={handleClear}>
          Clear
        </Button>
        {source !== null && !isHashing && (
          <span className="text-[13px] text-muted">Hashed {source.label}.</span>
        )}
        <span aria-live="polite" className="sr-only">
          {copied === null ? "" : `${copied} digest copied to clipboard`}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Digests come from your browser&rsquo;s own Web Crypto, on the text or file above — nothing is
        uploaded. Text is hashed as UTF-8, so these match what{" "}
        <span className="font-mono">shasum</span> prints for the same input. MD5 isn&rsquo;t offered:
        browsers deliberately leave it out, and it hasn&rsquo;t been safe to rely on for years.
      </p>
    </div>
  );
}

function DigestRow({
  algorithm,
  digest,
  pending,
  copied,
  onCopy,
}: {
  algorithm: HashAlgorithm;
  digest: string | null;
  pending: boolean;
  copied: boolean;
  onCopy: (algorithm: HashAlgorithm, digest: string) => void;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          {/* A real space, not just a margin — this heading gets read aloud and
              copied as text, and "SHA-1160-bit" is neither. */}
          {algorithm}{" "}
          <span className="font-mono normal-case tracking-normal text-faint">
            {DIGEST_BITS[algorithm]}-bit
          </span>
        </h2>
        <Button
          variant="secondary"
          size="sm"
          disabled={digest === null}
          onClick={() => digest !== null && onCopy(algorithm, digest)}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <p
        className={cn(
          "mt-2 break-all font-mono text-[13px] leading-[1.6]",
          digest === null ? "text-faint" : "text-ink",
        )}
      >
        {digest ?? (pending ? "Hashing…" : "—")}
      </p>
    </div>
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
