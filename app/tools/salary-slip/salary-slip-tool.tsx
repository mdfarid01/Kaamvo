"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldGroup, SelectField, TextField } from "@/components/ui/field";
import { ACCEPT_ATTRIBUTE } from "@/lib/image-canvas";
import { loadLogo } from "@/lib/invoice";
import type { Logo } from "@/lib/invoice";
import { MONTHS, formatAmount } from "@/lib/pdf-text";
import {
  buildSalarySlipPdf,
  computePay,
  emptyPayRow,
  salarySlipFileName,
} from "@/lib/salary-slip";
import type { PayRow, SalarySlipDetails } from "@/lib/salary-slip";
import { bytesToBlob, cn } from "@/lib/utils";

/**
 * Form state and a download; the payslip is laid out in lib/salary-slip.ts. The
 * summary card and the numbers on the page both come out of computePay, so the
 * net pay on screen is the net pay on the page by construction.
 */

const INITIAL: SalarySlipDetails = {
  companyName: "",
  employeeName: "",
  designation: "",
  employeeId: "",
  month: MONTHS[0],
  year: "",
  // Both filled in on mount — see the effect below.
  earnings: [],
  deductions: [],
  logo: null,
};

/** The rows a payslip almost always has, so the form opens on a shape. */
const DEFAULT_EARNINGS = ["Basic", "HRA", "Allowances"];
const DEFAULT_DEDUCTIONS = ["PF", "Professional tax"];

