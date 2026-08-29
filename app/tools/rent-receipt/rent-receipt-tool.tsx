"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldGroup, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { MONTHS, formatAmount, parseNumber, todayValue } from "@/lib/pdf-text";
import {
  PAN_THRESHOLD,
  amountInWords,
  annualRent,
  buildRentReceiptPdf,
  isValidPan,
  periodLabel,
  receiptFileName,
} from "@/lib/rent-receipt";
import type { RentReceiptDetails } from "@/lib/rent-receipt";
import { cn } from "@/lib/utils";

/**
 * Form state and a download; the receipt itself is laid out in
 * lib/rent-receipt.ts. The two things this adds on top of the fields are the
 * amount in words and the PAN prompt — both are what an employer's payroll team
 * checks first, so it's better to see them while filling the form than to find
 * out after the receipt has been signed.
 */

const INITIAL: RentReceiptDetails = {
  landlordName: "",
  landlordAddress: "",
  landlordPan: "",
  tenantName: "",
  rentAmount: "",
  propertyAddress: "",
  month: MONTHS[0],
  year: "",
  // Both filled in on mount — see the effect below.
  date: "",
  place: "",
};

export function RentReceiptTool() {
  const [details, setDetails] = useState<RentReceiptDetails>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  // Today's date and the current month can't be initial state: rendering them
  // during the server pass would bake the server's clock into the HTML.
  useEffect(() => {
    const now = new Date();
    setDetails((current) => ({
      ...current,
      date: current.date === "" ? todayValue() : current.date,
      month: MONTHS[now.getMonth()],
      year: current.year === "" ? `${now.getFullYear()}` : current.year,
    }));
  }, []);

  const set = useCallback(
    <K extends keyof RentReceiptDetails>(key: K, value: RentReceiptDetails[K]) => {
      setDetails((current) => ({ ...current, [key]: value }));
      setError(null);
    },
    [],
  );

  const rent = parseNumber(details.rentAmount);
  const words = useMemo(() => (rent > 0 ? amountInWords(rent) : ""), [rent]);
  const yearly = annualRent(details.rentAmount);
  const pan = details.landlordPan.trim();

  const panNeeded = yearly > PAN_THRESHOLD && pan === "";
  const panWrong = pan !== "" && !isValidPan(pan);

  const handleDownload = useCallback(async () => {
    setIsWorking(true);

    const result = await buildRentReceiptPdf(details);

    setIsWorking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = receiptFileName(details);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [details]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="Landlord">
          <div className="space-y-3">
            <TextField
              label="Landlord name"
              value={details.landlordName}
              onChange={(value) => set("landlordName", value)}
              placeholder="Sunita Deshpande"
            />
            <TextAreaField
              label="Landlord address"
              value={details.landlordAddress}
              onChange={(value) => set("landlordAddress", value)}
              placeholder={"7 Shivaji Nagar\nPune 411005"}
              hint="Optional"
            />
            <TextField
              label="Landlord PAN"
              value={details.landlordPan}
              onChange={(value) => set("landlordPan", value)}
              placeholder="ABCDE1234F"
              uppercase
              warn={panWrong}
              hint={panHint(panNeeded, panWrong, yearly)}
            />
          </div>
        </FieldGroup>

        <FieldGroup title="Tenant & property">
          <div className="space-y-3">
            <TextField
              label="Tenant name"
              value={details.tenantName}
              onChange={(value) => set("tenantName", value)}
              placeholder="Anita Rao"
            />
            <TextAreaField
              label="Property address"
              value={details.propertyAddress}
              onChange={(value) => set("propertyAddress", value)}
              placeholder={"Flat 302, Sai Residency\nKothrud, Pune 411038"}
              rows={4}
            />
          </div>
        </FieldGroup>
      </div>

      <FieldGroup title="Rent & period">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Monthly rent"
            value={details.rentAmount}
            onChange={(value) => set("rentAmount", value)}
            placeholder="18500"
            numeric
            hint={rent > 0 ? `₹ ${formatAmount(rent)} a month` : "In rupees"}
          />
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
          <TextField
            label="Receipt date"
            type="date"
            value={details.date}
            onChange={(value) => set("date", value)}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextField
            label="Place"
            value={details.place}
            onChange={(value) => set("place", value)}
            placeholder="Pune"
            hint="Optional — printed next to the date"
          />
        </div>
      </FieldGroup>

      <Card className="p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          On the receipt
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <Stat label="Amount" value={rent > 0 ? `₹ ${formatAmount(rent)}` : "—"} emphasis />
          <Stat label="Period" value={periodLabel(details) === "" ? "—" : periodLabel(details)} />
          <Stat label="Rent a year" value={yearly > 0 ? `₹ ${formatAmount(yearly)}` : "—"} />
        </dl>
        <p className="mt-4 border-t border-line-soft pt-3 text-[13px] leading-relaxed text-ink">
          {words === "" ? "The amount in words appears here." : words}
        </p>
      </Card>

      {error && <Notice message={error} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={isWorking} onClick={handleDownload}>
          {isWorking ? "Building…" : "Download receipt"}
        </Button>
        <span aria-live="polite" className="sr-only">
          {error ?? ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The receipt is typeset in your browser and leaves a blank line for the landlord&apos;s
        signature — print it, get it signed, and it&apos;s ready for a house rent allowance claim
        under section 10(13A). Nothing you type here is uploaded or stored. The rupee sign prints as
        &ldquo;Rs.&rdquo;, since the PDF uses a standard Latin font.
      </p>
    </div>
  );
}

function panHint(needed: boolean, wrong: boolean, yearly: number): string {
  if (wrong) return "That doesn't look like a PAN — five letters, four digits, one letter.";
  if (needed) {
    return `Optional, but at ₹ ${formatAmount(yearly)} a year most employers require it.`;
  }

  return "Optional.";
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
