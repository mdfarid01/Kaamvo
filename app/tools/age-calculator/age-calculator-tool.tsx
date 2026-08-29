"use client";

import { useEffect, useMemo, useState } from "react";
import { FieldGroup, TextField } from "@/components/ui/field";
import { ResultStat } from "@/components/ui/result-stat";
import {
  dateSpan,
  formatCount,
  formatDateLong,
  nextAnniversary,
  parseDateInput,
  plural,
  spanLabel,
  toDateInput,
  today,
  weekdayName,
} from "@/lib/date-utils";

/**
 * Form state over dateSpan and nextAnniversary in lib/date-utils.ts. Nothing is
 * submitted — the figures update on every keystroke, like the EMI Calculator.
 *
 * The second field exists because "how old was I when…" is the same question as
 * "how old am I": both are a span between two dates, and defaulting it to today
 * costs nothing.
 */

const DASH = "—";

export function AgeCalculatorTool() {
  const [birth, setBirth] = useState("");
  const [asOf, setAsOf] = useState("");

  // Today can't be initial state: rendering it during the server pass would bake
  // the server's clock into the HTML. Same reason as the Rent Receipt form.
  useEffect(() => {
    setAsOf((current) => (current === "" ? toDateInput(today()) : current));
  }, []);

  const birthDate = parseDateInput(birth);
  const asOfDate = parseDateInput(asOf);
  const isFuture = birthDate !== null && asOfDate !== null && birthDate.getTime() > asOfDate.getTime();

  const age = useMemo(
    () => (birthDate === null || asOfDate === null || isFuture ? null : dateSpan(birthDate, asOfDate)),
    [birthDate, asOfDate, isFuture],
  );

  const birthday = useMemo(
    () => (birthDate === null || asOfDate === null || isFuture ? null : nextAnniversary(birthDate, asOfDate)),
    [birthDate, asOfDate, isFuture],
  );

  return (
    <div className="space-y-4">
      <FieldGroup title="Dates">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Date of birth"
            type="date"
            value={birth}
            onChange={setBirth}
            hint={
              isFuture
                ? "That date hasn't happened yet."
                : birthDate === null
                  ? "Pick the day you were born"
                  : `${weekdayName(birthDate)}, ${formatDateLong(birthDate)}`
            }
            warn={isFuture}
          />
          <TextField
            label="Age on"
            type="date"
            value={asOf}
            onChange={setAsOf}
            hint={asOfDate === null ? "Defaults to today" : formatDateLong(asOfDate)}
          />
        </div>
      </FieldGroup>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ResultStat
          label="Exact age"
          value={age === null ? DASH : `${age.years}y ${age.months}m ${age.days}d`}
          hint={age === null ? undefined : spanLabel(age)}
          primary
        />
        <ResultStat
          label="Days lived"
          value={age === null ? DASH : formatCount(age.totalDays)}
          hint={
            age === null
              ? undefined
              : `${plural(age.totalWeeks, "week")}${age.spareDays > 0 ? ` and ${plural(age.spareDays, "day")}` : ""}`
          }
        />
        <ResultStat
          label="Months lived"
          value={age === null ? DASH : formatCount(age.totalMonths)}
          hint={age === null ? undefined : "Whole calendar months"}
        />
        <ResultStat
          label="Next birthday"
          value={
            birthday === null ? DASH : birthday.isToday ? "Today" : plural(birthday.daysUntil, "day")
          }
          hint={
            birthday === null
              ? undefined
              : birthday.isToday
                ? `Turning ${birthday.ordinal} today`
                : `Turns ${birthday.ordinal} on ${weekdayName(birthday.date)}, ${formatDateLong(birthday.date)}`
          }
        />
      </dl>

      <p className="text-[13px] leading-relaxed text-muted">
        The age is counted the way a calendar does, not by dividing days: a month is however long
        that particular month was, so the years and months here match what a form asking your age
        expects. A 29 February birthday falls on the 28th in a common year. Everything is worked out
        in your browser — nothing you type is sent anywhere.
      </p>
    </div>
  );
}
