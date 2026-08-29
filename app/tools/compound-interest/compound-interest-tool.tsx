"use client";

import { useMemo, useState } from "react";
import { FieldGroup, SelectField, TextField } from "@/components/ui/field";
import { ResultStat, SplitBar } from "@/components/ui/result-stat";
import {
  FREQUENCIES,
  calculateCompoundInterest,
  formatMoney,
  getFrequency,
  parseAmount,
  share,
} from "@/lib/finance";

/**
 * Form state over calculateCompoundInterest in lib/finance.ts. The figures
 * update as you type, so switching the compounding frequency shows the gap
 * between annual and monthly straight away — which is the reason most people
 * open this rather than multiply by a rate themselves.
 */

const FREQUENCY_OPTIONS = FREQUENCIES.map((frequency) => ({
  value: frequency.id,
  label: frequency.label,
}));

export function CompoundInterestTool() {
  const [principal, setPrincipal] = useState("100000");
  const [rate, setRate] = useState("7");
  const [years, setYears] = useState("5");
  const [frequencyId, setFrequencyId] = useState("annually");

  const amount = parseAmount(principal);
  const annualRate = parseAmount(rate);
  const term = parseAmount(years);
  const frequency = getFrequency(frequencyId);

  const result = useMemo(
    () => calculateCompoundInterest(amount, annualRate, term, frequency.perYear),
    [amount, annualRate, term, frequency.perYear],
  );

  return (
    <div className="space-y-4">
      <FieldGroup title="Deposit">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Principal"
            value={principal}
            onChange={setPrincipal}
            placeholder="100000"
            numeric
            hint={amount > 0 ? `₹ ${formatMoney(amount)}` : "In rupees"}
          />
          <TextField
            label="Interest rate"
            value={rate}
            onChange={setRate}
            placeholder="7"
            numeric
            hint="Percent a year"
          />
          <TextField
            label="Time period"
            value={years}
            onChange={setYears}
            placeholder="5"
            numeric
            hint="In years"
          />
          <SelectField
            label="Compounded"
            value={frequencyId}
            onChange={setFrequencyId}
            options={FREQUENCY_OPTIONS}
            hint={frequency.perYear > 0 ? `${frequency.perYear}× a year` : "The theoretical limit"}
          />
        </div>
      </FieldGroup>

      <dl className="grid gap-3 sm:grid-cols-3">
        <ResultStat
          label="Final amount"
          value={`₹ ${formatMoney(result.amount)}`}
          hint={term > 0 ? `After ${term} ${term === 1 ? "year" : "years"}` : undefined}
          primary
        />
        <ResultStat
          label="Interest earned"
          value={`₹ ${formatMoney(result.interest)}`}
          hint={`Compounded ${frequency.label.toLowerCase()}`}
        />
        <ResultStat
          label="Principal"
          value={`₹ ${formatMoney(amount)}`}
          hint={
            result.amount > 0
              ? `${share(amount, result.amount).toFixed(1)}% of the final amount`
              : undefined
          }
        />
      </dl>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          What the final amount is made of
        </h2>
        <div className="mt-3">
          <SplitBar
            percent={share(amount, result.amount)}
            leadLabel={`Principal ₹ ${formatMoney(amount)}`}
            restLabel={`Interest ₹ ${formatMoney(result.interest)}`}
          />
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Interest is added back to the balance at the frequency you pick and earns interest itself
        from then on — the more often that happens, the higher the final amount at the same quoted
        rate. Nothing is deducted for tax. Everything is worked out in your browser; nothing you
        type is sent anywhere.
      </p>
    </div>
  );
}
