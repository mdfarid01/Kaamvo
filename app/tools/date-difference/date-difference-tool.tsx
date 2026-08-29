"use client";

import { useEffect, useMemo, useState } from "react";
import { FieldGroup, TextField } from "@/components/ui/field";
import { ResultStat } from "@/components/ui/result-stat";
import {
  dateSpan,
  formatCount,
  formatDateLong,
  parseDateInput,
  plural,
  spanLabel,
  toDateInput,
  today,
  weekdayName,
} from "@/lib/date-utils";

/**
 * The other half of lib/date-utils.ts — the same dateSpan the Age Calculator
 * runs on, between two dates the person picks rather than between a birthday and
 * today.
 *
 * The two dates can be given in either order. dateSpan returns magnitudes, so
 * the ordering only decides the wording of the summary line, never a sign.
 */

const DASH = "—";

export function DateDifferenceTool() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Filled on mount rather than as initial state, so the server's clock never
  // reaches the HTML — same as the Age Calculator.
  useEffect(() => {
    setFrom((current) => (current === "" ? toDateInput(today()) : current));
  }, []);

  const fromDate = parseDateInput(from);
  const toDate = parseDateInput(to);

  const span = useMemo(
    () => (fromDate === null || toDate === null ? null : dateSpan(fromDate, toDate)),
    [fromDate, toDate],
  );

  const backwards = fromDate !== null && toDate !== null && toDate.getTime() < fromDate.getTime();
  const sameDay = span !== null && span.totalDays === 0;

  return (
    <div className="space-y-4">
      <FieldGroup title="Dates">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="From"
            type="date"
            value={from}
            onChange={setFrom}
            hint={
              fromDate === null
                ? "Defaults to today"
                : `${weekdayName(fromDate)}, ${formatDateLong(fromDate)}`
            }
          />
          <TextField
            label="To"
            type="date"
            value={to}
            onChange={setTo}
            hint={
              toDate === null
                ? "Pick the other date"
                : `${weekdayName(toDate)}, ${formatDateLong(toDate)}`
            }
          />
        </div>
      </FieldGroup>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ResultStat
          label="Difference"
          value={span === null ? DASH : `${span.years}y ${span.months}m ${span.days}d`}
          hint={span === null ? undefined : spanLabel(span)}
          primary
        />
        <ResultStat
          label="Total days"
          value={span === null ? DASH : formatCount(span.totalDays)}
          hint={span === null ? undefined : "Counting from one date to the other"}
        />
        <ResultStat
          label="Total weeks"
          value={span === null ? DASH : formatCount(span.totalWeeks)}
          hint={
            span === null
              ? undefined
              : span.spareDays > 0
                ? `Plus ${plural(span.spareDays, "day")}`
                : "Exactly, no days left over"
          }
        />
        <ResultStat
          label="Total months"
          value={span === null ? DASH : formatCount(span.totalMonths)}
          hint={span === null ? undefined : "Whole calendar months"}
        />
      </dl>

      {span !== null && fromDate !== null && toDate !== null && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Summary</h2>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink">
            {sameDay ? (
              <>Both dates are the same day — {formatDateLong(fromDate)}.</>
            ) : (
              <>
                {formatDateLong(toDate)} is {spanLabel(span)} ({plural(span.totalDays, "day")}){" "}
                {backwards ? "before" : "after"} {formatDateLong(fromDate)}.
              </>
            )}
          </p>
        </div>
      )}

      <p className="text-[13px] leading-relaxed text-muted">
        The years-and-months figure follows the calendar, so a month is however long that month
        happened to be, and leap days are included in the day counts. The total is the gap between
        the two dates — the first day itself isn&apos;t counted, so a Monday to the next Monday is 7
        days. Everything is worked out in your browser — nothing you type is sent anywhere.
      </p>
    </div>
  );
}
