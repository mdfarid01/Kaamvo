"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { FieldGroup, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { ACCEPT_ATTRIBUTE } from "@/lib/image-canvas";
import { loadLogo } from "@/lib/invoice";
import type { Logo } from "@/lib/invoice";
import {
  BASIS_OPTIONS,
  DEFAULT_ACCEPTANCE_LABEL,
  DEFAULT_CLOSING_PARAGRAPH,
  DEFAULT_GOVERNING_PARAGRAPH,
  DEFAULT_OFFER_PARAGRAPH,
  DEFAULT_SALUTATION,
  DEFAULT_SIGN_OFF,
  DEFAULT_SUBJECT_LINE,
  DEFAULT_TERMS_HEADING,
  TEMPLATE_TOKENS,
  buildOfferLetterPdf,
  compensationLabel,
  offerLetterFileName,
  renderOfferParagraph,
} from "@/lib/offer-letter";
import type { CompensationBasis, OfferLetterDetails } from "@/lib/offer-letter";
import { todayValue } from "@/lib/pdf-text";
import { bytesToBlob, cn } from "@/lib/utils";

/**
 * Form state and a download; the letter is typeset in lib/offer-letter.ts. The
 * preview card here restates the four things the letter turns into prose —
 * position, joining date, pay and who signs — because those are the parts a
 * candidate reads first and the easiest to leave half filled.
 */

const INITIAL: OfferLetterDetails = {
  companyName: "",
  companyAddress: "",
  candidateName: "",
  position: "",
  joiningDate: "",
  compensation: "",
  compensationBasis: "annual",
  terms: "",
  issuerName: "",
  issuerTitle: "",
  // Filled in on mount, not here: rendering today's date during the server pass
  // would put the server's date in the HTML for the browser to replace.
  date: "",
  logo: null,
  signature: null,
  // The stock phrasing, put in the fields rather than left implicit — it's the
  // text most people keep, and it shows what the fields are for.
  salutation: DEFAULT_SALUTATION,
  subjectLine: DEFAULT_SUBJECT_LINE,
  offerParagraph: DEFAULT_OFFER_PARAGRAPH,
  governingParagraph: DEFAULT_GOVERNING_PARAGRAPH,
  termsHeading: DEFAULT_TERMS_HEADING,
  closingParagraph: DEFAULT_CLOSING_PARAGRAPH,
  signOff: DEFAULT_SIGN_OFF,
  acceptanceLabel: DEFAULT_ACCEPTANCE_LABEL,
};

/** The keys that hold an uploaded image, so the picker below can serve both. */
type ImageKey = "logo" | "signature";

/**
 * One upload slot: normalise the file, hold the error, and keep a blob URL for
 * the preview alive. The logo and the signature want exactly the same handling,
 * so they share this — the same hook the Certificate Maker uses.
 */
