"use client";

import { useState } from "react";
import { FieldGroup, SelectField, TextField } from "@/components/ui/field";
import { ResultStat } from "@/components/ui/result-stat";
import {
  applyChange,
  formatNumber,
  formatPercent,
  parseNumber,
  percentDifference,
  percentOf,
  percentRatio,
} from "@/lib/percentage";

/**
 * Four percentage questions on one page, each an independent pair of fields over
 * a function in lib/percentage.ts. Nothing is submitted — every answer updates on
 * every keystroke, like the finance calculators.
 *
 * They're on one page rather than four because they're the same question asked
 * four ways round, and which way round you need is exactly the thing that's hard
 * to remember: the fields are labelled as a sentence ("15 % of 2500") so there's
 * nothing to work out before typing.
 */

const DASH = "—";

const DIRECTIONS = [
  { value: "increase", label: "Increase by" },
  { value: "decrease", label: "Decrease by" },
];

const RESULTS = "mt-4 grid gap-3 sm:grid-cols-2";
const FIELDS = "grid gap-4 sm:grid-cols-2";

export function PercentageCalculatorTool() {
  // "What is X% of Y"
  const [ofPercent, setOfPercent] = useState("15");
  const [ofValue, setOfValue] = useState("2500");

  // "X is what percent of Y"
  const [part, setPart] = useState("45");
  const [whole, setWhole] = useState("180");

  // "Increase or decrease Y by X%"
  const [base, setBase] = useState("1200");
  const [direction, setDirection] = useState("increase");
  const [changePercent, setChangePercent] = useState("18");

  // "What is the percentage change from X to Y"
  const [before, setBefore] = useState("40");
  const [after, setAfter] = useState("50");

  const ofP = parseNumber(ofPercent);
  const ofV = parseNumber(ofValue);
  const ofResult = ofP === null || ofV === null ? null : percentOf(ofP, ofV);

  const partValue = parseNumber(part);
  const wholeValue = parseNumber(whole);
  const ratio = partValue === null || wholeValue === null ? null : percentRatio(partValue, wholeValue);

  const baseValue = parseNumber(base);
  const signedPercent = (() => {
    const typed = parseNumber(changePercent);
    if (typed === null) return null;
    // A minus typed into a "decrease by" field would otherwise cancel the select
    // and quietly increase instead.
    return direction === "decrease" ? -Math.abs(typed) : Math.abs(typed);
  })();
  const changed =
    baseValue === null || signedPercent === null ? null : applyChange(baseValue, signedPercent);

  const beforeValue = parseNumber(before);
  const afterValue = parseNumber(after);
  const difference =
    beforeValue === null || afterValue === null ? null : percentDifference(beforeValue, afterValue);

  return (
    <div className="space-y-4">
      <FieldGroup title="What is X% of Y?">
        <div className={FIELDS}>
          <TextField
            label="Percent"
            value={ofPercent}
            onChange={setOfPercent}
            placeholder="15"
            numeric
            hint="The % you want"
          />
          <TextField
            label="Of this number"
            value={ofValue}
            onChange={setOfValue}
            placeholder="2500"
            numeric
            hint="The whole amount"
          />
        </div>
        <dl className={RESULTS}>
          <ResultStat
            label="Result"
            value={ofResult === null ? DASH : formatNumber(ofResult)}
            hint={
              ofP === null || ofV === null
                ? undefined
                : `${formatNumber(ofP)}% of ${formatNumber(ofV)}`
            }
            primary
          />
          <ResultStat
            label="The rest"
            value={ofResult === null || ofV === null ? DASH : formatNumber(ofV - ofResult)}
            hint={ofP === null ? undefined : `The other ${formatNumber(100 - ofP)}%`}
          />
        </dl>
      </FieldGroup>

      <FieldGroup title="X is what percent of Y?">
        <div className={FIELDS}>
          <TextField
            label="This number"
            value={part}
            onChange={setPart}
            placeholder="45"
            numeric
            hint="The part"
          />
          <TextField
            label="Out of"
            value={whole}
            onChange={setWhole}
            placeholder="180"
            numeric
            hint={wholeValue === 0 ? "A total of zero has no percentages." : "The total"}
            warn={wholeValue === 0}
          />
        </div>
        <dl className={RESULTS}>
          <ResultStat
            label="Share"
            value={ratio === null ? DASH : formatPercent(ratio)}
            hint={
              partValue === null || wholeValue === null || wholeValue === 0
                ? undefined
                : `${formatNumber(partValue)} out of ${formatNumber(wholeValue)}`
            }
            primary
          />
          <ResultStat
            label="Remaining share"
            value={ratio === null ? DASH : formatPercent(100 - ratio)}
            hint={
              partValue === null || wholeValue === null || wholeValue === 0
                ? undefined
                : `${formatNumber(wholeValue - partValue)} of the total is left`
            }
          />
        </dl>
      </FieldGroup>

      <FieldGroup title="Increase or decrease a number by X%">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="Starting number"
            value={base}
            onChange={setBase}
            placeholder="1200"
            numeric
            hint="Before the change"
          />
          <SelectField label="Direction" value={direction} onChange={setDirection} options={DIRECTIONS} />
          <TextField
            label="Percent"
            value={changePercent}
            onChange={setChangePercent}
            placeholder="18"
            numeric
            hint="How much to add or take off"
          />
        </div>
        <dl className={RESULTS}>
          <ResultStat
            label="New value"
            value={changed === null ? DASH : formatNumber(changed.result)}
            hint={
              baseValue === null || signedPercent === null
                ? undefined
                : `${formatNumber(baseValue)} ${direction === "decrease" ? "less" : "plus"} ${formatNumber(Math.abs(signedPercent))}%`
            }
            primary
          />
          <ResultStat
            label={direction === "decrease" ? "Taken off" : "Added on"}
            value={changed === null ? DASH : formatNumber(changed.delta)}
            hint="The size of the change itself"
          />
        </dl>
      </FieldGroup>

      <FieldGroup title="What is the percentage change from X to Y?">
        <div className={FIELDS}>
          <TextField
            label="From"
            value={before}
            onChange={setBefore}
            placeholder="40"
            numeric
            hint={beforeValue === 0 ? "There's no change from zero." : "The old value"}
            warn={beforeValue === 0}
          />
          <TextField
            label="To"
            value={after}
            onChange={setAfter}
            placeholder="50"
            numeric
            hint="The new value"
          />
        </div>
        <dl className={RESULTS}>
          <ResultStat
            label="Change"
            value={difference === null ? DASH : formatPercent(difference, true)}
            hint={
              difference === null
                ? undefined
                : difference > 0
                  ? "An increase"
                  : difference < 0
                    ? "A decrease"
                    : "No change"
            }
            primary
          />
          <ResultStat
            label="Difference"
            value={
              beforeValue === null || afterValue === null
                ? DASH
                : formatNumber(Math.abs(afterValue - beforeValue))
            }
            hint="In plain numbers, not percent"
          />
        </dl>
      </FieldGroup>

      <p className="text-[13px] leading-relaxed text-muted">
        A percentage change is always measured against the first number, which is why a rise from 40
        to 50 is +25% while the fall back from 50 to 40 is −20%. Answers are shown to four decimal
        places and trimmed, so a clean division reads as a whole number. Everything is worked out in
        your browser — nothing you type is sent anywhere.
      </p>
    </div>
  );
}
