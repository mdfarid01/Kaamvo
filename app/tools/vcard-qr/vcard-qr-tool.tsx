"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldGroup, TextField } from "@/components/ui/field";
import { DEFAULT_QR_SIZE, QR_PIXELS, QR_SIZES, generateQrPng } from "@/lib/qr-code";
import type { QrSize } from "@/lib/qr-code";
import { EMPTY_VCARD, buildVCard, hasContact, vCardFileName } from "@/lib/vcard";
import type { VCardDetails } from "@/lib/vcard";
import { cn } from "@/lib/utils";

/**
 * Form state and a download. The vCard text is built in lib/vcard.ts and encoded
 * by lib/qr-code.ts's generateQrPng, which takes any text — so this tool is the
 * QR Code Generator with a form in front of it instead of a textarea.
 *
 * The generated vCard is shown under the code on purpose: it's what a scanner
 * will save, and seeing it is the difference between trusting the code and
 * having to scan it to find out.
 */

const DEBOUNCE_MS = 300;

/** Matches the PNG's own pixel size, so the preview shows at 1:1. */
const PREVIEW_WIDTHS: Record<QrSize, string> = {
  small: "w-[200px]",
  medium: "w-[400px]",
  large: "w-[600px]",
};

interface Preview {
  dataUrl: string;
  name: string;
  size: QrSize;
}

export function VCardQrTool() {
  const [details, setDetails] = useState<VCardDetails>(EMPTY_VCARD);
  const [size, setSize] = useState<QrSize>(DEFAULT_QR_SIZE);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vcard = useMemo(() => (hasContact(details) ? buildVCard(details) : ""), [details]);
  const [debounced, setDebounced] = useState("");

  // Only the typing is debounced; a size click takes effect on the next render.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(vcard), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [vcard]);

  const name = details.name.trim();

  useEffect(() => {
    if (debounced === "") {
      setPreview(null);
      setError(null);
      return;
    }

    // The encode settles a tick after it's asked for, so this guard keeps a
    // slower earlier call from landing on top of a newer code.
    let active = true;

    generateQrPng(debounced, size).then((result) => {
      if (!active) return;
      if (result.ok) {
        setPreview({ dataUrl: result.dataUrl, name, size });
        setError(null);
        return;
      }
      setPreview(null);
      setError(result.error);
    });

    return () => {
      active = false;
    };
    // `name` only names the download, so it deliberately doesn't re-trigger the
    // encode on its own — the vCard text it came from already did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, size]);

  const set = useCallback(<K extends keyof VCardDetails>(key: K, value: VCardDetails[K]) => {
    setDetails((current) => ({ ...current, [key]: value }));
  }, []);

  // The PNG is already a data URL, so the download is a click on a throwaway
  // anchor — no blob to allocate and revoke.
  const handleDownload = useCallback(() => {
    if (!preview) return;

    const link = document.createElement("a");
    link.href = preview.dataUrl;
    link.download = vCardFileName({ ...EMPTY_VCARD, name: preview.name });
    link.click();
  }, [preview]);

  const handleClear = useCallback(() => {
    setDetails(EMPTY_VCARD);
    // Skips the debounce, so clearing empties the preview at once.
    setDebounced("");
  }, []);

  return (
    <div className="space-y-4">
      <FieldGroup title="Contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Name"
            value={details.name}
            onChange={(value) => set("name", value)}
            placeholder="Anita Rao"
            hint="The only field a contact card needs."
          />
          <TextField
            label="Phone"
            value={details.phone}
            onChange={(value) => set("phone", value)}
            placeholder="+91 98765 43210"
            hint="Optional — include the country code."
          />
          <TextField
            label="Email"
            value={details.email}
            onChange={(value) => set("email", value)}
            placeholder="anita@example.com"
            hint="Optional"
          />
          <TextField
            label="Company"
            value={details.company}
            onChange={(value) => set("company", value)}
            placeholder="Kaamvo Studio"
            hint="Optional"
          />
          <TextField
            label="Job title"
            value={details.jobTitle}
            onChange={(value) => set("jobTitle", value)}
            placeholder="Product Designer"
            hint="Optional"
            className="sm:col-span-2"
          />
        </div>
      </FieldGroup>

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

      {error && <Notice message={error} />}

      <Card className="flex min-h-[260px] items-center justify-center p-6">
        {preview ? (
          /* eslint-disable-next-line @next/next/no-img-element -- the source is
             a data URL encoded in the browser; there is nothing for next/image
             to fetch or optimize. */
          <img
            src={preview.dataUrl}
            alt={`Contact QR code for ${preview.name}`}
            width={QR_PIXELS[preview.size]}
            height={QR_PIXELS[preview.size]}
            className={cn("h-auto max-w-full", PREVIEW_WIDTHS[preview.size])}
          />
        ) : (
          <p className="text-[13px] text-muted">
            Type a name and your contact QR code will appear here.
          </p>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={preview === null} onClick={handleDownload}>
          Download PNG
        </Button>
        <Button variant="secondary" disabled={!hasContact(details)} onClick={handleClear}>
          Clear
        </Button>
        <span aria-live="polite" className="sr-only">
          {preview ? `Contact QR code ready for ${preview.name}` : ""}
        </span>
      </div>

      {vcard !== "" && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            What the code contains
          </h2>
          <pre className="mt-3 overflow-x-auto font-mono text-[12px] leading-relaxed text-ink">
            {vcard.replace(/\r\n/g, "\n").trimEnd()}
          </pre>
        </div>
      )}

      <p className="text-[13px] leading-relaxed text-muted">
        This is a vCard, the format a phone recognises as a contact — point a camera at the code and
        the phone offers to save the details straight into the address book, with no app and no link
        to open. Print it on a card or a badge, or show it on screen. Everything is encoded in your
        browser and nothing you type is uploaded.
      </p>
    </div>
  );
}

/**
 * Tinted accent when idle, solid accent when selected — the same control the QR
 * Code Generator uses.
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

/** Same accent-tinted panel the other tools use for inline messages. */
function Notice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-accent bg-accent/[0.06] px-4 py-3">
      <p className="text-[13px] font-medium leading-relaxed text-accent-deep">{message}</p>
    </div>
  );
}