function useImageSlot(
  image: Logo | null,
  setDetails: Dispatch<SetStateAction<OfferLetterDetails>>,
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

  // Drawn from the same PNG bytes that go into the PDF.
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

export function OfferLetterTool() {
  const [details, setDetails] = useState<OfferLetterDetails>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const logoSlot = useImageSlot(details.logo, setDetails, "logo");
  const signatureSlot = useImageSlot(details.signature, setDetails, "signature");

  useEffect(() => {
    setDetails((current) => ({
      ...current,
      date: current.date === "" ? todayValue() : current.date,
    }));
  }, []);

  const set = useCallback(
    <K extends keyof OfferLetterDetails>(key: K, value: OfferLetterDetails[K]) => {
      setDetails((current) => ({ ...current, [key]: value }));
      // Any edit invalidates a complaint about the last attempt.
      setError(null);
    },
    [],
  );

  const handleDownload = useCallback(async () => {
    setIsWorking(true);

    const result = await buildOfferLetterPdf(details);

    setIsWorking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = offerLetterFileName(details);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [details]);

  const pay = compensationLabel(details);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="Letterhead">
          <div className="space-y-3">
            <TextField
              label="Company name"
              value={details.companyName}
              onChange={(value) => set("companyName", value)}
              placeholder="Kaamvo Studio Pvt Ltd"
            />
            <TextAreaField
              label="Company address"
              value={details.companyAddress}
              onChange={(value) => set("companyAddress", value)}
              placeholder={"12 Nehru Road, Pune 411001\nhello@kaamvo.example"}
              hint="Optional"
            />
            <ImagePicker
              label="Logo"
              hint="Optional. JPG, PNG or WebP, drawn at the top of the letterhead."
              slot={logoSlot}
            />
          </div>
        </FieldGroup>

        <FieldGroup title="Candidate & role">
          <div className="space-y-3">
            <TextField
              label="Candidate name"
              value={details.candidateName}
              onChange={(value) => set("candidateName", value)}
              placeholder="Priya Sharma"
            />
            <TextField
              label="Position"
              value={details.position}
              onChange={(value) => set("position", value)}
              placeholder="Product Designer"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Joining date"
                type="date"
                value={details.joiningDate}
                onChange={(value) => set("joiningDate", value)}
              />
              <TextField
                label="Letter date"
                type="date"
                value={details.date}
                onChange={(value) => set("date", value)}
              />
            </div>
          </div>
        </FieldGroup>
      </div>

      <FieldGroup title="Compensation">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="Amount"
            value={details.compensation}
            onChange={(value) => set("compensation", value)}
            placeholder="1200000"
            numeric
            hint="Optional — left out of the letter when blank"
          />
          <SelectField
            label="Basis"
            value={details.compensationBasis}
            onChange={(value) => set("compensationBasis", value as CompensationBasis)}
            options={BASIS_OPTIONS}
          />
        </div>
      </FieldGroup>

      <FieldGroup title="Terms & signature">
        <div className="space-y-3">
          <TextAreaField
            label="Terms & notes"
            value={details.terms}
            onChange={(value) => set("terms", value)}
            placeholder={
              "Your employment is subject to verification of your documents and references.\n\nThe first three months are a probation period, during which either side may end the engagement with two weeks' notice."
            }
            rows={7}
            hint="Optional. A blank line starts a new paragraph."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Issued by"
              value={details.issuerName}
              onChange={(value) => set("issuerName", value)}
              placeholder="Aarti Iyer"
            />
            <TextField
              label="Issuer's title"
              value={details.issuerTitle}
              onChange={(value) => set("issuerTitle", value)}
              placeholder="Head of People"
            />
          </div>
          <ImagePicker
            label="Signature"
            hint="Optional — a scan or a PNG with a transparent background, printed on the issuer's signature line. Leave it out to sign by hand."
            slot={signatureSlot}
          />
        </div>
      </FieldGroup>

      <FieldGroup title="The letter's wording">
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-muted">
            Every fixed sentence in the letter is here to rewrite. Use{" "}
            {TEMPLATE_TOKENS.map((token, index) => (
              <span key={token}>
                {index === 0 ? "" : ", "}
                <code className="rounded bg-canvas px-1 font-mono text-[11px] text-ink">
                  {`{${token}}`}
                </code>
              </span>
            ))}{" "}
            to drop in what you typed above, and put a run in [square brackets] to have it
            disappear when the value inside it is blank.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Salutation"
              value={details.salutation}
              onChange={(value) => set("salutation", value)}
              placeholder={DEFAULT_SALUTATION}
            />
            <TextField
              label="Subject line"
              value={details.subjectLine}
              onChange={(value) => set("subjectLine", value)}
              placeholder={DEFAULT_SUBJECT_LINE}
            />
          </div>

          <TextAreaField
            label="Offer paragraph"
            value={details.offerParagraph}
            onChange={(value) => set("offerParagraph", value)}
            placeholder={DEFAULT_OFFER_PARAGRAPH}
            rows={4}
            hint="Leave blank to drop this paragraph."
          />
          <TextAreaField
            label="Terms preamble"
            value={details.governingParagraph}
            onChange={(value) => set("governingParagraph", value)}
            placeholder={DEFAULT_GOVERNING_PARAGRAPH}
            rows={4}
            hint="Leave blank to drop this paragraph."
          />
          <TextAreaField
            label="Closing paragraph"
            value={details.closingParagraph}
            onChange={(value) => set("closingParagraph", value)}
            placeholder={DEFAULT_CLOSING_PARAGRAPH}
            rows={3}
            hint="Leave blank to drop this paragraph."
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label="Terms heading"
              value={details.termsHeading}
              onChange={(value) => set("termsHeading", value)}
              placeholder={DEFAULT_TERMS_HEADING}
            />
            <TextField
              label="Sign-off"
              value={details.signOff}
              onChange={(value) => set("signOff", value)}
              placeholder={DEFAULT_SIGN_OFF}
            />
            <TextField
              label="Acceptance line"
              value={details.acceptanceLabel}
              onChange={(value) => set("acceptanceLabel", value)}
              placeholder={DEFAULT_ACCEPTANCE_LABEL}
            />
          </div>
        </div>
      </FieldGroup>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          In the letter
        </h2>
        <p className="mt-3 text-[13px] leading-relaxed text-ink">
          {previewSentence(details, pay)}
        </p>
      </div>

      {error && <Notice message={error} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={isWorking} onClick={handleDownload}>
          {isWorking ? "Building…" : "Download letter"}
        </Button>
        <span aria-live="polite" className="sr-only">
          {error ?? ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The letter is typeset in your browser with pdf-lib and leaves ruled lines for both
        signatures — print it, sign it, and it&apos;s ready to send. Nothing you type and no logo you
        pick is uploaded. This is a starting point, not legal advice: read the terms before you send
        one.
      </p>
    </div>
  );
}

/**
 * The offer paragraph exactly as the PDF will phrase it — run through the same
 * template filler, so a rewritten sentence shows up here before it prints.
 * Gaps are shown as blanks rather than left empty.
 */
function previewSentence(details: OfferLetterDetails, pay: string): string {
  const filled = renderOfferParagraph({
    ...details,
    candidateName: details.candidateName.trim() === "" ? "the candidate" : details.candidateName,
    position: details.position.trim() === "" ? "_____" : details.position,
    companyName: details.companyName.trim() === "" ? "_____" : details.companyName,
  });

  if (filled !== "") return filled;
  return pay === "" ? "The offer paragraph is blank." : `Compensation: ${pay}.`;
}

/**
 * A file input dressed as a button, the same one the Invoice Generator uses.
 * Both slots render this; only the label and the hint under it differ.
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
