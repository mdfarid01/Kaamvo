/**
 * Unit tables and conversion for the Unit Converter. Everything here is pure
 * arithmetic on numbers and strings, so the component stays a thin wrapper the
 * same way lib/text-stats.ts backs the Word Counter.
 *
 * Every unit converts through a base unit for its category rather than to every
 * other unit directly: six categories with ten units each would otherwise be a
 * few hundred hand-written factors, and each one a chance to mistype a zero.
 *
 * The conversion is a pair of functions instead of a single factor because
 * temperature isn't proportional — 0 °C is not 0 °F — so a factor alone can't
 * express it. `linear` covers the other five categories, where it is.
 */

export type CategoryId = "length" | "weight" | "temperature" | "speed" | "area" | "data";

export interface Unit {
  id: string;
  /** Full name, shown in the dropdown. */
  label: string;
  /** Short form, shown next to a converted value. */
  symbol: string;
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
}

export interface Category {
  id: CategoryId;
  label: string;
  units: Unit[];
  /** Unit ids the tool starts on — the most common pair for the category. */
  defaults: [string, string];
}

/** A unit that's a plain multiple of the base, which all but temperature are. */
function linear(id: string, label: string, symbol: string, perBase: number): Unit {
  return {
    id,
    label,
    symbol,
    toBase: (value) => value * perBase,
    fromBase: (value) => value / perBase,
  };
}

/**
 * Imperial factors are the exact international definitions (an inch is 25.4 mm
 * by agreement, not by measurement), so the chains built from them — foot,
 * yard, mile, acre — are exact too rather than accumulating rounding.
 */
const INCH_M = 0.0254;
const FOOT_M = INCH_M * 12;
const YARD_M = FOOT_M * 3;
const MILE_M = FOOT_M * 5280;
const POUND_KG = 0.45359237;

export const CATEGORIES: Category[] = [
  {
    id: "length",
    label: "Length",
    defaults: ["meter", "foot"],
    units: [
      linear("millimeter", "Millimetre", "mm", 0.001),
      linear("centimeter", "Centimetre", "cm", 0.01),
      linear("meter", "Metre", "m", 1),
      linear("kilometer", "Kilometre", "km", 1000),
      linear("inch", "Inch", "in", INCH_M),
      linear("foot", "Foot", "ft", FOOT_M),
      linear("yard", "Yard", "yd", YARD_M),
      linear("mile", "Mile", "mi", MILE_M),
      linear("nautical-mile", "Nautical mile", "nmi", 1852),
    ],
  },
  {
    id: "weight",
    label: "Weight",
    defaults: ["kilogram", "pound"],
    units: [
      linear("milligram", "Milligram", "mg", 0.000001),
      linear("gram", "Gram", "g", 0.001),
      linear("kilogram", "Kilogram", "kg", 1),
      linear("tonne", "Tonne", "t", 1000),
      linear("ounce", "Ounce", "oz", POUND_KG / 16),
      linear("pound", "Pound", "lb", POUND_KG),
      linear("stone", "Stone", "st", POUND_KG * 14),
    ],
  },
  {
    id: "temperature",
    label: "Temperature",
    defaults: ["celsius", "fahrenheit"],
    units: [
      {
        id: "celsius",
        label: "Celsius",
        symbol: "°C",
        toBase: (value) => value,
        fromBase: (value) => value,
      },
      {
        id: "fahrenheit",
        label: "Fahrenheit",
        symbol: "°F",
        toBase: (value) => ((value - 32) * 5) / 9,
        fromBase: (value) => (value * 9) / 5 + 32,
      },
      {
        id: "kelvin",
        label: "Kelvin",
        symbol: "K",
        toBase: (value) => value - 273.15,
        fromBase: (value) => value + 273.15,
      },
    ],
  },
  {
    id: "speed",
    label: "Speed",
    defaults: ["kilometer-hour", "mile-hour"],
    units: [
      linear("meter-second", "Metres per second", "m/s", 1),
      linear("kilometer-hour", "Kilometres per hour", "km/h", 1000 / 3600),
      linear("mile-hour", "Miles per hour", "mph", MILE_M / 3600),
      linear("foot-second", "Feet per second", "ft/s", FOOT_M),
      linear("knot", "Knot", "kn", 1852 / 3600),
    ],
  },
  {
    id: "area",
    label: "Area",
    defaults: ["square-meter", "square-foot"],
    units: [
      linear("square-centimeter", "Square centimetre", "cm²", 0.0001),
      linear("square-meter", "Square metre", "m²", 1),
      linear("hectare", "Hectare", "ha", 10000),
      linear("square-kilometer", "Square kilometre", "km²", 1000000),
      linear("square-inch", "Square inch", "in²", INCH_M * INCH_M),
      linear("square-foot", "Square foot", "ft²", FOOT_M * FOOT_M),
      linear("square-yard", "Square yard", "yd²", YARD_M * YARD_M),
      linear("acre", "Acre", "ac", YARD_M * YARD_M * 4840),
      linear("square-mile", "Square mile", "mi²", MILE_M * MILE_M),
    ],
  },
  {
    id: "data",
    label: "Data Storage",
    defaults: ["megabyte", "mebibyte"],
    units: [
      linear("bit", "Bit", "b", 1 / 8),
      linear("byte", "Byte", "B", 1),
      // Both families are here on purpose: a drive is sold in decimal megabytes
      // and reported by an operating system in binary ones, and the gap between
      // them is the whole reason someone opens a converter for storage.
      linear("kilobyte", "Kilobyte (1000 B)", "kB", 1e3),
      linear("megabyte", "Megabyte (1000 kB)", "MB", 1e6),
      linear("gigabyte", "Gigabyte (1000 MB)", "GB", 1e9),
      linear("terabyte", "Terabyte (1000 GB)", "TB", 1e12),
      linear("kibibyte", "Kibibyte (1024 B)", "KiB", 1024),
      linear("mebibyte", "Mebibyte (1024 KiB)", "MiB", 1024 ** 2),
      linear("gibibyte", "Gibibyte (1024 MiB)", "GiB", 1024 ** 3),
      linear("tebibyte", "Tebibyte (1024 GiB)", "TiB", 1024 ** 4),
    ],
  },
];