export function SalarySlipTool() {
  const [details, setDetails] = useState<SalarySlipDetails>(INITIAL);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  // The current month can't be initial state: rendering it during the server
  // pass would bake the server's clock into the HTML.
  useEffect(() => {
    const now = new Date();
    setDetails((current) => ({
      ...current,
      month: MONTHS[now.getMonth()],
      year: current.year === "" ? `${now.getFullYear()}` : current.year,
      earnings:
        current.earnings.length === 0 ? DEFAULT_EARNINGS.map((label) => emptyPayRow(label)) : current.earnings,
      deductions:
        current.deductions.length === 0
          ? DEFAULT_DEDUCTIONS.map((label) => emptyPayRow(label))
          : current.deductions,
    }));
  }, []);

  const set = useCallback(
    <K extends keyof SalarySlipDetails>(key: K, value: SalarySlipDetails[K]) => {
      setDetails((current) => ({ ...current, [key]: value }));
      // Any edit invalidates a complaint about the last attempt.
      setError(null);
    },
    [],
  );

  const updateRow = useCallback(
    (kind: "earnings" | "deductions", id: string, patch: Partial<PayRow>) => {
      setDetails((current) => ({
        ...current,
        [kind]: current[kind].map((row) => (row.id === id ? { ...row, ...patch } : row)),
      }));
    },
    [],
  );

  const addRow = useCallback((kind: "earnings" | "deductions") => {
    setDetails((current) => ({ ...current, [kind]: [...current[kind], emptyPayRow()] }));
  }, []);

  const removeRow = useCallback((kind: "earnings" | "deductions", id: string) => {
    setDetails((current) => {
      const rows = current[kind].filter((row) => row.id !== id);
      // Never down to nothing — an empty table has no row to type into, and the
      // form would look broken.
      return { ...current, [kind]: rows.length === 0 ? [emptyPayRow()] : rows };
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

  // The preview is drawn from the same PNG bytes that go into the PDF.
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

  const totals = useMemo(
    () => computePay({ earnings: details.earnings, deductions: details.deductions }),
    [details.earnings, details.deductions],
  );

  const handleDownload = useCallback(async () => {
    setIsWorking(true);

    const result = await buildSalarySlipPdf(details);

    setIsWorking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = salarySlipFileName(details);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [details]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="Employer">
          <div className="space-y-3">
            <TextField
              label="Company name"
              value={details.companyName}
              onChange={(value) => set("companyName", value)}
              placeholder="Kaamvo Studio Pvt Ltd"
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

        <FieldGroup title="Employee">
          <div className="space-y-3">
            <TextField
              label="Employee name"
              value={details.employeeName}
              onChange={(value) => set("employeeName", value)}
              placeholder="Rahul Menon"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Designation"
                value={details.designation}
                onChange={(value) => set("designation", value)}
                placeholder="Senior Designer"
              />
              <TextField
                label="Employee ID"
                value={details.employeeId}
                onChange={(value) => set("employeeId", value)}
                placeholder="KV-0148"
                hint="Optional"
              />
            </div>
          </div>
        </FieldGroup>
      </div>

      <FieldGroup title="Pay period">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label="Month"
            value={details.month}
            onChange={(value) => set("month", value)}
            options={MONTHS.map((month) => ({ value: month, label: month }))}
          />
          <TextField
            label="Year"
            value={details.year}
            onChange={(value) => set("year", value)}
            placeholder="2026"
            numeric
          />
        </div>
      </FieldGroup>

      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="Earnings">
          <RowTable
            rows={details.earnings}
            placeholder="Basic"
            total={totals.gross}
            totalLabel="Gross earnings"
            onChange={(id, patch) => updateRow("earnings", id, patch)}
            onAdd={() => addRow("earnings")}
            onRemove={(id) => removeRow("earnings", id)}
          />
        </FieldGroup>

        <FieldGroup title="Deductions">
          <RowTable
            rows={details.deductions}
            placeholder="PF"
            total={totals.deductions}
            totalLabel="Total deductions"
            onChange={(id, patch) => updateRow("deductions", id, patch)}
            onAdd={() => addRow("deductions")}
            onRemove={(id) => removeRow("deductions", id)}
          />
        </FieldGroup>
      </div>

      <Card className="p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          On the payslip
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <Stat label="Gross earnings" value={`₹ ${formatAmount(totals.gross)}`} />
          <Stat label="Total deductions" value={`₹ ${formatAmount(totals.deductions)}`} />
          <Stat label="Net pay" value={`₹ ${formatAmount(totals.netPay)}`} emphasis />
        </dl>
      </Card>

      {error && <Notice message={error} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={isWorking} onClick={handleDownload}>
          {isWorking ? "Building…" : "Download payslip"}
        </Button>
        <span aria-live="polite" className="sr-only">
          {error ?? ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The payslip is typeset in your browser with pdf-lib — nothing you type and no logo you pick
        is uploaded, and the logo is held in memory only, until you close the tab. The rupee sign
        prints as &ldquo;Rs.&rdquo;, since the PDF uses a standard Latin font.
      </p>
    </div>
  );
}

/** One of the two amount tables: label, amount, remove, and a total underneath. */
function RowTable({
  rows,
  placeholder,
  total,
  totalLabel,
  onChange,
  onAdd,
  onRemove,
}: {
  rows: PayRow[];
  placeholder: string;
  total: number;
  totalLabel: string;
  onChange: (id: string, patch: Partial<PayRow>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const control =
    "h-10 w-full rounded-md border border-line bg-surface px-3 text-[14px] text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20";

  return (
    <div className="space-y-2">
      <div className="hidden gap-2 sm:grid sm:grid-cols-[1fr_120px_32px]">
        {["Label", "Amount", ""].map((label, index) => (
          <span
            key={label === "" ? `spacer-${index}` : label}
            className={cn(
              "text-[11px] font-medium uppercase tracking-[0.06em] text-muted",
              index === 1 && "text-right",
            )}
          >
            {label}
          </span>
        ))}
      </div>

      {rows.map((row) => (
        <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_120px_32px] sm:items-center">
          <input
            aria-label="Label"
            value={row.label}
            onChange={(event) => onChange(row.id, { label: event.target.value })}
            placeholder={placeholder}
            className={control}
          />
          <input
            aria-label="Amount"
            value={row.amount}
            onChange={(event) => onChange(row.id, { amount: event.target.value })}
            inputMode="decimal"
            placeholder="0.00"
            className={cn(control, "font-mono tabular-nums sm:text-right")}
          />
          <button
            type="button"
            onClick={() => onRemove(row.id)}
            disabled={rows.length <= 1}
            aria-label="Remove this row"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[18px] leading-none text-muted transition-colors hover:border-line hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            ×
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
        <Button variant="secondary" size="sm" onClick={onAdd}>
          Add row
        </Button>
        <p className="flex items-baseline gap-2 text-[13px] text-muted">
          {totalLabel}
          <span className="font-mono text-[14px] tabular-nums text-ink">
            ₹ {formatAmount(total)}
          </span>
        </p>
      </div>
    </div>
  );
}

/** A file input dressed as a button, the same one the Invoice Generator uses. */
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

      <p
        className={cn(
          "mt-1.5 text-[12px] leading-relaxed",
          error === null ? "text-muted" : "font-medium text-accent-deep",
        )}
      >
        {error ?? "Optional. JPG, PNG or WebP, drawn top-left of the page."}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-1.5 font-mono text-[15px] tabular-nums",
          emphasis ? "text-accent-deep" : "text-ink",
        )}
      >
        {value}
      </dd>
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
