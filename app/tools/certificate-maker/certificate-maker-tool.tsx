"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { FieldGroup, SelectField, TextField } from "@/components/ui/field";
import {
  DEFAULT_EVENT_PREAMBLE,
  DEFAULT_PREAMBLE,
  DEFAULT_TITLE,
  TITLE_PRESETS,
  buildCertificatePdf,
  certificateFileName,
  eventPreambleOf,
  loadLogo,
  preambleOf,
  titleOf,
} from "@/lib/certificate";
import type { CertificateDetails, Logo } from "@/lib/certificate";
import { ACCEPT_ATTRIBUTE } from "@/lib/image-canvas";
import { formatDate, todayValue } from "@/lib/pdf-text";
import { bytesToBlob, cn } from "@/lib/utils";

/**
 * Form state and a download; the page itself is laid out in lib/certificate.ts.
 * The one thing this adds is the preview panel, which shows the same four lines
 * in the same order the PDF prints them — enough to catch a typo in a name
 * before a hundred of them go out, without redrawing the page in HTML.
 */

const INITIAL: CertificateDetails = {
  recipientName: "",
  title: DEFAULT_TITLE,
  eventName: "",
  // Filled in on mount, not here: today's date in initial state would bake the
  // server's clock into the server-rendered HTML.
  date: "",
  issuerName: "",
  signatureLabel: "",
  // The stock phrasing, put in the fields rather than left implicit — it's the
  // text most people keep, and it shows what the fields are for.
  preamble: DEFAULT_PREAMBLE,
  eventPreamble: DEFAULT_EVENT_PREAMBLE,
  logo: null,
  signatureImage: null,
};

/** The presets plus whatever the person types instead. */
const TITLE_OPTIONS = TITLE_PRESETS.map((title) => ({ value: title, label: title }));

/** The keys that hold an uploaded image, so the picker below can serve both. */
type ImageKey = "logo" | "signatureImage";

/**
 * One upload slot: normalise the file, hold the error, and keep a blob URL for
 * the preview alive. The logo and the signature want exactly the same handling,
 * so they share this rather than the file keeping two copies of it.
 */
