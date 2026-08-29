/**
 * Page layout for the Worksheet Maker. A filled-in form goes in, a printable A4
 * PDF comes out — the same split as lib/invoice.ts, so the UI layer holds form
 * state and nothing else touches pdf-lib.
 *
 * Everything typographic is borrowed from lib/pdf-text.ts, and the logo is
 * borrowed wholesale from lib/invoice.ts: a school crest and a company logo have
 * the same problem (arbitrary format, arbitrary size, must not be uploaded), and
 * loadLogo already solves it by re-encoding through a canvas to PNG.
 *
 * The one thing this file does that the invoice doesn't is paginate *inside* a
 * row. A question with a large answer space can be taller than a whole page, so
 * the ruled lines are emitted one at a time with a page check on each — the
 * question text stays whole, the blank lines below it spill.
 */

import { PDFDocument } from "pdf-lib";
import type { PDFImage, PDFPage } from "pdf-lib";

// A school crest and a company logo are the same problem, and lib/invoice.ts
// already solves it — its loader is re-exported below rather than
// reimplemented, so there's one canvas-based normaliser to keep correct.
import type { Logo } from "./invoice";
import {
  A4_HEIGHT,
  A4_WIDTH,
  INK,
  LINE,
  MARGIN,
  MUTED,
  drawRule,
  drawText,
  loadFonts,
  parseNumber,
  slugifyName,
  wrapLines,
} from "./pdf-text";
import type { Fonts } from "./pdf-text";
import { bytesToBlob } from "./utils";

/* --------------------------------------------------------------------- model */

/** How much ruled blank space is left under a question for the answer. */
export type AnswerSpace = "none" | "small" | "medium" | "large";

