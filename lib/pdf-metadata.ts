/**
 * The document-properties panel behind PDF Metadata Editor. Reading is split
 * from writing: the fields are pulled off the document parsed on arrival (see
 * lib/pdf-load.ts), so the form can be filled in with what the file already
 * says, and writing re-reads the file the way lib/pdf-rotate.ts does — an edit
 * to the info dictionary shouldn't disturb the pages, and starting from the
 * bytes on disk keeps a second save from compounding the first.
 *
 * Nothing here is embedded on a page, so there's no encoding guard: the info
 * dictionary is written as UTF-16 text and takes any character.
 */

import type { PDFDocument } from "pdf-lib";

import { describeLoadError, isOutOfMemory, parsePdf } from "./pdf-load";
import { bytesToBlob } from "./utils";

/** The four fields worth editing. Producer and the dates are the writer's own. */
export interface Metadata {
  title: string;
  author: string;
  subject: string;
  /** Comma-separated as typed; split on the way into the file. */
  keywords: string;
}

export const EMPTY_METADATA: Metadata = { title: "", author: "", subject: "", keywords: "" };

/** What the file says now, for filling the form in. */
export function readMetadata(doc: PDFDocument): Metadata {
  return {
    title: read(() => doc.getTitle()),
    author: read(() => doc.getAuthor()),
    subject: read(() => doc.getSubject()),
    keywords: read(() => doc.getKeywords()),
  };
}

/** Read-only extras, shown rather than edited. */
export interface Provenance {
  creator: string;
  producer: string;
}

export function readProvenance(doc: PDFDocument): Provenance {
  return {
    creator: read(() => doc.getCreator()),
    producer: read(() => doc.getProducer()),
  };
}

export type MetadataResult = { ok: true; blob: Blob } | { ok: false; error: string };

export async function writeMetadata(file: File, fields: Metadata): Promise<MetadataResult> {
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, error: `Couldn't read ${file.name} again — has it moved or changed?` };
  }

  const loaded = await parsePdf(bytes, file.name, file.size);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const doc = loaded.pdf.doc;

  try {
    // All four are written every time, empty included: clearing a field in the
    // form has to be able to clear it in the file.
    doc.setTitle(fields.title.trim());
    doc.setAuthor(fields.author.trim());
    doc.setSubject(fields.subject.trim());
    doc.setKeywords(splitKeywords(fields.keywords));

    return { ok: true, blob: bytesToBlob(await doc.save(), "application/pdf") };
  } catch (error) {
    if (isOutOfMemory(error)) {
      return { ok: false, error: "Ran out of memory writing that — the file may be too big." };
    }
    return { ok: false, error: describeLoadError(error, file.name) };
  }
}

/** report.pdf becomes report-updated.pdf, so a download can't overwrite it. */
export function updatedFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim();
  return `${base === "" ? "updated" : `${base}-updated`}.pdf`;
}

/** Commas or newlines, with the blanks dropped. */
export function splitKeywords(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((word) => word.trim())
    .filter((word) => word !== "");
}

/**
 * A getter on a file whose info dictionary holds the wrong type for a key throws
 * rather than returning undefined, and a missing entry is indistinguishable from
 * an empty one as far as the form is concerned.
 */
function read(getter: () => string | undefined): string {
  try {
    return getter() ?? "";
  } catch {
    return "";
  }
}
