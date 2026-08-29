/**
 * The weekly grid for the Study Planner. A row list and a set of days go in, a
 * timetable comes out — days as columns, time slots as rows — and the same grid
 * is rendered on screen and onto a landscape A4 sheet through lib/pdf-text.ts.
 *
 * Nothing here allocates anything. The grid is whatever the person built: rows
 * are generated from a start time, an end time and a slot length, breaks are
 * inserted by hand and take their own time out of the day, and every cell is
 * assigned one at a time. So Monday at 6pm and Tuesday at 6pm are free to hold
 * different subjects, which is the thing a rotation could never express.
 *
 * The one derived quantity is how many slot rows fit: that follows from the
 * window and the breaks, so nudging the slot length re-times the day rather than
 * leaving rows hanging past bedtime. Assignments ride along by position.
 */

import { PDFDocument } from "pdf-lib";
import type { PDFPage } from "pdf-lib";

import {
  A4_HEIGHT,
  A4_WIDTH,
  LINE,
  MARGIN,
  MUTED,
  drawText,
  loadFonts,
  parseNumber,
  slugifyName,
  wrapLines,
} from "./pdf-text";
import type { Fonts } from "./pdf-text";
import { bytesToBlob } from "./utils";

/* --------------------------------------------------------------------- model */

export interface Subject {
  /** Stable across re-renders so React keys survive a row being removed. */
  id: string;
  name: string;
  /** Hours a week, as typed. A reference count only — nothing distributes it. */
  hours: string;
}

export type RowKind = "slot" | "break";

export interface PlanRow {
  id: string;
  kind: RowKind;
  /** Break rows only: what the row is called, e.g. "Lunch break". */
  label: string;
  /** Break rows only: how long it takes, in minutes, as typed. */
  minutes: string;
  /** Slot rows only: day name → subject id, BREAK_CELL, or "" for empty. */
  cells: Record<string, string>;
}

export interface StudyPlanDetails {
  subjects: Subject[];
  /** Day names, from DAYS. Order follows DAYS, not the order they were ticked. */
  days: string[];
  /** Minutes a study slot runs for, as typed — one of SLOT_MINUTE_OPTIONS. */
  slotMinutes: string;
  /** "18:00", from a time input. */
  startTime: string;
  endTime: string;
  /** The rows in order, slots and breaks mixed. */
  rows: PlanRow[];
}

export interface SubjectShare {
  name: string;
  /** Hours a week typed into the form, 0 when left blank. */
  requested: number;
  /** Cells on the grid assigned to it. */
  cells: number;
  /** Those cells in hours. */
  hours: number;
}

export interface PlanCellView {
  /** The stored value: "" , BREAK_CELL, or a subject id. */
  value: string;
  /** What to print: "" for an empty cell. */
  text: string;
  isBreak: boolean;
}

export interface PlanRowView {
  id: string;
  kind: RowKind;
  /** "6:00 pm – 6:45 pm". */
  time: string;
  /** Break rows: the row's name, falling back to DEFAULT_BREAK_LABEL. */
  label: string;
  /** Slot rows: one entry per day, in plan.days order. Empty for a break row. */
  cells: PlanCellView[];
}

export interface StudyPlan {
  days: string[];
  rows: PlanRowView[];
  /** Cells on slot rows — the grid's capacity. */
  totalSlots: number;
  /** Those assigned to a subject. */
  filledSlots: number;
  shares: SubjectShare[];
  /** "6:00 pm – 9:00 pm", the span the rows actually cover. */
  span: string;
}

export type BuildResult = { ok: true; blob: Blob } | { ok: false; error: string };

export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** A weekday-only default: the days most people actually plan around. */
export const DEFAULT_DAYS = DAYS.slice(0, 5);

/** The cell value that blocks out one day's slot without a subject. */
export const BREAK_CELL = "break";

export const DEFAULT_BREAK_LABEL = "Break";
export const DEFAULT_BREAK_MINUTES = "15";

/** More rows than this and the cells stop being writable on a printed sheet. */
export const MAX_ROWS = 16;

export const SLOT_MINUTE_OPTIONS = [30, 45, 60, 90].map((minutes) => ({
  value: `${minutes}`,
  label: `${minutes} min`,
}));

const MINUTES_IN_DAY = 1440;

let counter = 0;

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function emptySubject(name = ""): Subject {
  return { id: nextId("subject"), name, hours: "" };
}

export function emptySlotRow(): PlanRow {
  return { id: nextId("row"), kind: "slot", label: "", minutes: "", cells: {} };
}

