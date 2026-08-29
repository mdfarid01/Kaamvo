/**
 * Offer letter layout for the Offer Letter tool. A filled-in form goes in, a
 * letter-format PDF comes out — the same split as lib/invoice.ts and
 * lib/salary-slip.ts, which it shares its typesetting and logo handling with.
 *
 * Unlike the invoice and the payslip this document is mostly prose: the body is
 * built as a list of paragraphs and set one after another, and the terms field
 * is free text a person may paste a page into. So the page cursor here can spill
 * onto a second sheet — an offer letter that silently loses its last paragraph
 * would be worse than one that runs to two pages.
 *
 * None of that prose is fixed. Every sentence the letter used to hard-code is a
 * field holding a template, with the old wording as its default — see
 * fillTemplate below for the two bits of syntax those templates use.
 */

import { PDFDocument } from "pdf-lib";
import type { PDFImage, PDFPage } from "pdf-lib";

import type { Logo } from "./invoice";
import {
  A4_HEIGHT,
  A4_WIDTH,
  MARGIN,
  MUTED,
  drawRule,
  drawText,
  formatAmount,
  formatDate,
  loadFonts,
  parseNumber,
  slugifyName,
  wrapLines,
} from "./pdf-text";
import type { Fonts } from "./pdf-text";
import { bytesToBlob } from "./utils";

/* --------------------------------------------------------------------- model */

export type CompensationBasis = "annual" | "monthly";

export interface OfferLetterDetails {
  companyName: string;
  /** Optional. Printed under the company name on the letterhead. */
  companyAddress: string;
  candidateName: string;
  position: string;
  /** yyyy-mm-dd from a date input, or free text. */
  joiningDate: string;
  /** Optional, as typed. Omitted from the letter entirely when blank. */
  compensation: string;
  compensationBasis: CompensationBasis;
  /** Free text — one paragraph per blank line, set as its own block. */
  terms: string;
  issuerName: string;
  issuerTitle: string;
  /** The date on the letter, not the joining date. */
  date: string;
  logo: Logo | null;
  /** Drawn in the space above the issuer's rule, in place of signing by hand. */
  signature: Logo | null;

  /* The letter's own words. Each is a template; see fillTemplate. Blank falls
     back to the default for the short labelled lines, and drops the block
     entirely for the three body paragraphs — a paragraph is a thing you might
     genuinely not want, a sign-off is not. */
  salutation: string;
  subjectLine: string;
  offerParagraph: string;
  governingParagraph: string;
  termsHeading: string;
  closingParagraph: string;
  signOff: string;
  acceptanceLabel: string;
}

export type BuildResult = { ok: true; blob: Blob } | { ok: false; error: string };

export const BASIS_OPTIONS: Array<{ value: CompensationBasis; label: string }> = [
  { value: "annual", label: "Per year (CTC)" },
  { value: "monthly", label: "Per month" },
];

/** The rupee sign; toWinAnsi prints it as "Rs." because Helvetica has no glyph. */
const RUPEE = "₹";

/**
 * The compensation sentence's tail — "per annum" reads as a contract where "a
 * year" reads as a chat, and this is a document someone signs.
 */
function basisPhrase(basis: CompensationBasis): string {
  return basis === "monthly" ? "per month" : "per annum";
}

/** "Rs. 12,00,000.00 per annum", or "" when nothing was typed. */
export function compensationLabel(details: OfferLetterDetails): string {
  const amount = parseNumber(details.compensation);
  if (details.compensation.trim() === "" || amount <= 0) return "";

  return `${RUPEE} ${formatAmount(amount)} ${basisPhrase(details.compensationBasis)}`;
}

/* ------------------------------------------------------------------ wording */

export const DEFAULT_SALUTATION = "Dear {candidate},";
export const DEFAULT_SUBJECT_LINE = "Subject: Offer of employment — {position}";
export const DEFAULT_OFFER_PARAGRAPH =
  "We are pleased to offer you the position of {position} at {company}" +
  "[, with a start date of {joining}].[ Your compensation for this role will be {compensation}.]";
export const DEFAULT_GOVERNING_PARAGRAPH =
  "This offer is made on the basis of the information you have provided and is subject to the terms set out below. Your appointment will be governed by the policies of {company} as they apply from time to time.";
export const DEFAULT_TERMS_HEADING = "TERMS & NOTES";
export const DEFAULT_CLOSING_PARAGRAPH =
  "Please confirm your acceptance by signing and returning a copy of this letter. We look forward to welcoming you to {company}.";
