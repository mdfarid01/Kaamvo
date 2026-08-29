"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldGroup, SelectField, TextField } from "@/components/ui/field";
import {
  BREAK_CELL,
  DAYS,
  DEFAULT_BREAK_LABEL,
  DEFAULT_DAYS,
  MAX_ROWS,
  SLOT_MINUTE_OPTIONS,
  breakRow,
  buildPlan,
  buildStudyPlanPdf,
  emptySubject,
  namedSubjects,
  shareLabel,
  studyPlanFileName,
  withFittedRows,
} from "@/lib/study-planner";
import type { PlanRow, StudyPlanDetails, Subject } from "@/lib/study-planner";
import { cn } from "@/lib/utils";

/**
 * Form state, the editable grid and a download. The row timing and the page
 * layout are both in lib/study-planner.ts, and the table below is the same plan
 * the PDF is drawn from — so what you build is what prints.
 *
 * The grid is the form: every cell is a select over the subjects you've named,
 * plus a break and an empty. Nothing is assigned for you.
 */

/** The "Fill row…" select's own reset entry — "" is already the placeholder. */
const CLEAR_ROW = "__clear__";

const BASE: StudyPlanDetails = {
  // No clock is read here, so the opening state is safe to render on the server.
  subjects: [
    { ...emptySubject("Maths"), hours: "4" },
    { ...emptySubject("Science"), hours: "3" },
    { ...emptySubject("English"), hours: "2" },
  ],
  days: DEFAULT_DAYS,
  slotMinutes: "60",
  startTime: "18:00",
  endTime: "21:00",
  rows: [],
};

/** Three empty one-hour rows to start, so the grid has something to click. */
const INITIAL = withFittedRows(BASE);