function useImageSlot(
  image: Logo | null,
  setDetails: Dispatch<SetStateAction<CertificateDetails>>,
  key: ImageKey,
): {
  url: string | null;
  name: string | null;
  error: string | null;
  onPick: (file: File | undefined) => void;
  onClear: () => void;
} {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPick = useCallback(
    async (file: File | undefined) => {
      if (file === undefined) return;

      const result = await loadLogo(file);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setError(null);
      setDetails((current) => ({ ...current, [key]: result.logo }));
    },
    [setDetails, key],
  );

  const onClear = useCallback(() => {
    setError(null);
    setDetails((current) => ({ ...current, [key]: null }));
  }, [setDetails, key]);

  // Drawn from the same PNG bytes that go into the PDF, so what shows here is
  // what gets embedded.
  useEffect(() => {
    if (image === null) {
      setUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(bytesToBlob(image.data, "image/png"));
    setUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  return { url, name: image?.name ?? null, error, onPick, onClear };
}

export function CertificateMakerTool() {
  const [details, setDetails] = useState<CertificateDetails>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const logoSlot = useImageSlot(details.logo, setDetails, "logo");
  const signatureSlot = useImageSlot(details.signatureImage, setDetails, "signatureImage");

  useEffect(() => {
    setDetails((current) => ({
      ...current,
      date: current.date === "" ? todayValue() : current.date,
    }));
  }, []);

  const set = useCallback(
    <K extends keyof CertificateDetails>(key: K, value: CertificateDetails[K]) => {
      setDetails((current) => ({ ...current, [key]: value }));
      setError(null);
    },
    [],
  );

  const handleDownload = useCallback(async () => {
    setIsWorking(true);

    const result = await buildCertificatePdf(details);

    setIsWorking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = certificateFileName(details);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [details]);

  const isPreset = TITLE_PRESETS.includes(details.title);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="Certificate">
          <div className="space-y-3">
            <TextField
              label="Recipient name"
              value={details.recipientName}
              onChange={(value) => set("recipientName", value)}
              placeholder="Anita Rao"
              hint="Printed largest, in the middle of the page."
            />
            <SelectField
              label="Heading"
              value={isPreset ? details.title : ""}
              onChange={(value) => set("title", value)}
              options={
                isPreset ? TITLE_OPTIONS : [{ value: "", label: "Custom" }, ...TITLE_OPTIONS]
              }
            />
            <TextField
              label="Or type your own heading"
              value={details.title}
              onChange={(value) => set("title", value)}
              placeholder={DEFAULT_TITLE}
              hint="Optional — overrides the choice above."
            />
            <TextField
              label="Line above the name"
              value={details.preamble}
              onChange={(value) => set("preamble", value)}
              placeholder={DEFAULT_PREAMBLE}
              hint="Blank prints “This is to certify that”."
            />
          </div>
        </FieldGroup>

        <FieldGroup title="Event & issuer">
          <div className="space-y-3">
            <TextField
              label="Event or course name"
              value={details.eventName}
              onChange={(value) => set("eventName", value)}
              placeholder="Annual Science Exhibition 2026"
              hint="Optional."
            />
            <TextField
              label="Line above the event name"
              value={details.eventPreamble}
              onChange={(value) => set("eventPreamble", value)}
              placeholder={DEFAULT_EVENT_PREAMBLE}
              hint="Blank prints “in recognition of”."
            />
            <TextField
              label="Issuer or organisation"
              value={details.issuerName}
              onChange={(value) => set("issuerName", value)}
              placeholder="Kaamvo Public School"
              hint="Optional — printed under the signature line."
            />
            <ImagePicker
              label="Logo"
              hint="JPG, PNG or WebP. Centred at the top of the page and never uploaded."
              slot={logoSlot}
            />
          </div>
        </FieldGroup>
      </div>

      <FieldGroup title="Date & signature">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Date"
            type="date"
            value={details.date}
            onChange={(value) => set("date", value)}
          />
          <TextField
            label="Signature line label"
            value={details.signatureLabel}
            onChange={(value) => set("signatureLabel", value)}
            placeholder="Event Coordinator"
            hint="Optional — defaults to “Signature”."
          />
        </div>
        <div className="mt-3">
          <ImagePicker
            label="Signature image"
            hint="Optional — a scan or a PNG with a transparent background, printed on the signature line. Leave it out to sign by hand."
            slot={signatureSlot}
          />
        </div>
      </FieldGroup>

      <Preview details={details} logoUrl={logoSlot.url} signatureUrl={signatureSlot.url} />

      {error && <Notice message={error} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={isWorking} onClick={handleDownload}>
          {isWorking ? "Building…" : "Download certificate"}
        </Button>
        <span aria-live="polite" className="sr-only">
          {error ?? ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The certificate is typeset in your browser as a landscape A4 PDF with a printed border, so it
        needs no special paper — nothing you type and no image you pick is uploaded. The PDF uses a
        standard Latin font, so a name in another script prints as question marks.
      </p>
    </div>
  );
}

/**
 * The same lines the PDF draws, in the same order and with the same blanks
 * dropped — a proof of the text, not of the layout. The border and the centring
 * are worth showing at a glance, so it keeps both.
 */
function Preview({
  details,
  logoUrl,
  signatureUrl,
}: {
  details: CertificateDetails;
  logoUrl: string | null;
  signatureUrl: string | null;
}) {
  const name = details.recipientName.trim();
  const event = details.eventName.trim();
  const issuer = details.issuerName.trim();
  const date = formatDate(details.date);
  const signature = details.signatureLabel.trim() === "" ? "Signature" : details.signatureLabel.trim();

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Preview</h2>

      <div className="mt-4 border-2 border-accent p-1.5">
        <div className="flex min-h-[240px] flex-col items-center border border-line px-6 py-7 text-center">
          {logoUrl !== null && (
            /* eslint-disable-next-line @next/next/no-img-element -- a blob URL
               for bytes the visitor just picked; nothing for next/image to fetch
               or optimize. */
            <img src={logoUrl} alt="" className="mb-4 h-9 w-auto max-w-[130px] object-contain" />
          )}

          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink">
            {titleOf(details)}
          </p>
          <span className="mt-2 block h-[2px] w-12 bg-accent" />

          <p className="mt-5 text-[12px] text-muted">{preambleOf(details)}</p>
          <p className="mt-2 border-b border-line px-8 pb-1.5 text-[22px] font-semibold leading-tight text-accent-deep">
            {name === "" ? "Recipient name" : name}
          </p>

          {event !== "" && (
            <>
              <p className="mt-4 text-[12px] text-muted">{eventPreambleOf(details)}</p>
              <p className="mt-1 text-[14px] font-medium text-ink">{event}</p>
            </>
          )}

          <div className="mt-auto flex w-full items-end justify-between gap-6 pt-8">
            <FootBlock value={date} label="Date" />
            <FootBlock
              value={issuer}
              label={signature}
              align="right"
              signatureUrl={signatureUrl}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FootBlock({
  value,
  label,
  align = "left",
  signatureUrl = null,
}: {
  value: string;
  label: string;
  align?: "left" | "right";
  signatureUrl?: string | null;
}) {
  return (
    <div className={cn("min-w-[120px] text-center", align === "right" && "ml-auto")}>
      {signatureUrl !== null && (
        /* eslint-disable-next-line @next/next/no-img-element -- a blob URL for
           bytes the visitor just picked; nothing for next/image to fetch or
           optimize. */
        <img
          src={signatureUrl}
          alt=""
          className="mx-auto mb-0.5 h-8 w-auto max-w-[140px] object-contain"
        />
      )}
      <span className="block border-t border-ink pt-1.5 text-[12px] font-medium text-ink">
        {value === "" ? " " : value}
      </span>
      <span className="mt-0.5 block text-[10px] uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
    </div>
  );
}

/**
 * A file input dressed as a button, the same one the Invoice Generator uses —
 * a logo or a signature is one small file picked once, and a drop target for it
 * would dominate the form. Both slots render this; only the label and the hint
 * under it differ.
 */
function ImagePicker({
  label,
  hint,
  slot,
}: {
  label: string;
  hint: string;
  slot: ReturnType<typeof useImageSlot>;
}) {
  const { url, name, error, onPick, onClear } = slot;

  return (
    <div>
      <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </span>

      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-line px-4 text-sm font-medium text-ink transition-colors hover:border-ink focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-canvas">
          {url === null ? "Choose image" : "Replace"}
          <input
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            onChange={(event) => {
              onPick(event.target.files?.[0]);
              // Reset so picking the same file twice still fires onChange.
              event.target.value = "";
            }}
            className="sr-only"
          />
        </label>

        {url !== null && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL
                for bytes the visitor just picked; nothing for next/image to
                fetch or optimize. */}
            <img
              src={url}
              alt={name ?? `The chosen ${label.toLowerCase()}`}
              className="h-10 w-auto max-w-[120px] object-contain"
            />
            <Button variant="ghost" size="sm" onClick={onClear}>
              Remove
            </Button>
          </>
        )}
      </div>

      <p
        className={cn(
          "mt-1.5 text-[12px] leading-relaxed",
          error === null ? "text-muted" : "font-medium text-accent-deep",
        )}
      >
        {error ?? hint}
      </p>
    </div>
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
