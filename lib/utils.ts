type ClassValue = string | false | null | undefined;

/** Minimal class joiner — no clsx dependency needed at this scale. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Moves one item to another position, returning a new array — the reorder both
 * file lists run on. An index outside the array leaves it untouched, so a drag
 * that ends somewhere unexpected is a no-op rather than a thrown error.
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;
  if (from < 0 || from >= items.length) return items;
  if (to < 0 || to >= items.length) return items;

  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  return next;
}

/**
 * Wraps encoded bytes in a Blob, ready to download. The assertion is a
 * types-only detail: TypeScript models a Uint8Array as a view over any buffer
 * kind, including the shared one Blob won't take. The encoders here always
 * return a plain buffer, and copying a whole PDF to prove it isn't worth it.
 */
export function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as BlobPart], { type });
}

/** Human-readable byte count, for the file lists that tools will render. */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
