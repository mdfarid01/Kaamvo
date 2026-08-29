"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldGroup, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { ACCEPT_ATTRIBUTE } from "@/lib/image-canvas";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  buildInvoicePdf,
  computeTotals,
  emptyItem,
  invoiceFileName,
  loadLogo,
  symbolFor,
} from "@/lib/invoice";
import type { InvoiceDetails, LineItem, Logo } from "@/lib/invoice";
import { formatAmount, todayValue } from "@/lib/pdf-text";
import { bytesToBlob, cn } from "@/lib/utils";

/**
 * Everything below is form state and a download. The arithmetic, the page
 * layout and the logo handling are all in lib/invoice.ts — the summary card here
 * and the numbers in the PDF both come out of computeTotals, so the total on
 * screen is the total on the page by construction rather than by care.
 */

const INITIAL: InvoiceDetails = {
  businessName: "",
  businessAddress: "",
  clientName: "",
  clientAddress: "",
  invoiceNumber: "",
  // Filled in on mount, not here: rendering today's date during the server pass
  // would put the server's date in the HTML for the browser to replace.
  date: "",
  dueDate: "",
  items: [],
  taxRate: "0",
  taxLabel: "GST",
  notes: "",
  currency: DEFAULT_CURRENCY,
  logo: null,
};