export function breakRow(label = DEFAULT_BREAK_LABEL): PlanRow {
  return {
    id: nextId("row"),
    kind: "break",
    label,
    minutes: DEFAULT_BREAK_MINUTES,
    cells: {},
  };
}

/** Subjects worth putting in a dropdown — a blank row in the form isn't one. */
export function namedSubjects(subjects: Subject[]): Subject[] {
  return subjects.filter((subject) => subject.name.trim() !== "");
}

/** The form's day list in week order, with anything unrecognised dropped. */
export function orderedDays(days: string[]): string[] {
  return DAYS.filter((day) => days.includes(day));
}

/** Whole hours, 0 to a week's worth — the reference count next to a subject. */
function subjectHours(subject: Subject): number {
  return Math.max(0, Math.min(168, Math.round(parseNumber(subject.hours))));
}

export function slotMinutesOf(details: StudyPlanDetails): number {
  const parsed = Math.round(parseNumber(details.slotMinutes));
  return parsed >= 5 && parsed <= 240 ? parsed : 60;
}

export function breakMinutesOf(row: PlanRow): number {
  const parsed = Math.round(parseNumber(row.minutes));
  return Math.max(5, Math.min(240, parsed || Number(DEFAULT_BREAK_MINUTES)));
}

/** Minutes past midnight from a "HH:MM" time input, or `fallback` if unparsable. */
export function parseTime(value: string, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (match === null) return fallback;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return fallback;

  return hour * 60 + minute;
}

/**
 * How long the study day runs. An end time at or before the start is read as
 * running past midnight rather than as an error — a 10pm–1am plan is a real one.
 */
export function windowMinutes(details: StudyPlanDetails): number {
  const start = parseTime(details.startTime, 18 * 60);
  const end = parseTime(details.endTime, 21 * 60);
  const span = end - start;

  return span > 0 ? span : span + MINUTES_IN_DAY;
}

/**
 * The row list re-fitted to the window. Breaks stay where they were put and keep
 * their time; slot rows are added or trimmed off the end to fill what's left.
 * Assignments ride along with the rows they're on, so changing the slot length
 * re-times the day without wiping a week that's already filled in.
 */
export function withFittedRows(details: StudyPlanDetails): StudyPlanDetails {
  const slotLength = slotMinutesOf(details);
  const breakTotal = details.rows
    .filter((row) => row.kind === "break")
    .reduce((total, row) => total + breakMinutesOf(row), 0);

  const room = Math.floor((windowMinutes(details) - breakTotal) / slotLength);
  const wanted = Math.max(1, Math.min(MAX_ROWS, room));

  const rows: PlanRow[] = [];
  let slots = 0;

  for (const row of details.rows) {
    if (row.kind === "break") {
      rows.push(row);
      continue;
    }
    if (slots >= wanted) continue;
    rows.push(row);
    slots += 1;
  }

  while (slots < wanted) {
    rows.push(emptySlotRow());
    slots += 1;
  }

  return { ...details, rows };
}

/** The grid as it will be drawn — times walked forward row by row. */
export function buildPlan(details: StudyPlanDetails): StudyPlan {
  const days = orderedDays(details.days);
  const subjects = namedSubjects(details.subjects);
  const names = new Map(subjects.map((subject) => [subject.id, subject.name.trim()]));
  const slotLength = slotMinutesOf(details);
  const start = parseTime(details.startTime, 18 * 60);

  const placed = new Map<string, number>();
  const rows: PlanRowView[] = [];
  let cursor = start;
  let totalSlots = 0;
  let filledSlots = 0;

  for (const row of details.rows) {
    const length = row.kind === "break" ? breakMinutesOf(row) : slotLength;
    const time = `${clockLabel(cursor)} – ${clockLabel(cursor + length)}`;
    cursor += length;

    if (row.kind === "break") {
      rows.push({
        id: row.id,
        kind: "break",
        time,
        label: row.label.trim() === "" ? DEFAULT_BREAK_LABEL : row.label.trim(),
        cells: [],
      });
      continue;
    }

    const cells = days.map((day) => {
      const value = row.cells[day] ?? "";
      totalSlots += 1;

      if (value === BREAK_CELL) {
        return { value, text: DEFAULT_BREAK_LABEL, isBreak: true };
      }

      // A cell pointing at a subject that has since been deleted or blanked
      // reads as empty rather than as a stale name.
      const name = names.get(value);
      if (name === undefined || name === "") return { value: "", text: "", isBreak: false };

      placed.set(value, (placed.get(value) ?? 0) + 1);
      filledSlots += 1;

      return { value, text: name, isBreak: false };
    });

    rows.push({ id: row.id, kind: "slot", time, label: "", cells });
  }

  const shares: SubjectShare[] = subjects.map((subject) => {
    const cells = placed.get(subject.id) ?? 0;
    return {
      name: subject.name.trim(),
      requested: subjectHours(subject),
      cells,
      hours: (cells * slotLength) / 60,
    };
  });

  return {
    days,
    rows,
    totalSlots,
    filledSlots,
    shares,
    span: `${clockLabel(start)} – ${clockLabel(cursor)}`,
  };
}

