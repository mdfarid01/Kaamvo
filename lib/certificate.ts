/**
 * Certificate layout for the Certificate Maker. A filled-in form goes in, a
 * landscape A4 PDF comes out — the same split as lib/invoice.ts, so the UI layer
 * holds form state and nothing else touches pdf-lib.
 *
 * Two things differ from the invoice. The page is turned on its side, which is
 * only a matter of swapping the A4 constants when the page is added. And every
 * line is centred on the page rather than run down a column, so the vertical
 * cursor is the whole layout: each block draws at the cursor and moves it down,
 * and a missing field costs its own space instead of leaving a gap.
 *
 * The logo goes through lib/invoice.ts's loadLogo, so both tools normalise an
 * upload to PNG bytes the same way and only embedPng is ever called here. The
 * signature image takes the same path — it wants exactly what a logo wants, a
 * long-edge cap and transparency kept, so it gets its own box and nothing else.
 */

import { PDFDocument } from "pdf-lib";
import type { PDFFont, PDFImage, PDFPage } from "pdf-lib";

import type { Logo } from "./invoice";
import {
  A4_HEIGHT,
  A4_WIDTH,
  ACCENT,
  INK,
  LINE,
  MUTED,
  drawRule,
  drawText,
  formatDate,
  loadFonts,
  slugifyName,
  widthOf,
  wrapLines,
} from "./pdf-text";
import type { Fonts } from "./pdf-text";
import { bytesToBlob } from "./utils";

export { loadLogo } from "./invoice";
export type { Logo } from "./invoice";

/* --------------------------------------------------------------------- model */

export interface CertificateDetails {
  recipientName: string;
  /** "Certificate of Participation" and the like — the heading on the page. */
  title: string;
  eventName: string;
  /** yyyy-mm-dd from a date input, or free text. */
  date: string;
  issuerName: string;
  /** "Event Coordinator" — printed under the signature rule. */
  signatureLabel: string;
  /** The line above the name. Blank falls back to DEFAULT_PREAMBLE. */
  preamble: string;
  /** The line above the event name. Blank falls back to DEFAULT_EVENT_PREAMBLE. */
  eventPreamble: string;
  logo: Logo | null;
  /** Drawn on the signature rule, in place of the space left to sign by hand. */
  signatureImage: Logo | null;
}

export type BuildResult = { ok: true; blob: Blob } | { ok: false; error: string };

/** The headings people actually ask for, offered rather than left to a blank field. */
export const TITLE_PRESETS = [
  "Certificate of Participation",
  "Certificate of Completion",
  "Certificate of Achievement",
  "Certificate of Appreciation",
  "Certificate of Excellence",
];

export const DEFAULT_TITLE = TITLE_PRESETS[0];

/* -------------------------------------------------------------------- layout */

/** A4 turned on its side: the same two numbers, swapped. */
const PAGE_WIDTH = A4_HEIGHT;
const PAGE_HEIGHT = A4_WIDTH;

const CENTER_X = PAGE_WIDTH / 2;

/**
 * Generous side margins — wider than the invoice's, because centred lines look
 * cramped when they run the full width of a landscape page.
 */
const SIDE = 96;
const CONTENT_WIDTH = PAGE_WIDTH - SIDE * 2;

/** The two nested rules that make the border. Points in from the page edge. */
const BORDER_OUTER = 22;
const BORDER_INNER = 30;

const LOGO_BOX = { width: 150, height: 56 };

/**
 * The signature sits in the gap above the rule, so it is capped short enough to
 * clear the event text however tall the upload happens to be.
 */
const SIGNATURE_BOX = { width: 170, height: 44 };

/** Points of air between the foot of the signature image and the rule it sits on. */
const SIGNATURE_LIFT = 4;

/** Where the signature and date blocks sit, measured up from the page bottom. */
const FOOT_RULE_Y = 104;

const NAME_MAX_SIZE = 36;
const NAME_MIN_SIZE = 18;

export const DEFAULT_PREAMBLE = "This is to certify that";
export const DEFAULT_EVENT_PREAMBLE = "in recognition of";