export const DEFAULT_SIGN_OFF = "Yours sincerely,";
export const DEFAULT_ACCEPTANCE_LABEL = "Accepted by the candidate (name, signature, date)";

/** The tokens the wording fields can use, listed for the form's hint. */
export const TEMPLATE_TOKENS = [
  "candidate",
  "company",
  "position",
  "joining",
  "compensation",
  "issuer",
  "issuerTitle",
  "date",
];

const TOKEN = /\{([A-Za-z]+)\}/g;

/** `[...]` — a run that only survives if every token inside it has a value. */
const OPTIONAL = /\[([^[\]]*)\]/g;

/** What each `{token}` stands for, as the letter would print it. */
function tokenValues(details: OfferLetterDetails): Record<string, string> {
  return {
    candidate: details.candidateName.trim(),
    company: details.companyName.trim(),
    position: details.position.trim(),
    joining: formatDate(details.joiningDate),
    compensation: compensationLabel(details),
    issuer: details.issuerName.trim(),
    issuerTitle: details.issuerTitle.trim(),
    date: formatDate(details.date),
  };
}

/**
 * A wording field, resolved. `{token}` is substituted; a `[bracketed]` run is
 * dropped whole when any token in it is empty, which is how the letter still
 * reads as a sentence when there's no joining date or no pay to state.
 *
 * An unknown `{token}` is left standing rather than silently deleted — a typo
 * you can see beats a sentence with a hole in it.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  const kept = template.replace(OPTIONAL, (_match, segment: string) => {
    const names = Array.from(segment.matchAll(TOKEN), (found) => found[1]);
    return names.every((name) => (values[name] ?? "") !== "") ? segment : "";
  });

  return kept.replace(TOKEN, (match, name: string) => values[name] ?? match).trim();
}

/** A labelled line: the stock phrasing when the field has been emptied. */
function labelOr(value: string, fallback: string): string {
  return value.trim() === "" ? fallback : value;
}

/** The offer paragraph as the PDF will phrase it — also what the form previews. */
export function renderOfferParagraph(details: OfferLetterDetails): string {
  return fillTemplate(details.offerParagraph, tokenValues(details));
}

/** offer-letter-priya-sharma.pdf */
export function offerLetterFileName(details: OfferLetterDetails): string {
  const candidate = slugifyName(details.candidateName, "");
  const parts = ["offer-letter", candidate].filter((part) => part !== "");

  return `${parts.join("-")}.pdf`;
}

/* -------------------------------------------------------------------- layout */

const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;
const RIGHT_EDGE = MARGIN + CONTENT_WIDTH;

const LOGO_BOX = { width: 140, height: 54 };

/** The rule the issuer signs on, and the box a scanned signature is fitted to. */
const SIGNATURE_RULE_WIDTH = 190;
const SIGNATURE_BOX = { width: 170, height: 44 };

/** Points of air between the foot of the signature image and the rule. */
const SIGNATURE_LIFT = 4;

const BODY_SIZE = 10.5;
const LINE_HEIGHT = 15.5;
const PARAGRAPH_GAP = 10;
const LABEL_SIZE = 7.5;

/** Where a page stops taking paragraphs, so a signature block always has room. */
const BOTTOM_LIMIT = MARGIN + 40;

/**
 * A cursor over however many pages the letter turns out to need. `y` is always
 * the baseline of the *next* line to draw — the convention lib/invoice.ts uses,
 * and what lets a long terms field spill onto page two without any of the
 * drawing functions knowing there is one.
 */
interface Sheet {
  readonly pdf: PDFDocument;
  readonly fonts: Fonts;
  page: PDFPage;
  y: number;
}

