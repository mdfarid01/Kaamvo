"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldGroup, TextAreaField, TextField } from "@/components/ui/field";
import { ACCEPT_ATTRIBUTE } from "@/lib/image-canvas";
import {
  ANSWER_SPACES,
  answerableQuestions,
  buildWorksheetPdf,
  emptyQuestion,
  loadLogo,
  totalMarks,
  worksheetFileName,
} from "@/lib/worksheet";
import type { AnswerSpace, Logo, Question, WorksheetDetails } from "@/lib/worksheet";
import { bytesToBlob, cn } from "@/lib/utils";

/**
 * Form state and a download. The page layout and the logo handling are both in
 * lib/worksheet.ts — nothing here touches pdf-lib, which is the same split the
 * Invoice Generator uses.
 */

const INITIAL: WorksheetDetails = {
  title: "",
  subject: "",
  instructions: "",
  schoolName: "",
  nameLine: true,
  // Filled in on mount rather than here: emptyQuestion() bumps a counter, and a
  // server-rendered id would be replaced on hydration anyway.
  questions: [],
  logo: null,
};

export function WorksheetMakerTool() {
  const [details, setDetails] = useState<WorksheetDetails>(INITIAL);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    setDetails((current) => ({
      ...current,
      // Three blank rows, so the form is something to type into rather than
      // something to discover an "Add question" button for.
      questions:
        current.questions.length === 0
          ? [emptyQuestion(), emptyQuestion(), emptyQuestion()]
          : current.questions,
    }));
  }, []);

  const set = useCallback(
    <K extends keyof WorksheetDetails>(key: K, value: WorksheetDetails[K]) => {
      setDetails((current) => ({ ...current, [key]: value }));
      // Any edit invalidates a complaint about the last attempt.
      setError(null);
    },
    [],
  );

  const updateQuestion = useCallback((id: string, patch: Partial<Question>) => {
    setDetails((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === id ? { ...question, ...patch } : question,
      ),
    }));
  }, []);

  const addQuestion = useCallback(() => {
    setDetails((current) => ({ ...current, questions: [...current.questions, emptyQuestion()] }));
  }, []);

  const removeQuestion = useCallback((id: string) => {
    setDetails((current) => {
      const questions = current.questions.filter((question) => question.id !== id);
      // Never down to nothing — an empty list has no row to type the next
      // question into, and the form would look broken.
      return { ...current, questions: questions.length === 0 ? [emptyQuestion()] : questions };
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

  const counted = useMemo(() => answerableQuestions(details.questions), [details.questions]);
  const marks = useMemo(() => totalMarks(counted), [counted]);

  const handleDownload = useCallback(async () => {
    setIsWorking(true);

    const result = await buildWorksheetPdf(details);

    setIsWorking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);

    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = worksheetFileName(details);
    link.click();
    // Safari needs the URL to outlive the click, so the revoke waits a tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [details]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="Worksheet">
          <div className="space-y-3">
            <TextField
              label="Title"
              value={details.title}
              onChange={(value) => set("title", value)}
              placeholder="Fractions — Practice Set 2"
            />
            <TextField
              label="Subject or class"
              value={details.subject}
              onChange={(value) => set("subject", value)}
              placeholder="Mathematics · Class 6"
              hint="Optional"
            />
            <TextAreaField
              label="Instructions"
              value={details.instructions}
              onChange={(value) => set("instructions", value)}
              placeholder="Answer all questions. Show your working. Time: 40 minutes."
              hint="Optional — printed above the first question."
            />
          </div>
        </FieldGroup>

        <FieldGroup title="School">
          <div className="space-y-3">
            <TextField
              label="School name"
              value={details.schoolName}
              onChange={(value) => set("schoolName", value)}
              placeholder="Sunrise Public School"
              hint="Optional"
            />
            <LogoPicker
              url={logoUrl}
              name={details.logo?.name ?? null}
              error={logoError}
              onPick={handleLogo}
              onClear={clearLogo}
            />
            <Toggle
              label="Print a Name and Date line"
              checked={details.nameLine}
              onChange={(value) => set("nameLine", value)}
            />
          </div>
        </FieldGroup>
      </div>

      <FieldGroup title="Questions">
        <div className="space-y-2">
          <QuestionHeader />

          {details.questions.map((question, index) => (
            <QuestionRow
              key={question.id}
              number={index + 1}
              question={question}
              onChange={(patch) => updateQuestion(question.id, patch)}
              onRemove={() => removeQuestion(question.id)}
              removable={details.questions.length > 1}
            />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button variant="secondary" size="sm" onClick={addQuestion}>
              Add question
            </Button>
            <p className="text-[13px] text-muted">
              {counted.length} question{counted.length === 1 ? "" : "s"}
              {marks > 0 && ` · ${trimZeros(marks)} marks`}
            </p>
          </div>
        </div>
      </FieldGroup>

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
        The worksheet is typeset in your browser with pdf-lib on A4 pages — nothing you type and no
        logo you pick is uploaded, and the logo is held in memory only, until you close the tab. The
        PDF uses a standard Latin font, so characters outside it print as a question mark.
      </p>
    </div>
  );
}

/** Column captions, on the wide layout only — the stacked rows label themselves. */
function QuestionHeader() {
  return (
    <div className="hidden gap-2 sm:grid sm:grid-cols-[28px_1fr_80px_128px_32px]">
      {["#", "Question", "Marks", "Answer space", ""].map((label, index) => (
        <span
          key={label === "" ? `spacer-${index}` : label}
          className={cn(
            "text-[11px] font-medium uppercase tracking-[0.06em] text-muted",
            index === 2 && "text-right",
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function QuestionRow({
  number,
  question,
  onChange,
  onRemove,
  removable,
}: {
  number: number;
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const control =
    "h-10 w-full rounded-md border border-line bg-surface px-3 text-[14px] text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20";

  return (
    <div className="grid gap-2 sm:grid-cols-[28px_1fr_80px_128px_32px] sm:items-center">
      {/* Auto-numbered from the row's position, and the PDF numbers the same
          way — a row deleted from the middle renumbers everything below it. */}
      <span className="hidden h-10 items-center font-mono text-[13px] tabular-nums text-muted sm:flex">
        {number}.
      </span>
      <input
        aria-label={`Question ${number}`}
        value={question.text}
        onChange={(event) => onChange({ text: event.target.value })}
        placeholder="Write 3/4 as a decimal."
        className={control}
      />
      <input
        aria-label={`Marks for question ${number}`}
        value={question.marks}
        onChange={(event) => onChange({ marks: event.target.value })}
        inputMode="decimal"
        placeholder="—"
        className={cn(control, "font-mono tabular-nums placeholder:font-sans sm:text-right")}
      />
      <select
        aria-label={`Answer space for question ${number}`}
        value={question.space}
        onChange={(event) => onChange({ space: event.target.value as AnswerSpace })}
        className={cn(control, "cursor-pointer")}
      >
        {ANSWER_SPACES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRemove}
        disabled={!removable}
        aria-label={`Remove question ${number}`}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[18px] leading-none text-muted transition-colors hover:border-line hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30"
      >
        ×
      </button>
    </div>
  );
}

/**
 * A file input dressed as a button, with the picked logo shown next to it — the
 * same control the Invoice Generator uses, for the same reason: one small file
 * picked once doesn't warrant a drop target.
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
        School logo
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
        {error ?? "JPG, PNG or WebP. Drawn top-left of the page and never uploaded."}
      </p>
    </div>
  );
}

/** A plain labelled checkbox — the only boolean on the form, so not worth a component in ui/field. */
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 cursor-pointer accent-accent"
      />
      {label}
    </label>
  );
}

/** 5 rather than 5.00 in the marks tally. */
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