/** "Maths 3h of 4h" — the one place the shortfall wording lives. */
export function shareLabel(share: SubjectShare): string {
  const done = formatHours(share.hours);
  if (share.requested <= 0 || share.hours === share.requested) return `${share.name} ${done}`;

  return `${share.name} ${done} of ${formatHours(share.requested)}`;
}

/** Trailing zeros dropped — 45-minute slots make 2.25h a real answer. */
function formatHours(hours: number): string {
  return `${Math.round(hours * 100) / 100}h`;
}

/** "6:45 pm". A plan running past midnight wraps round the clock. */
function clockLabel(minutes: number): string {
  const total = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;

  return `${twelve}:${`${minute}`.padStart(2, "0")} ${suffix}`;
}

export function studyPlanFileName(details: StudyPlanDetails): string {
  const first = namedSubjects(details.subjects)[0];
  const subject = first === undefined ? "" : slugifyName(first.name, "");
  const parts = ["study-plan", subject].filter((part) => part !== "");

  return `${parts.join("-")}.pdf`;
}

/* -------------------------------------------------------------------- layout */

/** Landscape A4 — seven day columns don't fit legibly in portrait. */
const PAGE_WIDTH = A4_HEIGHT;
const PAGE_HEIGHT = A4_WIDTH;

const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** The time-label column down the left of the grid. */
const TIME_WIDTH = 108;

const HEADER_HEIGHT = 24;
const CELL_SIZE = 9;
const LABEL_SIZE = 7.5;