export async function buildOfferLetterPdf(details: OfferLetterDetails): Promise<BuildResult> {
  if (details.companyName.trim() === "") {
    return { ok: false, error: "Add the company name — an offer letter has to say who's offering." };
  }
  if (details.candidateName.trim() === "") {
    return { ok: false, error: "Add the candidate's name — that's who the letter is addressed to." };
  }
  if (details.position.trim() === "") {
    return { ok: false, error: "Add the position being offered." };
  }

  try {
    const pdf = await PDFDocument.create();
    const fonts = await loadFonts(pdf);

    pdf.setTitle(`Offer letter — ${details.candidateName.trim()}`);
    pdf.setCreator("Kaamvo Offer Letter");

    let logo: PDFImage | null = null;
    if (details.logo !== null) {
      try {
        logo = await pdf.embedPng(details.logo.data);
      } catch {
        return { ok: false, error: "Couldn't put that logo into the PDF — try a different image." };
      }
    }

    let signature: PDFImage | null = null;
    if (details.signature !== null) {
      try {
        signature = await pdf.embedPng(details.signature.data);
      } catch {
        return { ok: false, error: "Couldn't put that signature into the PDF — try a different image." };
      }
    }

    const sheet: Sheet = { pdf, fonts, page: newPage(pdf), y: A4_HEIGHT - MARGIN - 14 };
    const values = tokenValues(details);

    drawLetterhead(sheet, details, logo);
    drawOpening(sheet, details, values);
    drawBody(sheet, details, values);
    drawSignature(sheet, details, values, signature);

    return { ok: true, blob: bytesToBlob(await pdf.save(), "application/pdf") };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

function newPage(pdf: PDFDocument): PDFPage {
  return pdf.addPage([A4_WIDTH, A4_HEIGHT]);
}

/** Starts a new page when `needed` points won't fit above the bottom limit. */
function ensureRoom(sheet: Sheet, needed: number): void {
  if (sheet.y - needed >= BOTTOM_LIMIT) return;

  sheet.page = newPage(sheet.pdf);
  sheet.y = A4_HEIGHT - MARGIN - 14;
}

function drawLetterhead(sheet: Sheet, details: OfferLetterDetails, logo: PDFImage | null): void {
  const { fonts } = sheet;
  let y = sheet.y;

  if (logo !== null) {
    const scale = Math.min(LOGO_BOX.width / logo.width, LOGO_BOX.height / logo.height);
    const width = logo.width * scale;
    const height = logo.height * scale;
    // Hung from the top edge, so a wide logo and a tall one start level.
    sheet.page.drawImage(logo, { x: MARGIN, y: y + 10 - height, width, height });
    y += 10 - height - 16;
  }

  drawText(sheet.page, details.companyName.trim(), {
    x: MARGIN,
    y,
    font: fonts.bold,
    size: 16,
  });
  y -= LINE_HEIGHT + 2;

  const address = details.companyAddress.trim();
  if (address !== "") {
    for (const line of wrapLines(address, fonts.regular, 9.5, CONTENT_WIDTH * 0.6)) {
      drawText(sheet.page, line, { x: MARGIN, y, font: fonts.regular, size: 9.5, color: MUTED });
      y -= 12.5;
    }
  }

  y -= 8;
  drawRule(sheet.page, { x: MARGIN, y, width: CONTENT_WIDTH, thickness: 1 });
  sheet.y = y - 30;
}

type Values = Record<string, string>;

/** The date, the salutation and the subject line — the head of any formal letter. */
function drawOpening(sheet: Sheet, details: OfferLetterDetails, values: Values): void {
  const { fonts } = sheet;
  const date = formatDate(details.date);

  if (date !== "") {
    drawText(sheet.page, date, {
      x: RIGHT_EDGE,
      y: sheet.y,
      font: fonts.regular,
      size: BODY_SIZE,
      color: MUTED,
      align: "right",
    });
    sheet.y -= LINE_HEIGHT + 12;
  }

  // Wrapped rather than drawn as one line: these are editable now, and a
  // rewritten subject line is easily wider than the page.
  drawParagraph(sheet, fillTemplate(labelOr(details.salutation, DEFAULT_SALUTATION), values));
  drawParagraph(
    sheet,
    fillTemplate(labelOr(details.subjectLine, DEFAULT_SUBJECT_LINE), values),
    fonts.bold,
  );
}

function drawBody(sheet: Sheet, details: OfferLetterDetails, values: Values): void {
  drawParagraph(sheet, fillTemplate(details.offerParagraph, values));
  drawParagraph(sheet, fillTemplate(details.governingParagraph, values));

  drawTerms(sheet, details, values);

  drawParagraph(sheet, fillTemplate(details.closingParagraph, values));
}

/**
 * The terms area, set under a caption so it reads as the part of the letter that
 * was written for this role rather than as more boilerplate. Blank lines in the
 * field become paragraph breaks — wrapLines keeps them, so a pasted list of
 * clauses arrives looking like one.
 */
function drawTerms(sheet: Sheet, details: OfferLetterDetails, values: Values): void {
  const terms = details.terms.trim();
  if (terms === "") return;

  ensureRoom(sheet, 60);
  sheet.y -= 4;

  drawText(sheet.page, fillTemplate(labelOr(details.termsHeading, DEFAULT_TERMS_HEADING), values), {
    x: MARGIN,
    y: sheet.y,
    font: sheet.fonts.bold,
    size: LABEL_SIZE,
    color: MUTED,
  });
  sheet.y -= 18;

  drawParagraph(sheet, terms);
}

/**
 * One wrapped block, page-broken line by line, followed by a paragraph gap. An
 * emptied wording field lands here as "" and draws nothing at all — not even the
 * gap, so a dropped paragraph leaves no hole behind it.
 */
function drawParagraph(sheet: Sheet, text: string, font = sheet.fonts.regular): void {
  if (text.trim() === "") return;

  const lines = wrapLines(text, font, BODY_SIZE, CONTENT_WIDTH);

  for (const line of lines) {
    // Checked per line rather than per block: a terms field can be longer than a
    // page on its own, and a block-level check would run it off the bottom.
    ensureRoom(sheet, LINE_HEIGHT);
    drawText(sheet.page, line, {
      x: MARGIN,
      y: sheet.y,
      font,
      size: BODY_SIZE,
    });
    sheet.y -= LINE_HEIGHT;
  }

  sheet.y -= PARAGRAPH_GAP;
}

/**
 * The closing and the signature block. The gap above the ruled line is where the
 * letter actually gets signed, so it has to be blank space and not wherever the
 * last paragraph happened to end.
 */
function drawSignature(
  sheet: Sheet,
  details: OfferLetterDetails,
  values: Values,
  signature: PDFImage | null,
): void {
  const { fonts } = sheet;

  // A scan needs more air above the rule than a hand-signed letter does,
  // otherwise the image climbs into the sign-off line.
  const gap = signature === null ? 62 : 96;

  ensureRoom(sheet, gap + 68);
  sheet.y -= 10;

  drawText(sheet.page, fillTemplate(labelOr(details.signOff, DEFAULT_SIGN_OFF), values), {
    x: MARGIN,
    y: sheet.y,
    font: fonts.regular,
    size: BODY_SIZE,
  });
  sheet.y -= gap;

  // Both signature rules hang off this one baseline, so a blank issuer name
  // can't leave the candidate's line 14 points higher than the company's.
  const ruleY = sheet.y + 30;

  if (signature !== null) {
    // Fitted to a box and stood on the rule, so a wide scan and a tall one both
    // sign the same line rather than one of them crossing it.
    const scale = Math.min(
      SIGNATURE_BOX.width / signature.width,
      SIGNATURE_BOX.height / signature.height,
    );
    const width = signature.width * scale;
    const height = signature.height * scale;
    sheet.page.drawImage(signature, {
      x: MARGIN + SIGNATURE_RULE_WIDTH / 2 - width / 2,
      y: ruleY + SIGNATURE_LIFT,
      width,
      height,
    });
  }

  drawRule(sheet.page, { x: MARGIN, y: ruleY, width: SIGNATURE_RULE_WIDTH, thickness: 0.6 });

  const issuer = details.issuerName.trim();
  if (issuer !== "") {
    drawText(sheet.page, issuer, { x: MARGIN, y: sheet.y, font: fonts.bold, size: BODY_SIZE });
    sheet.y -= 14;
  }

  const title = [details.issuerTitle.trim(), details.companyName.trim()]
    .filter((part) => part !== "")
    .join(", ");
  drawText(sheet.page, title, { x: MARGIN, y: sheet.y, font: fonts.regular, size: 9.5, color: MUTED });

  // The candidate's counter-signature, on the same line as the issuer's so the
  // two read as the two halves of an agreement.
  drawRule(sheet.page, {
    x: RIGHT_EDGE - SIGNATURE_RULE_WIDTH,
    y: ruleY,
    width: SIGNATURE_RULE_WIDTH,
    thickness: 0.6,
  });
  drawText(
    sheet.page,
    fillTemplate(labelOr(details.acceptanceLabel, DEFAULT_ACCEPTANCE_LABEL), values),
    {
      x: RIGHT_EDGE,
      y: ruleY - 14,
      font: fonts.regular,
      size: 9,
      color: MUTED,
      align: "right",
    },
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message;
  return "Couldn't build the offer letter PDF.";
}
