"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DEFAULT_QR_SIZE, QR_PIXELS, QR_SIZES, generateQrPng, qrFileName } from "@/lib/qr-code";
import type { QrSize } from "@/lib/qr-code";
import { cn } from "@/lib/utils";

/** Long enough to swallow a burst of typing, short enough to still read live. */
const DEBOUNCE_MS = 300;

/**
 * Rendered width of the preview, matching the PNG's own pixel size so it shows
 * at 1:1 instead of being scaled by the browser.
 */
const PREVIEW_WIDTHS: Record<QrSize, string> = {
  small: "w-[200px]",
  medium: "w-[400px]",
  large: "w-[600px]",
};

/**
 * What produced the current image, carried alongside it: the text names the
 * download, and the size sets the display width. Reading either from live state
 * instead would mislabel the code for the moment before a regenerate lands.
 */
interface Preview {
  dataUrl: string;
  text: string;
  size: QrSize;
}

export function QrGeneratorTool() {
  const [text, setText] = useState("");
  const [size, setSize] = useState<QrSize>(DEFAULT_QR_SIZE);
  const [debouncedText, setDebouncedText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();

  // Only the typing is debounced. A size click is deliberate, so it takes
  // effect on the next render rather than a third of a second later.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  useEffect(() => {
    if (debouncedText === "") {
      setPreview(null);
      setError(null);
      return;
    }

    // The encode settles a tick after it's asked for, so without this guard a
    // slower earlier call could land on top of a newer code.
    let active = true;

    generateQrPng(debouncedText, size).then((result) => {
      if (!active) return;
      if (result.ok) {
        setPreview({ dataUrl: result.dataUrl, text: debouncedText, size });
        setError(null);
        return;
      }
      // Nothing was encoded, so there is no code to leave on screen.
      setPreview(null);
      setError(result.error);
    });

    return () => {
      active = false;
    };
  }, [debouncedText, size]);

  // The PNG already exists as a data URL, so the download is a click on a
  // throwaway anchor — no blob to allocate and revoke.
  const handleDownload = useCallback(() => {
    if (!preview) return;

    const link = document.createElement("a");
    link.href = preview.dataUrl;
    link.download = qrFileName(preview.text);
    link.click();
  }, [preview]);

  const handleClear = useCallback(() => {
    setText("");
    // Skips the debounce, so clearing empties the preview at once.
    setDebouncedText("");
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="qr-generator-input" className="sr-only">
          Text or link to encode
        </label>
        <textarea
          id="qr-generator-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste a link, e.g. https://kaamvo.com — or any text"
          spellCheck={false}
          className="min-h-[140px] w-full resize-y rounded-lg border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
        />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Size</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QR_SIZES.map((option) => (
            <SizeButton
              key={option.size}
              label={option.label}
              pixels={QR_PIXELS[option.size]}
              active={option.size === size}
              onClick={() => setSize(option.size)}
            />
          ))}
        </div>
      </div>

      {error && <ErrorNotice message={error} />}

      <Card className="flex min-h-[260px] items-center justify-center p-6">
        {preview ? (
          /* eslint-disable-next-line @next/next/no-img-element -- the source is
             a data URL encoded in the browser; there is nothing for next/image
             to fetch or optimize. */
          <img
            src={preview.dataUrl}
            alt={describeCode(preview.text)}
            width={QR_PIXELS[preview.size]}
            height={QR_PIXELS[preview.size]}
            className={cn("h-auto max-w-full", PREVIEW_WIDTHS[preview.size])}
          />
        ) : (
          <p className="text-[13px] text-muted">Your QR code will appear here.</p>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={preview === null} onClick={handleDownload}>
          Download PNG
        </Button>
        <Button variant="secondary" disabled={text === ""} onClick={handleClear}>
          Clear
        </Button>
        <span aria-live="polite" className="sr-only">
          {preview
            ? `QR code ready, ${QR_PIXELS[preview.size]} by ${QR_PIXELS[preview.size]} pixels`
            : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The preview follows what you type and the code is encoded in your browser — the text never
        leaves your device. Medium error correction, which holds roughly two thousand characters.
      </p>
    </div>
  );
}

/** Clipped so a long paste doesn't turn into an unreadable alt attribute. */
const ALT_MAX_CHARS = 60;

function describeCode(text: string): string {
  const clipped = text.length > ALT_MAX_CHARS ? `${text.slice(0, ALT_MAX_CHARS)}…` : text;
  return `QR code for ${clipped}`;
}

/**
 * Tinted accent when idle, solid accent when selected — accent marks the
 * active state, and neither treatment needs a shadow to read as pressed.
 */
function SizeButton({
  label,
  pixels,
  active,
  onClick,
}: {
  label: string;
  pixels: number;
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
      <span className="font-mono text-[11px] tabular-nums opacity-70">{pixels}px</span>
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