export async function buildStudyPlanPdf(details: StudyPlanDetails): Promise<BuildResult> {
  const plan = buildPlan(details);

  if (plan.days.length === 0) {
    return { ok: false, error: "Pick at least one day you can study on." };
  }
  if (plan.rows.length === 0) {
    return { ok: false, error: "Set a start and end time so there's at least one slot." };
  }

  try {
    const pdf = await PDFDocument.create();
    const fonts = await loadFonts(pdf);
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    pdf.setTitle("Weekly study plan");
    pdf.setCreator("Kaamvo Study Planner");

    const titleY = PAGE_HEIGHT - MARGIN - 12;

    drawText(page, "WEEKLY STUDY PLAN", { x: MARGIN, y: titleY, font: fonts.bold, size: 16 });
    drawText(page, summaryLine(plan), {
      x: PAGE_WIDTH - MARGIN,
      y: titleY,
      font: fonts.regular,
      size: 9.5,
      color: MUTED,
      align: "right",
    });

    const y = drawGrid(page, fonts, plan);

    if (plan.shares.length > 0) {
      drawShares(page, fonts, plan, y - 22);
    }

    return { ok: true, blob: bytesToBlob(await pdf.save(), "application/pdf") };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

function summaryLine(plan: StudyPlan): string {
  const days = plan.days.length === 1 ? "1 day" : `${plan.days.length} days`;

  return `${plan.span} · ${days}`;
}

/**
 * The grid itself: a header row of day names, a time label down each row, and
 * whatever was put in each cell. Rows are sized to the height left on the sheet,
 * so a three-row plan and a sixteen-row one both fill the page.
 */
function drawGrid(page: PDFPage, fonts: Fonts, plan: StudyPlan): number {
  const top = PAGE_HEIGHT - MARGIN - 38;
  const columnWidth = (CONTENT_WIDTH - TIME_WIDTH) / plan.days.length;
  const rows = plan.rows.length;

  // Room is left under the grid for the per-subject summary.
  const available = top - (MARGIN + 54) - HEADER_HEIGHT;
  const rowHeight = Math.max(18, Math.min(46, available / Math.max(1, rows)));
  const gridBottom = top - HEADER_HEIGHT - rows * rowHeight;

  plan.days.forEach((day, index) => {
    const x = MARGIN + TIME_WIDTH + index * columnWidth;

    // A tint behind the header, which is what makes the days read as headings
    // when the sheet is printed in black and white.
    page.drawRectangle({
      x,
      y: top - HEADER_HEIGHT,
      width: columnWidth,
      height: HEADER_HEIGHT,
      color: LINE,
      opacity: 0.35,
    });
    drawText(page, day, {
      x: x + columnWidth / 2,
      y: top - HEADER_HEIGHT + 8,
      font: fonts.bold,
      size: LABEL_SIZE,
      align: "center",
    });
  });

  plan.rows.forEach((row, index) => {
    const cellTop = top - HEADER_HEIGHT - index * rowHeight;
    const middle = cellTop - rowHeight / 2 - 3;

    drawText(page, row.time, {
      x: MARGIN + 4,
      y: middle,
      font: fonts.regular,
      size: LABEL_SIZE,
      color: MUTED,
    });

    if (row.kind === "break") {
      // One band across every day column: a break is the whole grid's break,
      // and a tint says so faster than the word repeated five times.
      page.drawRectangle({
        x: MARGIN + TIME_WIDTH,
        y: cellTop - rowHeight,
        width: CONTENT_WIDTH - TIME_WIDTH,
        height: rowHeight,
        color: LINE,
        opacity: 0.28,
      });
      drawText(page, row.label, {
        x: MARGIN + TIME_WIDTH + (CONTENT_WIDTH - TIME_WIDTH) / 2,
        y: middle,
        font: fonts.bold,
        size: CELL_SIZE,
        color: MUTED,
        align: "center",
      });
      return;
    }

    row.cells.forEach((cell, column) => {
      if (cell.text === "") return;

      const x = MARGIN + TIME_WIDTH + column * columnWidth;

      if (cell.isBreak) {
        page.drawRectangle({
          x,
          y: cellTop - rowHeight,
          width: columnWidth,
          height: rowHeight,
          color: LINE,
          opacity: 0.28,
        });
      }

      // Two lines at most: a cell is a slot on a printed sheet, not a place for
      // a sentence.
      const lines = wrapLines(cell.text, fonts.regular, CELL_SIZE, columnWidth - 12).slice(0, 2);
      const blockTop = middle + (lines.length - 1) * 5.5;

      lines.forEach((line, offset) => {
        drawText(page, line, {
          x: x + columnWidth / 2,
          y: blockTop - offset * 11,
          font: fonts.regular,
          size: CELL_SIZE,
          color: cell.isBreak ? MUTED : undefined,
          align: "center",
        });
      });
    });
  });

  drawGridLines(page, plan, top, columnWidth, rowHeight, gridBottom);

  return gridBottom;
}

/** The rules, drawn last so no cell text sits on top of one. */
function drawGridLines(
  page: PDFPage,
  plan: StudyPlan,
  top: number,
  columnWidth: number,
  rowHeight: number,
  bottom: number,
): void {
  const rows = plan.rows.length;
  const hairline = { color: LINE, borderWidth: 0 } as const;

  for (let row = 0; row <= rows; row += 1) {
    const y = top - HEADER_HEIGHT - row * rowHeight;
    page.drawRectangle({ x: MARGIN, y, width: CONTENT_WIDTH, height: 0.6, ...hairline });
  }

  // The header's own top edge, plus a vertical for every column boundary.
  page.drawRectangle({ x: MARGIN, y: top, width: CONTENT_WIDTH, height: 0.6, ...hairline });

  for (let column = 0; column <= plan.days.length; column += 1) {
    const x = MARGIN + TIME_WIDTH + column * columnWidth;
    page.drawRectangle({ x, y: bottom, width: 0.6, height: top - bottom, ...hairline });
  }

  page.drawRectangle({ x: MARGIN, y: bottom, width: 0.6, height: top - bottom, ...hairline });
}

/**
 * Hours on the grid per subject, under it — the check that the week matches what
 * was intended, and the one place a shortfall is stated in words.
 */
function drawShares(page: PDFPage, fonts: Fonts, plan: StudyPlan, y: number): void {
  drawText(page, "HOURS A WEEK", { x: MARGIN, y, font: fonts.bold, size: LABEL_SIZE, color: MUTED });

  const line = plan.shares.map(shareLabel).join("   ·   ");

  let cursor = y - 14;
  for (const text of wrapLines(line, fonts.regular, 9, CONTENT_WIDTH)) {
    drawText(page, text, { x: MARGIN, y: cursor, font: fonts.regular, size: 9 });
    cursor -= 12;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message;
  return "Couldn't build the study plan PDF.";
}