export async function buildCertificatePdf(details: CertificateDetails): Promise<BuildResult> {
  if (details.recipientName.trim() === "") {
    return { ok: false, error: "Add the recipient's name — it's the one thing a certificate needs." };
  }

  try {
    const pdf = await PDFDocument.create();
    const fonts = await loadFonts(pdf);

    const title = titleOf(details);
    pdf.setTitle(`${title} — ${details.recipientName.trim()}`);
    pdf.setCreator("Kaamvo Certificate Maker");

    let logo: PDFImage | null = null;
    if (details.logo !== null) {
      try {
        logo = await pdf.embedPng(details.logo.data);
      } catch {
        return { ok: false, error: "Couldn't put that logo into the PDF — try a different image." };
      }
    }

    let signatureImage: PDFImage | null = null;
    if (details.signatureImage !== null) {
      try {
        signatureImage = await pdf.embedPng(details.signatureImage.data);
      } catch {
        return {
          ok: false,
          error: "Couldn't put that signature into the PDF — try a different image.",
        };
      }
    }

    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    drawBorder(page);
    drawBody(page, fonts, details, title, logo);
    drawFoot(page, fonts, details, signatureImage);

    return { ok: true, blob: bytesToBlob(await pdf.save(), "application/pdf") };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** certificate-anita-rao.pdf, so a folder of a class's worth sorts by name. */
export function certificateFileName(details: CertificateDetails): string {
  return `certificate-${slugifyName(details.recipientName, "certificate")}.pdf`;
}

export function titleOf(details: CertificateDetails): string {
  const trimmed = details.title.trim();
  return trimmed === "" ? DEFAULT_TITLE : trimmed;
}

/**
 * The two connector lines, blank falling back to the stock phrasing — the same
 * rule the heading follows, so an emptied field never prints a gap.
 */
export function preambleOf(details: CertificateDetails): string {
  const trimmed = details.preamble.trim();
  return trimmed === "" ? DEFAULT_PREAMBLE : trimmed;
}

export function eventPreambleOf(details: CertificateDetails): string {
  const trimmed = details.eventPreamble.trim();
  return trimmed === "" ? DEFAULT_EVENT_PREAMBLE : trimmed;
}

/**
 * Two nested rectangles: a heavier outer rule in the site's accent and a
 * hairline inside it. pdf-lib has no border primitive beyond drawRectangle's
 * own stroke, and a stroked rect is all a plain certificate frame is.
 */
function drawBorder(page: PDFPage): void {
  page.drawRectangle({
    x: BORDER_OUTER,
    y: BORDER_OUTER,
    width: PAGE_WIDTH - BORDER_OUTER * 2,
    height: PAGE_HEIGHT - BORDER_OUTER * 2,
    borderColor: ACCENT,
    borderWidth: 2.5,
  });
  page.drawRectangle({
    x: BORDER_INNER,
    y: BORDER_INNER,
    width: PAGE_WIDTH - BORDER_INNER * 2,
    height: PAGE_HEIGHT - BORDER_INNER * 2,
    borderColor: LINE,
    borderWidth: 0.75,
  });
}

function drawBody(
  page: PDFPage,
  fonts: Fonts,
  details: CertificateDetails,
  title: string,
  logo: PDFImage | null,
): void {
  let y = PAGE_HEIGHT - 96;

  if (logo !== null) {
    const scale = Math.min(LOGO_BOX.width / logo.width, LOGO_BOX.height / logo.height);
    const width = logo.width * scale;
    const height = logo.height * scale;
    // Hung from a fixed top edge, so a wide logo and a tall one both start level.
    page.drawImage(logo, {
      x: CENTER_X - width / 2,
      y: PAGE_HEIGHT - 70 - height,
      width,
      height,
    });
    y = PAGE_HEIGHT - 70 - height - 34;
  }

  // Upper-cased rather than letter-spaced: drawText writes one string, and
  // pdf-lib's standard fonts have no tracking to set.
  drawText(page, title.toUpperCase(), {
    x: CENTER_X,
    y,
    font: fonts.bold,
    size: fitSize(title.toUpperCase(), fonts.bold, 24, 14, CONTENT_WIDTH),
    align: "center",
  });
  y -= 16;

  drawRule(page, { x: CENTER_X - 55, y, width: 110, color: ACCENT, thickness: 1.5 });
  y -= 38;

  // One line, as before — a connector long enough to overrun the margins would
  // overhang rather than wrap.
  drawText(page, preambleOf(details), {
    x: CENTER_X,
    y,
    font: fonts.regular,
    size: 11,
    color: MUTED,
    align: "center",
  });
  y -= 44;

  const name = details.recipientName.trim();
  const nameSize = fitSize(name, fonts.bold, NAME_MAX_SIZE, NAME_MIN_SIZE, CONTENT_WIDTH);
  drawText(page, name, {
    x: CENTER_X,
    y,
    font: fonts.bold,
    size: nameSize,
    color: ACCENT,
    align: "center",
  });
  y -= 18;

  // A rule as wide as the name it underlines, within reason — a two-character
  // name shouldn't get a two-character rule.
  const ruleWidth = Math.min(CONTENT_WIDTH, Math.max(220, widthOf(name, fonts.bold, nameSize) + 70));
  drawRule(page, { x: CENTER_X - ruleWidth / 2, y, width: ruleWidth });

  const event = details.eventName.trim();
  if (event === "") return;

  y -= 36;
  drawText(page, eventPreambleOf(details), {
    x: CENTER_X,
    y,
    font: fonts.regular,
    size: 11,
    color: MUTED,
    align: "center",
  });
  y -= 26;

  // A long course name wraps; nothing below it moves, since the foot blocks are
  // pinned to the page bottom. Four lines is where it would start to crowd them.
  for (const line of wrapLines(event, fonts.bold, 15, CONTENT_WIDTH)) {
    drawText(page, line, { x: CENTER_X, y, font: fonts.bold, size: 15, align: "center" });
    y -= 21;
  }
}

/**
 * The date on the left and the signature on the right, both pinned to the page
 * bottom so they stay level with each other whatever the middle came out as.
 */
function drawFoot(
  page: PDFPage,
  fonts: Fonts,
  details: CertificateDetails,
  signatureImage: PDFImage | null,
): void {
  const blockWidth = 200;
  const date = formatDate(details.date);
  const issuer = details.issuerName.trim();
  const signature = details.signatureLabel.trim();

  if (date !== "") {
    drawFootBlock(page, fonts, {
      x: SIDE,
      width: blockWidth,
      value: date,
      label: "Date",
    });
  }

  // A signature image alone is reason enough for the block — it has a rule to
  // sit on even when nobody typed an issuer or a label.
  if (issuer !== "" || signature !== "" || signatureImage !== null) {
    drawFootBlock(page, fonts, {
      x: PAGE_WIDTH - SIDE - blockWidth,
      width: blockWidth,
      value: issuer,
      label: signature === "" ? "Signature" : signature,
      image: signatureImage,
    });
  }
}

function drawFootBlock(
  page: PDFPage,
  fonts: Fonts,
  block: {
    x: number;
    width: number;
    value: string;
    label: string;
    image?: PDFImage | null;
  },
): void {
  const center = block.x + block.width / 2;

  const image = block.image ?? null;
  if (image !== null) {
    // Fitted to a box and stood on the rule, so a wide scan and a tall one both
    // sign the same line rather than one of them crossing it.
    const scale = Math.min(
      SIGNATURE_BOX.width / image.width,
      SIGNATURE_BOX.height / image.height,
    );
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {
      x: center - width / 2,
      y: FOOT_RULE_Y + SIGNATURE_LIFT,
      width,
      height,
    });
  }

  drawRule(page, { x: block.x, y: FOOT_RULE_Y, width: block.width, color: INK, thickness: 0.75 });

  if (block.value !== "") {
    drawText(page, block.value, {
      x: center,
      y: FOOT_RULE_Y - 18,
      font: fonts.bold,
      size: 11,
      align: "center",
    });
  }

  drawText(page, block.label.toUpperCase(), {
    x: center,
    y: FOOT_RULE_Y - (block.value === "" ? 18 : 34),
    font: fonts.regular,
    size: 8,
    color: MUTED,
    align: "center",
  });
}

/**
 * The largest whole size at which `text` fits `maxWidth`, down to `min`. A name
 * longer than the page is drawn at `min` and allowed to overhang rather than
 * shrinking to nothing — the overhang is visible, a 6-point name reads as a bug.
 */
function fitSize(text: string, font: PDFFont, max: number, min: number, maxWidth: number): number {
  let size = max;
  while (size > min && widthOf(text, font, size) > maxWidth) {
    size -= 1;
  }

  return size;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message;
  return "Couldn't build the certificate PDF.";
}