export function InvoiceGeneratorTool() {
  const [details, setDetails] = useState<InvoiceDetails>(INITIAL);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    setDetails((current) => ({
      ...current,
      date: current.date === "" ? todayValue() : current.date,
      // A blank first row, so the table is something to type into rather than
      // something to discover an "Add row" button for.
      items: current.items.length === 0 ? [emptyItem()] : current.items,
    }));
  }, []);

  const set = useCallback(
    <K extends keyof InvoiceDetails>(key: K, value: InvoiceDetails[K]) => {
      setDetails((current) => ({ ...current, [key]: value }));
      // Any edit invalidates a complaint about the last attempt.
      setError(null);
    },
    [],
  );

  const updateItem = useCallback((id: string, patch: Partial<LineItem>) => {
    setDetails((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }, []);

  const addItem = useCallback(() => {
    setDetails((current) => ({ ...current, items: [...current.items, emptyItem()] }));
  }, []);

  const removeItem = useCallback((id: string) => {
    setDetails((current) => {
      const items = current.items.filter((item) => item.id !== id);
      // Never down to nothing — an empty table has no row to type the next item
      // into, and the form would look broken.
      return { ...current, items: items.length === 0 ? [emptyItem()] : items };
    });
  }, []);

  const handleLogo = useCallback(async (file: File | undefined) => {
    if (file === undefined) return;

    const result = await loadLogo(file);
    if (!result.ok) {
      setLogoError(result.error);
      return;
    }

    setLogoError(null);
    setDetails((current) => ({ ...current, logo: result.logo }));
  }, []);

  const clearLogo = useCallback(() => {
    setLogoError(null);
    setDetails((current) => ({ ...current, logo: null }));
  }, []);

  // The preview is drawn from the same PNG bytes that go into the PDF, so what
  // you see here is what gets embedded.
  useEffect(() => {
    const logo: Logo | null = details.logo;
    if (logo === null) {
      setLogoUrl(null);
      return;
    }

    const url = URL.createObjectURL(bytesToBlob(logo.data, "image/png"));
    setLogoUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [details.logo]);

  const totals = useMemo(() => computeTotals(details.items, details.taxRate), [
    details.items,
    details.taxRate,
  ]);

  const symbol = symbolFor(details.currency);

  const handleDownload = useCallback(async () => {
    setIsWorking(true);

    const result = await buildInvoicePdf(details);

    setIsWorking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = invoiceFileName(details);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [details]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="From">
          <div className="space-y-3">
            <TextField
              label="Business name"
              value={details.businessName}
              onChange={(value) => set("businessName", value)}
              placeholder="Kaamvo Studio"
            />
            <TextAreaField
              label="Address & contact"
              value={details.businessAddress}
              onChange={(value) => set("businessAddress", value)}
              placeholder={"12 Nehru Road, Pune 411001\nGSTIN 27ABCDE1234F1Z5"}
            />
            <LogoPicker
              url={logoUrl}
              name={details.logo?.name ?? null}
              error={logoError}
              onPick={handleLogo}
              onClear={clearLogo}
            />
          </div>
        </FieldGroup>

        <FieldGroup title="Billed to">
          <div className="space-y-3">
            <TextField
              label="Client name"
              value={details.clientName}
              onChange={(value) => set("clientName", value)}
              placeholder="Acme Pvt Ltd"
            />
            <TextAreaField
              label="Client address"
              value={details.clientAddress}
              onChange={(value) => set("clientAddress", value)}
              placeholder={"Unit 4, MG Road\nBengaluru 560001"}
              rows={4}
            />
          </div>
        </FieldGroup>
      </div>

      <FieldGroup title="Invoice details">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Invoice number"
            value={details.invoiceNumber}
            onChange={(value) => set("invoiceNumber", value)}
            placeholder="2026-014"
          />
          <TextField
            label="Date"
            type="date"
            value={details.date}
            onChange={(value) => set("date", value)}
          />
          <TextField
            label="Due date"
            type="date"
            value={details.dueDate}
            onChange={(value) => set("dueDate", value)}
            hint="Optional"
          />
          <SelectField
            label="Currency"
            value={details.currency}
            onChange={(value) => set("currency", value)}
            options={CURRENCIES.map((entry) => ({ value: entry.value, label: entry.label }))}
            hint={details.currency === "INR" ? "Prints as “Rs.”" : undefined}
          />
        </div>
      </FieldGroup>

      <FieldGroup title="Line items">
        <div className="space-y-2">
          <ItemHeader />

          {details.items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              amount={`${symbol} ${formatAmount(totals.lineTotals[index] ?? 0)}`}
              onChange={(patch) => updateItem(item.id, patch)}
              onRemove={() => removeItem(item.id)}
              removable={details.items.length > 1}
            />
          ))}

          <div className="pt-1">
            <Button variant="secondary" size="sm" onClick={addItem}>
              Add row
            </Button>
          </div>
        </div>
      </FieldGroup>

      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="Tax & notes">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Tax label"
                value={details.taxLabel}
                onChange={(value) => set("taxLabel", value)}
                placeholder="GST"
              />
              <TextField
                label="Tax rate %"
                value={details.taxRate}
                onChange={(value) => set("taxRate", value)}
                placeholder="18"
                numeric
              />
            </div>
            <TextAreaField
              label="Notes"
              value={details.notes}
              onChange={(value) => set("notes", value)}
              placeholder="Payment due within 15 days. Bank transfer to A/C 0000 0000 0000."
            />
          </div>
        </FieldGroup>

        <Card className="p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Total</h2>
          <dl className="mt-4 space-y-2.5">
            <SummaryRow label="Subtotal" value={`${symbol} ${formatAmount(totals.subtotal)}`} />
            <SummaryRow
              label={`${details.taxLabel.trim() === "" ? "Tax" : details.taxLabel.trim()} (${trimZeros(totals.taxRate)}%)`}
              value={`${symbol} ${formatAmount(totals.tax)}`}
            />
            <div className="border-t border-line-soft pt-2.5">
              <SummaryRow
                label="Amount due"
                value={`${symbol} ${formatAmount(totals.total)}`}
                emphasis
              />
            </div>
          </dl>
        </Card>
      </div>

      {error && <Notice message={error} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={isWorking} onClick={handleDownload}>
          {isWorking ? "Building…" : "Download PDF"}
        </Button>
        <span aria-live="polite" className="sr-only">
          {error ?? ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The invoice is typeset in your browser with pdf-lib — nothing you type and no logo you pick
        is uploaded, and the logo is held in memory only, until you close the tab. The PDF uses a
        standard Latin font, so characters outside it print as a question mark.
      </p>
    </div>
  );
}

/** Column captions, on the wide layout only — the stacked rows label themselves. */
function ItemHeader() {
  return (
    <div className="hidden gap-2 sm:grid sm:grid-cols-[1fr_72px_104px_112px_32px]">
      {["Description", "Qty", "Rate", "Amount", ""].map((label, index) => (
        <span
          key={label === "" ? `spacer-${index}` : label}
          className={cn(
            "text-[11px] font-medium uppercase tracking-[0.06em] text-muted",
            index > 0 && index < 4 && "text-right",
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function ItemRow({
  item,
  amount,
  onChange,
  onRemove,
  removable,
}: {
  item: LineItem;
  amount: string;
  onChange: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const control =
    "h-10 w-full rounded-md border border-line bg-surface px-3 text-[14px] text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20";

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_72px_104px_112px_32px] sm:items-center">
      <input
        aria-label="Description"
        value={item.description}
        onChange={(event) => onChange({ description: event.target.value })}
        placeholder="Website design, 2 pages"
        className={control}
      />
      <input
        aria-label="Quantity"
        value={item.quantity}
        onChange={(event) => onChange({ quantity: event.target.value })}
        inputMode="decimal"
        placeholder="1"
        className={cn(control, "font-mono tabular-nums sm:text-right")}
      />
      <input
        aria-label="Rate"
        value={item.rate}
        onChange={(event) => onChange({ rate: event.target.value })}
        inputMode="decimal"
        placeholder="0.00"
        className={cn(control, "font-mono tabular-nums sm:text-right")}
      />
      <output className="flex h-10 items-center justify-end px-1 font-mono text-[14px] tabular-nums text-ink">
        {amount}
      </output>
      <button
        type="button"
        onClick={onRemove}
        disabled={!removable}
        aria-label="Remove this row"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[18px] leading-none text-muted transition-colors hover:border-line hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30"
      >
        ×
      </button>
    </div>
  );
}

/**
 * A file input dressed as a button, with the picked logo shown next to it. Not a
 * DropZone: a logo is one small file picked once, and a 200-pixel-tall drop
 * target for it would dominate a form this long.
 */
function LogoPicker({
  url,
  name,
  error,
  onPick,
  onClear,
}: {
  url: string | null;
  name: string | null;
  error: string | null;
  onPick: (file: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        Logo
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
              alt={name ?? "The chosen logo"}
              className="h-10 w-auto max-w-[120px] object-contain"
            />
            <Button variant="ghost" size="sm" onClick={onClear}>
              Remove
            </Button>
          </>
        )}
      </div>

      <p className={cn("mt-1.5 text-[12px] leading-relaxed", error === null ? "text-muted" : "font-medium text-accent-deep")}>
        {error ?? "JPG, PNG or WebP. Drawn top-left of the page and never uploaded."}
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn("text-[13px]", emphasis ? "font-medium text-ink" : "text-muted")}>
        {label}
      </dt>
      <dd
        className={cn(
          "font-mono tabular-nums",
          emphasis ? "text-[17px] text-accent-deep" : "text-[14px] text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** 18 rather than 18.00 in the tax caption. */
function trimZeros(value: number): string {
  return `${Math.round(value * 1000) / 1000}`;
}

/** Same accent-tinted panel the other tools use for inline messages. */
function Notice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-accent bg-accent/[0.06] px-4 py-3">
      <p className="text-[13px] font-medium leading-relaxed text-accent-deep">{message}</p>
    </div>
  );
}
