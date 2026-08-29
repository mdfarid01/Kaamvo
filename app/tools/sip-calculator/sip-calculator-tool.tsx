"use client";

import { useMemo, useState } from "react";
import { FieldGroup, TextField } from "@/components/ui/field";
import { ResultStat, SplitBar } from "@/components/ui/result-stat";
import { calculateSip, formatMoney, parseAmount, share } from "@/lib/finance";

/**
 * Form state over calculateSip in lib/finance.ts, which holds the annuity-due
 * formula and the note on why the instalment timing matters. The figures update
 * as you type; there's nothing to submit.
 */

export function SipCalculatorTool() {
  const [monthly, setMonthly] = useState("10000");
  const [returnRate, setReturnRate] = useState("12");
  const [years, setYears] = useState("10");

  const perMonth = parseAmount(monthly);
  const annualReturn = parseAmount(returnRate);
  const term = parseAmount(years);

  const result = useMemo(
    () => calculateSip(perMonth, annualReturn, term),
    [perMonth, annualReturn, term],
  );

  const installments = Math.max(0, Math.round(term * 12));

  return (
    <div className="space-y-4">
      <FieldGroup title="Investment">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Monthly investment"
            value={monthly}
            onChange={setMonthly}
            placeholder="10000"
            numeric
            hint={perMonth > 0 ? `₹ ${formatMoney(perMonth)} a month` : "In rupees"}
          />
          <TextField
            label="Expected return"
            value={returnRate}
            onChange={setReturnRate}
            placeholder="12"
            numeric
            hint="Percent a year"
          />
          <TextField
            label="Time period"
            value={years}
            onChange={setYears}
            placeholder="10"
            numeric
            hint={installments > 0 ? `${installments} instalments` : "In years"}
          />
        </div>
      </FieldGroup>

      <dl className="grid gap-3 sm:grid-cols-3">
        <ResultStat
          label="Maturity value"
          value={`₹ ${formatMoney(result.maturity)}`}
          hint={installments > 0 ? `After ${installments} months` : undefined}
          primary
        />
        <ResultStat
          label="Total invested"
          value={`₹ ${formatMoney(result.invested)}`}
          hint="What you put in"
        />
        <ResultStat
          label="Estimated gains"
          value={`₹ ${formatMoney(result.gains)}`}
          hint={
            result.maturity > 0
              ? `${share(result.gains, result.maturity).toFixed(1)}% of the maturity value`
              : undefined
          }
        />
      </dl>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          What the maturity value is made of
        </h2>
        <div className="mt-3">
          <SplitBar
            percent={share(result.invested, result.maturity)}
            leadLabel={`Invested ₹ ${formatMoney(result.invested)}`}
            restLabel={`Gains ₹ ${formatMoney(result.gains)}`}
          />
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        The return is treated as a steady annual rate compounded monthly, which is how every SIP
        projection is quoted — a real fund won&apos;t return the same figure each year, and this
        doesn&apos;t account for exit load, expense ratio or tax on the gains. Everything is worked
        out in your browser; nothing you type is sent anywhere.
      </p>
    </div>
  );
}