export function getCategory(id: CategoryId): Category {
  // The id always comes from a select built off this same list, so the fallback
  // is only here to keep the return type non-optional for every caller.
  return CATEGORIES.find((category) => category.id === id) ?? CATEGORIES[0];
}

export function getUnit(category: Category, id: string): Unit {
  return category.units.find((unit) => unit.id === id) ?? category.units[0];
}

/** Options for a SelectField, in the order the table declares them. */
export function unitOptions(category: Category): Array<{ value: string; label: string }> {
  return category.units.map((unit) => ({ value: unit.id, label: `${unit.label} (${unit.symbol})` }));
}

export function convert(category: Category, value: number, fromId: string, toId: string): number {
  const from = getUnit(category, fromId);
  const to = getUnit(category, toId);

  return to.fromBase(from.toBase(value));
}

/**
 * Reads the number out of an input. Returns null rather than 0 for anything
 * that isn't one, so the other field can go blank while a value is half-typed
 * instead of flashing a converted zero.
 *
 * A lone "-" or a trailing "." are both mid-typing states, and Number.parseFloat
 * would read the second as a finished number — the regex rejects them so the
 * field doesn't fight the keyboard.
 */
export function parseValue(input: string): number | null {
  const trimmed = input.replace(/[, ]/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Formats a converted value for the read-only side of the pair.
 *
 * Twelve significant digits is past double precision's honest range, and the
 * usual toFixed alternative is worse in both directions: it prints 0.000 for a
 * millimetre in miles and drops digits off a byte count. Trailing zeros come off
 * afterwards so a clean conversion reads "2.54", not "2.540000000000".
 */
export function formatResult(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";

  const magnitude = Math.abs(value);
  if (magnitude < 1e-9 || magnitude >= 1e15) {
    return trimZeros(value.toExponential(6));
  }

  return trimZeros(value.toPrecision(12));
}

function trimZeros(text: string): string {
  if (!text.includes(".")) return text;

  const [mantissa, exponent] = text.split("e");
  const trimmed = mantissa.replace(/\.?0+$/, "");

  return exponent === undefined ? trimmed : `${trimmed}e${exponent}`;
}

/** "1 metre = 3.28084 feet" — the rate, independent of what's been typed. */
export function rateLabel(category: Category, fromId: string, toId: string): string {
  const from = getUnit(category, fromId);
  const to = getUnit(category, toId);
  const converted = convert(category, 1, fromId, toId);

  return `1 ${from.symbol} = ${formatResult(roundNoise(converted))} ${to.symbol}`;
}

/**
 * Binary floating point turns exact factors into 0.30480000000000002 and
 * similar; rounding to 12 significant digits before formatting drops that tail
 * without touching any digit a conversion actually carries.
 */
function roundNoise(value: number): number {
  return Number.parseFloat(value.toPrecision(12));
}
