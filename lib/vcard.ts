/**
 * vCard building for the vCard QR Code tool. Contact fields in, one
 * BEGIN:VCARD…END:VCARD string out — the encoding itself is lib/qr-code.ts's
 * generateQrPng, which takes arbitrary text and doesn't care that this text
 * happens to be a contact card.
 *
 * Version 3.0 rather than the newer 4.0: 3.0 is what the built-in camera app on
 * both iOS and Android offers to save as a contact, and 4.0 is still hit and
 * miss on phones people actually have. Nothing here needs a 4.0-only property.
 *
 * The escaping is the part worth keeping out of the component. A comma or a
 * semicolon in a job title would otherwise split the field it sits in, and a
 * scanner would read half a title — see escapeValue.
 */

export interface VCardDetails {
  name: string;
  phone: string;
  email: string;
  company: string;
  jobTitle: string;
}

export const EMPTY_VCARD: VCardDetails = {
  name: "",
  phone: "",
  email: "",
  company: "",
  jobTitle: "",
};

/** Whether there is enough to encode — the name is the one required field. */
export function hasContact(details: VCardDetails): boolean {
  return details.name.trim() !== "";
}

/**
 * The vCard text a scanner reads. Blank fields are left out rather than sent as
 * empty properties: an empty TEL makes some phones offer a contact with a blank
 * number attached to it.
 *
 * Lines are not folded at 75 octets. The spec allows folding and every field
 * here is a name, a number or an address — a title long enough to need it would
 * be past what fits in a QR code anyway.
 */
export function buildVCard(details: VCardDetails): string {
  const name = details.name.trim();
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${structuredName(name)}`, `FN:${escapeValue(name)}`];

  const phone = details.phone.trim();
  if (phone !== "") lines.push(`TEL;TYPE=CELL:${escapeValue(phone)}`);

  const email = details.email.trim();
  if (email !== "") lines.push(`EMAIL;TYPE=INTERNET:${escapeValue(email)}`);

  const company = details.company.trim();
  if (company !== "") lines.push(`ORG:${escapeValue(company)}`);

  const jobTitle = details.jobTitle.trim();
  if (jobTitle !== "") lines.push(`TITLE:${escapeValue(jobTitle)}`);

  lines.push("END:VCARD");

  // CRLF, which the spec requires — a phone that parses LF-only vCards is being
  // lenient, and not all of them are.
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * N wants surname;given;middle;prefix;suffix. The last whitespace-separated word
 * is taken as the surname and everything before it as the given name, which is
 * right for "Anita Rao" and harmless for a single-word name — FN carries the
 * name as typed either way, and that's what a phone displays.
 */
function structuredName(name: string): string {
  const parts = name.split(/\s+/).filter((part) => part !== "");
  if (parts.length < 2) return `${escapeValue(name)};;;;`;

  const surname = parts[parts.length - 1];
  const given = parts.slice(0, -1).join(" ");

  return `${escapeValue(surname)};${escapeValue(given)};;;`;
}

/**
 * Escapes the four characters that are structural in a vCard value: a backslash,
 * a comma and a semicolon are escaped, and a newline becomes the literal \n the
 * spec uses. A stray CR is dropped rather than escaped — it would only ever come
 * from a paste and has no meaning inside a single-line value.
 */
function escapeValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n")
    .replace(/[;,]/g, (char) => `\\${char}`);
}

/** vcard-anita-rao.png, so a folder of them is tellable apart. */
export function vCardFileName(details: VCardDetails): string {
  const slug = details.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    // Trims both the edges and whatever dash the slice landed on.
    .replace(/^-+|-+$/g, "");

  return slug === "" ? "vcard-qr.png" : `vcard-${slug}.png`;
}
