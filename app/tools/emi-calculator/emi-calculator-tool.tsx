"use client";

import { useMemo, useState } from "react";
import { FieldGroup, SelectField, TextField } from "@/components/ui/field";
import { ResultStat, SplitBar } from "@/components/ui/result-stat";
import { calculateEmi, formatMoney, parseAmount, share, termLabel } from "@/lib/finance";

/**
 * Form state over calculateEmi in lib/finance.ts. Nothing is submitted — the
 * figures update on every keystroke, like the Word Counter.
 *
 * Tenure takes a unit rather than assuming one: a home loan is quoted in years
 * and a consumer loan in months, and a field that silently means the wrong one
 * is out by a factor of twelve.
 */

const TENURE_UNITS = [
  { value: "years", label: "Years" },
  { value: "months", label: "Months" },
];

export function EmiCalculatorTool() {
  const [principal, setPrincipal] = useState("2500000");
  const [rate, setRate] = useState("8.5");
  const [tenure, setTenure] = useState("20");
  const [tenureUnit, setTenureUnit] = useState("years");

  const amount = parseAmount(principal);
  const annualRate = parseAmount(rate);
  const months = Math.round(parseAmount(tenure) * (tenureUnit === "years" ? 12 : 1));

  const result = useMemo(
    () => calculateEmi(amount, annualRate, months),
    [amount, annualRate, months],
  );

  return (
    <div className="space-y-4">
      <FieldGroup title="Loan">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Loan amount"
            value={principal}
            onChange={setPrincipal}
            placeholder="2500000"
            numeric
            hint={amount > 0 ? `₹ ${formatMoney(amount)}` : "In rupees"}
          />
          <TextField
            label="Interest rate"
            value={rate}
            onChange={setRate}
            placeholder="8.5"
            numeric
            hint="Percent a year"
          />
          <TextField
            label="Tenure"
            value={tenure}
            onChange={setTenure}
            placeholder="20"
            numeric
            hint={months > 0 ? termLabel(months) : "How long to repay"}
          />
          <SelectField
            label="Tenure in"
            value={tenureUnit}
            onChange={setTenureUnit}
            options={TENURE_UNITS}
          />
        </div>
      </FieldGroup>

      <dl className="grid gap-3 sm:grid-cols-3">
        <ResultStat
          label="Monthly EMI"
          value={`₹ ${formatMoney(result.emi)}`}
          hint={months > 0 ? `× ${months} instalments` : undefined}
          primary
        />
        <ResultStat
          label="Total interest"
          value={`₹ ${formatMoney(result.totalInterest)}`}
          hint={
            result.totalPayment > 0
              ? `${share(result.totalInterest, result.totalPayment).toFixed(1)}% of what you pay`
              : undefined
          }
        />
        <ResultStat
          label="Total payment"
          value={`₹ ${formatMoney(result.totalPayment)}`}
          hint="Principal plus interest"
        />
      </dl>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          Where the money goes
        </h2>
        <div className="mt-3">
          <SplitBar
            percent={share(amount, result.totalPayment)}
            leadLabel={`Principal ₹ ${formatMoney(amount)}`}
            restLabel={`Interest ₹ ${formatMoney(result.totalInterest)}`}
          />
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        This is the standard reducing-balance EMI a bank quotes: the instalment stays the same every
        month while the split between interest and principal shifts. Processing fees, insurance and
        any change of rate part-way through aren&apos;t included. Everything is worked out in your
        browser — nothing you type is sent anywhere.
      </p>
    </div>
  );
}