export const ANSWER_SPACES: Array<{ value: AnswerSpace; label: string }> = [
  { value: "none", label: "None" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

/** Ruled lines drawn per size. Proportional, so "large" reads as twice "medium". */
const ANSWER_LINES: Record<AnswerSpace, number> = {
  none: 0,
  small: 2,
  medium: 4,
  large: 8,
};

export interface Question {
  /** Stable across re-renders so React keys survive a row being removed. */
  id: string;
  text: string;
  /** Kept as typed rather than as a number — an empty field isn't 0 to a teacher. */
  marks: string;
  space: AnswerSpace;
}

export interface WorksheetDetails {
  title: string;
  subject: string;
  instructions: string;
  schoolName: string;
  /** Whether to print the "Name / Date" rules a printed worksheet is filled in on. */
  nameLine: boolean;
  questions: Question[];
  logo: Logo | null;
}

export type BuildResult = { ok: true; blob: Blob } | { ok: false; error: string };

let counter = 0;

export function emptyQuestion(): Question {
  counter += 1;
  return { id: `question-${counter}`, text: "", marks: "", space: "none" };
}

/** Rows worth printing — a blank row left at the bottom of the form isn't one. */
export function answerableQuestions(questions: Question[]): Question[] {
  return questions.filter((question) => question.text.trim() !== "");
}

/** The mark total printed in the header, and 0 when nobody filled marks in. */
export function totalMarks(questions: Question[]): number {
  return questions.reduce((sum, question) => sum + Math.max(0, parseNumber(question.marks)), 0);
}

/* -------------------------------------------------------------------- layout */

const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;
const RIGHT_EDGE = MARGIN + CONTENT_WIDTH;

/** The number sits in its own gutter so wrapped question text stays aligned. */
const NUMBER_GUTTER = 26;
const TEXT_LEFT = MARGIN + NUMBER_GUTTER;

/** Room kept at the right for a "[5]" marks tag, whether or not one is printed. */
const MARKS_GUTTER = 42;
const TEXT_WIDTH = CONTENT_WIDTH - NUMBER_GUTTER - MARKS_GUTTER;

const BODY_SIZE = 11;
const LINE_HEIGHT = 15.5;
const LABEL_SIZE = 8;

/** Ruled answer lines, spaced for handwriting rather than for print. */
const ANSWER_GAP = 22;

const LOGO_BOX = { width: 96, height: 48 };

/** Where a page stops taking content. */
const BOTTOM_LIMIT = MARGIN + 24;

const TOP_BASELINE = A4_HEIGHT - MARGIN - 14;

/**
 * A cursor over however many pages the worksheet turns out to need. `y` is always
 * the baseline of the *next* line to draw — the same convention lib/invoice.ts
 * uses, and what lets a long question list spill onto page two without any of
 * the draw functions knowing there is one.
 */
interface Sheet {
  readonly pdf: PDFDocument;
  readonly fonts: Fonts;
  page: PDFPage;
  y: number;
}

export async function buildWorksheetPdf(details: WorksheetDetails): Promise<BuildResult> {
  const questions = answerableQuestions(details.questions);

  if (details.title.trim() === "") {
    return { ok: false, error: "Give the worksheet a title — it's the one thing it needs." };
  }
  if (questions.length === 0) {
    return { ok: false, error: "Add at least one question." };
  }

  try {
    const pdf = await PDFDocument.create();
    const fonts = await loadFonts(pdf);

    pdf.setTitle(details.title.trim());
    pdf.setCreator("Kaamvo Worksheet Maker");

    let logo: PDFImage | null = null;
    if (details.logo !== null) {
      try {
        logo = await pdf.embedPng(details.logo.data);
      } catch {
        return { ok: false, error: "Couldn't put that logo into the PDF — try a different image." };
      }
    }

    const sheet: Sheet = { pdf, fonts, page: newPage(pdf), y: TOP_BASELINE };

    drawHeader(sheet, details, logo, questions);
    drawInstructions(sheet, details);
    drawQuestions(sheet, questions);

    return { ok: true, blob: bytesToBlob(await pdf.save(), "application/pdf") };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** worksheet-fractions-class-6.pdf, so a folder of them sorts sensibly. */
export function worksheetFileName(details: WorksheetDetails): string {
  const title = slugifyName(details.title, "");
  const parts = ["worksheet", title].filter((part) => part !== "");

  return `${parts.join("-")}.pdf`;
}

function newPage(pdf: PDFDocument): PDFPage {
  return pdf.addPage([A4_WIDTH, A4_HEIGHT]);
}

/**
 * Starts a new page when `needed` points won't fit above the bottom limit, and
 * says whether it did.
 */
function ensureRoom(sheet: Sheet, needed: number): boolean {
  if (sheet.y - needed >= BOTTOM_LIMIT) return false;

  sheet.page = newPage(sheet.pdf);
  sheet.y = TOP_BASELINE;
  return true;
}

function drawHeader(
  sheet: Sheet,
  details: WorksheetDetails,
  logo: PDFImage | null,
  questions: Question[],
): void {
  const { fonts } = sheet;
  const school = details.schoolName.trim();

  if (logo !== null) {
    const scale = Math.min(LOGO_BOX.width / logo.width, LOGO_BOX.height / logo.height);
    const width = logo.width * scale;
    const height = logo.height * scale;
    // Hung from the top edge, so a wide crest and a tall one start level.
    sheet.page.drawImage(logo, { x: MARGIN, y: sheet.y + 10 - height, width, height });
    sheet.y -= Math.max(0, height - 10) + 14;
  }

  if (school !== "") {
    drawText(sheet.page, school, {
      x: A4_WIDTH / 2,
      y: sheet.y,
      font: fonts.bold,
      size: 12,
      color: MUTED,
      align: "center",
    });
    sheet.y -= 22;
  }

  drawText(sheet.page, details.title.trim(), {
    x: A4_WIDTH / 2,
    y: sheet.y,
    font: fonts.bold,
    size: 17,
    align: "center",
  });
  sheet.y -= 20;

  // Subject on the left, marks on the right, on one line — a worksheet header
  // that runs to four stacked rows eats the first question's space.
  const subject = details.subject.trim();
  const marks = totalMarks(questions);
  const hasMeta = subject !== "" || marks > 0;

  if (hasMeta) {
    if (subject !== "") {
      drawText(sheet.page, subject, {
        x: MARGIN,
        y: sheet.y,
        font: fonts.regular,
        size: 10,
        color: MUTED,
      });
    }
    if (marks > 0) {
      drawText(sheet.page, `Total: ${trimZeros(marks)} marks`, {
        x: RIGHT_EDGE,
        y: sheet.y,
        font: fonts.regular,
        size: 10,
        color: MUTED,
        align: "right",
      });
    }
    sheet.y -= 12;
  }

  drawRule(sheet.page, { x: MARGIN, y: sheet.y, width: CONTENT_WIDTH });
  sheet.y -= 24;

  if (details.nameLine) drawNameLine(sheet);
}

/** The two rules a printed worksheet is filled in on, side by side. */
function drawNameLine(sheet: Sheet): void {
  const { fonts } = sheet;
  const dateWidth = 150;
  const gap = 24;
  const nameWidth = CONTENT_WIDTH - dateWidth - gap;

  const fields: Array<{ label: string; x: number; width: number }> = [
    { label: "Name", x: MARGIN, width: nameWidth },
    { label: "Date", x: MARGIN + nameWidth + gap, width: dateWidth },
  ];

  for (const field of fields) {
    drawText(sheet.page, `${field.label}:`, {
      x: field.x,
      y: sheet.y,
      font: fonts.regular,
      size: 10,
      color: MUTED,
    });
    // The rule runs from just after the caption to the end of that column.
    const captionWidth = 34;
    drawRule(sheet.page, {
      x: field.x + captionWidth,
      y: sheet.y - 3,
      width: field.width - captionWidth,
      color: LINE,
    });
  }

  sheet.y -= 28;
}

function drawInstructions(sheet: Sheet, details: WorksheetDetails): void {
  const instructions = details.instructions.trim();
  if (instructions === "") return;

  const lines = wrapLines(instructions, sheet.fonts.regular, 10, CONTENT_WIDTH - 24);

  ensureRoom(sheet, lines.length * 13 + 34);

  drawText(sheet.page, "INSTRUCTIONS", {
    x: MARGIN,
    y: sheet.y,
    font: sheet.fonts.bold,
    size: LABEL_SIZE,
    color: MUTED,
  });
  sheet.y -= 15;

  for (const line of lines) {
    drawText(sheet.page, line, {
      x: MARGIN,
      y: sheet.y,
      font: sheet.fonts.regular,
      size: 10,
      color: INK,
    });
    sheet.y -= 13;
  }

  sheet.y -= 12;
}

function drawQuestions(sheet: Sheet, questions: Question[]): void {
  questions.forEach((question, index) => {
    const lines = wrapLines(question.text.trim(), sheet.fonts.regular, BODY_SIZE, TEXT_WIDTH);
    const textHeight = lines.length * LINE_HEIGHT;

    // Checked before anything is drawn, so a question's own text is never split
    // across pages — only the blank space under it is.
    ensureRoom(sheet, textHeight);

    const baseline = sheet.y;

    drawText(sheet.page, `${index + 1}.`, {
      x: MARGIN,
      y: baseline,
      font: sheet.fonts.bold,
      size: BODY_SIZE,
    });

    lines.forEach((line, row) => {
      drawText(sheet.page, line, {
        x: TEXT_LEFT,
        y: baseline - row * LINE_HEIGHT,
        font: sheet.fonts.regular,
        size: BODY_SIZE,
      });
    });

    const marks = Math.max(0, parseNumber(question.marks));
    if (marks > 0) {
      drawText(sheet.page, `[${trimZeros(marks)}]`, {
        x: RIGHT_EDGE,
        y: baseline,
        font: sheet.fonts.regular,
        size: 10,
        color: MUTED,
        align: "right",
      });
    }

    sheet.y = baseline - textHeight;
    drawAnswerSpace(sheet, question.space);
    sheet.y -= 10;
  });
}

/**
 * The ruled blank lines under a question. Each line gets its own page check, so
 * a "large" space near the foot of a page continues on the next one instead of
 * running off the bottom.
 */
function drawAnswerSpace(sheet: Sheet, space: AnswerSpace): void {
  const count = ANSWER_LINES[space];

  for (let index = 0; index < count; index += 1) {
    sheet.y -= ANSWER_GAP;
    ensureRoom(sheet, 0);
    drawRule(sheet.page, { x: TEXT_LEFT, y: sheet.y, width: RIGHT_EDGE - TEXT_LEFT, thickness: 0.5 });
  }
}

/** 5 rather than 5.00 for a marks tag, but 2.5 stays 2.5. */
function trimZeros(value: number): string {
  return `${Math.round(value * 1000) / 1000}`;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message;
  return "Couldn't build the worksheet PDF.";
}

/* ---------------------------------------------------------------------- logo */

export { loadLogo } from "./invoice";
export type { LogoResult } from "./invoice";
export type { Logo };