export function StudyPlannerTool() {
  const [details, setDetails] = useState<StudyPlanDetails>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  /**
   * Every mutation goes through here so the row list is re-fitted to the window
   * on the same tick as the change that moved it — a longer break has to take a
   * slot row away, not push one past the end time.
   */
  const update = useCallback((patch: (current: StudyPlanDetails) => StudyPlanDetails) => {
    setDetails((current) => withFittedRows(patch(current)));
    // Any edit invalidates a complaint about the last attempt.
    setError(null);
  }, []);

  const set = useCallback(
    <K extends keyof StudyPlanDetails>(key: K, value: StudyPlanDetails[K]) => {
      update((current) => ({ ...current, [key]: value }));
    },
    [update],
  );

  const updateSubject = useCallback(
    (id: string, patch: Partial<Subject>) => {
      update((current) => ({
        ...current,
        subjects: current.subjects.map((subject) =>
          subject.id === id ? { ...subject, ...patch } : subject,
        ),
      }));
    },
    [update],
  );

  const addSubject = useCallback(() => {
    update((current) => ({ ...current, subjects: [...current.subjects, emptySubject()] }));
  }, [update]);

  const removeSubject = useCallback(
    (id: string) => {
      update((current) => {
        const subjects = current.subjects.filter((subject) => subject.id !== id);
        // Never down to nothing — an empty list has no row to type into.
        return { ...current, subjects: subjects.length === 0 ? [emptySubject()] : subjects };
      });
    },
    [update],
  );

  const toggleDay = useCallback(
    (day: string) => {
      update((current) => ({
        ...current,
        days: current.days.includes(day)
          ? current.days.filter((entry) => entry !== day)
          : [...current.days, day],
      }));
    },
    [update],
  );

  /** Puts a break directly after the row it was asked for. */
  const insertBreak = useCallback(
    (afterId: string) => {
      update((current) => {
        const index = current.rows.findIndex((row) => row.id === afterId);
        const rows = [...current.rows];
        rows.splice(index + 1, 0, breakRow());
        return { ...current, rows };
      });
    },
    [update],
  );

  const updateRow = useCallback(
    (id: string, patch: Partial<PlanRow>) => {
      update((current) => ({
        ...current,
        rows: current.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      }));
    },
    [update],
  );

  const removeBreak = useCallback(
    (id: string) => {
      update((current) => ({ ...current, rows: current.rows.filter((row) => row.id !== id) }));
    },
    [update],
  );

  const assignCell = useCallback(
    (rowId: string, day: string, value: string) => {
      update((current) => ({
        ...current,
        rows: current.rows.map((row) =>
          row.id === rowId ? { ...row, cells: { ...row.cells, [day]: value } } : row,
        ),
      }));
    },
    [update],
  );

  /** Fills a whole row with one subject — the fast path back to a rotation. */
  const fillRow = useCallback(
    (rowId: string, choice: string) => {
      if (choice === "") return;
      const value = choice === CLEAR_ROW ? "" : choice;

      update((current) => ({
        ...current,
        rows: current.rows.map((row) => {
          if (row.id !== rowId) return row;

          const cells: Record<string, string> = { ...row.cells };
          for (const day of current.days) cells[day] = value;
          return { ...row, cells };
        }),
      }));
    },
    [update],
  );

  const plan = useMemo(() => buildPlan(details), [details]);
  const choices = useMemo(() => namedSubjects(details.subjects), [details.subjects]);

  const handleDownload = useCallback(async () => {
    setIsWorking(true);

    const result = await buildStudyPlanPdf(details);

    setIsWorking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = studyPlanFileName(details);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [details]);

  const control =
    "h-10 w-full rounded-md border border-line bg-surface px-3 text-[14px] text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20";

  const cellControl =
    "w-full cursor-pointer rounded border border-transparent bg-transparent px-1 py-1 text-[12px] text-ink transition-colors hover:border-line focus:border-accent focus:outline-none";

  const rowById = useMemo(
    () => new Map(details.rows.map((row) => [row.id, row])),
    [details.rows],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="Subjects">
          <div className="space-y-2">
            <div className="hidden gap-2 sm:grid sm:grid-cols-[1fr_96px_32px]">
              {["Subject", "Hours/week", ""].map((label, index) => (
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

            {details.subjects.map((subject) => (
              <div
                key={subject.id}
                className="grid gap-2 sm:grid-cols-[1fr_96px_32px] sm:items-center"
              >
                <input
                  aria-label="Subject"
                  value={subject.name}
                  onChange={(event) => updateSubject(subject.id, { name: event.target.value })}
                  placeholder="Maths"
                  className={control}
                />
                <input
                  aria-label="Hours a week"
                  value={subject.hours}
                  onChange={(event) => updateSubject(subject.id, { hours: event.target.value })}
                  inputMode="numeric"
                  placeholder="4"
                  className={cn(control, "font-mono tabular-nums sm:text-right")}
                />
                <button
                  type="button"
                  onClick={() => removeSubject(subject.id)}
                  disabled={details.subjects.length <= 1}
                  aria-label="Remove this subject"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[18px] leading-none text-muted transition-colors hover:border-line hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ×
                </button>
              </div>
            ))}

            <div className="pt-1">
              <Button variant="secondary" size="sm" onClick={addSubject}>
                Add subject
              </Button>
            </div>

            <p className="pt-1 text-[12px] leading-relaxed text-muted">
              Hours a week is a target to check against — nothing is scheduled for you.
            </p>
          </div>
        </FieldGroup>

        <FieldGroup title="When you can study">
          <div className="space-y-4">
            <div>
              <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                Days
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {DAYS.map((day) => {
                  const on = details.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      aria-pressed={on}
                      className={cn(
                        "h-9 rounded-md border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        on
                          ? "border-accent bg-accent/[0.08] text-accent-deep"
                          : "border-line text-muted hover:border-ink hover:text-ink",
                      )}
                    >
                      {day.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <TextField
                label="Day starts"
                type="time"
                value={details.startTime}
                onChange={(value) => set("startTime", value)}
              />
              <TextField
                label="Day ends"
                type="time"
                value={details.endTime}
                onChange={(value) => set("endTime", value)}
              />
              <SelectField
                label="Slot length"
                value={details.slotMinutes}
                onChange={(value) => set("slotMinutes", value)}
                options={SLOT_MINUTE_OPTIONS}
                hint={`Up to ${MAX_ROWS} rows`}
              />
            </div>
          </div>
        </FieldGroup>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            Your week
          </h2>
          <p className="text-[12px] text-muted">
            {plan.span} · {plan.filledSlots} of {plan.totalSlots} cells filled
          </p>
        </div>

        {plan.days.length === 0 ? (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Pick the days you can study on.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="w-[150px] border border-line-soft bg-canvas px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                    Slot
                  </th>
                  {plan.days.map((day) => (
                    <th
                      key={day}
                      className="border border-line-soft bg-canvas px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-[0.06em] text-muted"
                    >
                      {day.slice(0, 3)}
                    </th>
                  ))}
                  <th className="w-[92px] border border-line-soft bg-canvas px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                    Row
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((row) => {
                  const source = rowById.get(row.id);

                  if (row.kind === "break") {
                    return (
                      <tr key={row.id}>
                        <th className="border border-line-soft px-2 py-2 text-left text-[12px] font-normal text-muted">
                          {row.time}
                        </th>
                        <td
                          colSpan={plan.days.length}
                          className="border border-line-soft bg-canvas px-2 py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              aria-label="Break name"
                              value={source?.label ?? ""}
                              onChange={(event) =>
                                updateRow(row.id, { label: event.target.value })
                              }
                              placeholder={DEFAULT_BREAK_LABEL}
                              className="h-8 min-w-0 flex-1 rounded border border-line bg-surface px-2 text-[12px] text-ink focus:border-accent focus:outline-none"
                            />
                            <input
                              aria-label="Break length in minutes"
                              value={source?.minutes ?? ""}
                              onChange={(event) =>
                                updateRow(row.id, { minutes: event.target.value })
                              }
                              inputMode="numeric"
                              className="h-8 w-16 rounded border border-line bg-surface px-2 text-right font-mono text-[12px] tabular-nums text-ink focus:border-accent focus:outline-none"
                            />
                            <span className="text-[11px] text-muted">min</span>
                          </div>
                        </td>
                        <td className="border border-line-soft px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => removeBreak(row.id)}
                            aria-label="Remove this break"
                            className="rounded px-2 py-1 text-[11px] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={row.id}>
                      <th className="border border-line-soft px-2 py-2 text-left text-[12px] font-normal text-muted">
                        {row.time}
                      </th>
                      {row.cells.map((cell, column) => {
                        const day = plan.days[column];
                        return (
                          <td
                            key={day}
                            className={cn(
                              "border border-line-soft px-1 py-1 text-center",
                              cell.isBreak && "bg-canvas",
                            )}
                          >
                            <select
                              aria-label={`${day}, ${row.time}`}
                              value={cell.value}
                              onChange={(event) => assignCell(row.id, day, event.target.value)}
                              className={cn(
                                cellControl,
                                cell.value === "" ? "text-faint" : "text-ink",
                              )}
                            >
                              <option value="">—</option>
                              {choices.map((subject) => (
                                <option key={subject.id} value={subject.id}>
                                  {subject.name.trim()}
                                </option>
                              ))}
                              <option value={BREAK_CELL}>{DEFAULT_BREAK_LABEL}</option>
                            </select>
                          </td>
                        );
                      })}
                      <td className="border border-line-soft px-1 py-1">
                        <div className="flex flex-col gap-1">
                          <select
                            aria-label={`Fill the ${row.time} row`}
                            value=""
                            onChange={(event) => fillRow(row.id, event.target.value)}
                            className={cn(cellControl, "text-muted")}
                          >
                            <option value="">Fill row…</option>
                            <option value={CLEAR_ROW}>Clear</option>
                            {choices.map((subject) => (
                              <option key={subject.id} value={subject.id}>
                                {subject.name.trim()}
                              </option>
                            ))}
                            <option value={BREAK_CELL}>{DEFAULT_BREAK_LABEL}</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => insertBreak(row.id)}
                            className="rounded px-1 py-0.5 text-[11px] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            + Break
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {plan.shares.length > 0 && (
          <p className="mt-3 border-t border-line-soft pt-3 text-[12px] leading-relaxed text-muted">
            {plan.shares.map(shareLabel).join("  ·  ")}
          </p>
        )}
      </div>

      {error && <Notice message={error} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={isWorking} onClick={handleDownload}>
          {isWorking ? "Building…" : "Download plan"}
        </Button>
        <span aria-live="polite" className="sr-only">
          {error ?? ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Rows come from your start time, end time and slot length; breaks take their own time out of
        the day, so the rows below one shift down. Every cell is yours to set — the same slot can
        hold a different subject on every day. The PDF is a landscape A4 sheet, typeset in your
        browser: nothing you type is uploaded.
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
