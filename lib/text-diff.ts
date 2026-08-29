/**
 * Text diffing for the Diff Checker tool. Two strings in, a flat list of
 * segments out — the same split as lib/json-formatter.ts, so the UI layer stays
 * a thin wrapper and nothing outside this file knows how a diff is computed.
 *
 * The engine is Myers' O(ND) algorithm, walking the edit graph in order of edit
 * distance: two nearly-identical texts cost almost nothing however long they
 * are, because the cost tracks the number of changes rather than the size of
 * the input. The expensive case is two long texts with little in common, and
 * MAX_EDITS caps that with a result union instead of freezing the tab.
 */

export type DiffKind = "equal" | "added" | "removed";

/** Lines reads like a patch; words catches an edit inside a rewrapped line. */
export type DiffMode = "lines" | "words";

export interface DiffSegment {
  kind: DiffKind;
  /** One line in `lines` mode (no trailing newline); a run of text in `words`. */
  text: string;
  /** 1-based source line numbers, `lines` mode only — null in `words` mode. */
  beforeLine: number | null;
  afterLine: number | null;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
  /** What the three counts above are counting. */
  unit: "line" | "word";
}

export type DiffResult =
  | { ok: true; mode: DiffMode; segments: DiffSegment[]; stats: DiffStats }
  | { ok: false; error: string };

/**
 * Ceiling on the edit distance. Past this the diff stops being something a
 * person can read anyway, and the trace below costs ~12 bytes per (d, k) cell,
 * so the cap is what keeps a worst-case pair from eating the tab's memory.
 */
const MAX_EDITS = 3000;

/** Guards the O(n+m) scratch arrays against a pathological paste. */
const MAX_TOKENS: Record<DiffMode, number> = {
  lines: 20000,
  words: 60000,
};

const TOKEN_LABEL: Record<DiffMode, string> = {
  lines: "lines",
  words: "words",
};

export function diffTexts(before: string, after: string, mode: DiffMode): DiffResult {
  const a = tokenize(before, mode);
  const b = tokenize(after, mode);

  const limit = MAX_TOKENS[mode];
  if (a.length > limit || b.length > limit) {
    return {
      ok: false,
      error: `That's more than ${limit.toLocaleString()} ${TOKEN_LABEL[mode]} on one side — compare a smaller section.`,
    };
  }

  const ops = diffTokens(a, b);
  if (ops === null) {
    return {
      ok: false,
      error: `These two texts differ in more than ${MAX_EDITS.toLocaleString()} places, which is past the point of a readable diff — compare a smaller section.`,
    };
  }

  return { ok: true, mode, ...describe(ops, a, b, mode) };
}

/* -------------------------------------------------------------------------- */
/* Tokenizing                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Words and the whitespace between them are separate tokens, so a run of
 * spaces can match on its own and a one-word change doesn't drag the spaces
 * around it into the diff. The renderer glues neighbours back together.
 */
const WORD_TOKEN = /\s+|\S+/g;

function tokenize(text: string, mode: DiffMode): string[] {
  // CRLF is invisible in a textarea, so a file pasted from Windows would
  // otherwise report every single line as changed.
  const normalized = text.replace(/\r\n?/g, "\n");

  if (mode === "words") return normalized.match(WORD_TOKEN) ?? [];

  // One trailing newline is what a text editor leaves behind and it isn't
  // visible in the box, so counting it as an extra empty line would report a
  // change nobody can see. Any newline before that is a real empty line.
  const body = normalized.replace(/\n$/, "");
  return body === "" ? [] : body.split("\n");
}

/* -------------------------------------------------------------------------- */
/* Diff                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `a` is the index into the before-tokens, `b` into the after-tokens; each is
 * set only where it means something.
 */
type Op =
  | { kind: "equal"; a: number; b: number }
  | { kind: "removed"; a: number }
  | { kind: "added"; b: number };

/**
 * Shaves the shared head and tail off both sides before running Myers on the
 * rest. This is the cheap half of the algorithm's speed in practice: the usual
 * case is a small edit inside a large document, and the shared ends of that
 * pair never reach the edit graph. Null when the middle is past MAX_EDITS.
 */
function diffTokens(a: string[], b: string[]): Op[] | null {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;

  let tailA = a.length;
  let tailB = b.length;
  while (tailA > head && tailB > head && a[tailA - 1] === b[tailB - 1]) {
    tailA -= 1;
    tailB -= 1;
  }

  const moves = myers(a.slice(head, tailA), b.slice(head, tailB));
  if (moves === null) return null;

  const ops: Op[] = [];
  for (let i = 0; i < head; i += 1) ops.push({ kind: "equal", a: i, b: i });

  for (const move of moves) {
    if (move.kind === "equal") ops.push({ kind: "equal", a: move.a + head, b: move.b + head });
    else if (move.kind === "removed") ops.push({ kind: "removed", a: move.a + head });
    else ops.push({ kind: "added", b: move.b + head });
  }

  for (let i = 0; tailA + i < a.length; i += 1) {
    ops.push({ kind: "equal", a: tailA + i, b: tailB + i });
  }

  return ops;
}

/**
 * Myers' greedy forward pass. `v[k]` holds the furthest x reached on diagonal
 * k = x - y after d edits; the first d whose path reaches the bottom-right
 * corner is the edit distance. Every round's v is kept so backtrack can walk
 * the path home — only the (2d + 3) cells that round could have touched, since
 * the full array is mostly zeros it never read.
 */
function myers(a: string[], b: string[]): Op[] | null {
  const n = a.length;
  const m = b.length;

  // Nothing to search for when one side is empty, and skipping it keeps the
  // d = 0 round below from being the only thing standing between an empty
  // input and a wrong answer.
  if (n === 0) return b.map((_, index) => ({ kind: "added", b: index }));
  if (m === 0) return a.map((_, index) => ({ kind: "removed", a: index }));

  const max = n + m;
  // Diagonal k lives at v[offset + k], with one cell of slack past each end of
  // the k range so the k ± 1 reads below never fall outside the array — a
  // negative index would be silently taken from the far end by slice.
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];

  for (let d = 0; d <= max && d <= MAX_EDITS; d += 1) {
    // Copied before the round writes to it, and one cell wider on each side
    // than the diagonals in play — backtrack reads k ± 1 at the edges.
    trace.push(v.slice(offset - d - 1, offset + d + 2));

    for (let k = -d; k <= d; k += 2) {
      // Extend whichever neighbouring diagonal got further: down from k + 1
      // (an insertion) or right from k - 1 (a deletion).
      const x =
        k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
          ? v[offset + k + 1]
          : v[offset + k - 1] + 1;

      let head = x;
      let y = x - k;
      // Then run the free diagonal — matching tokens cost nothing.
      while (head < n && y < m && a[head] === b[y]) {
        head += 1;
        y += 1;
      }

      v[offset + k] = head;
      if (head >= n && y >= m) return backtrack(trace, d, n, m);
    }
  }

  return null;
}

/**
 * Walks the saved rounds backwards from the bottom-right corner, turning the
 * path into ops. At each round the same test that chose a predecessor on the
 * way down chooses it again on the way up, so the forward pass doesn't have to
 * store any per-cell bookkeeping.
 */
function backtrack(trace: Int32Array[], distance: number, n: number, m: number): Op[] {
  const ops: Op[] = [];
  let x = n;
  let y = m;

  for (let d = distance; d >= 0; d -= 1) {
    const round = trace[d];
    const at = (k: number) => round[k + d + 1];

    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;

    // The free diagonal, in reverse: every step of it was a match.
    while (x > prevX && y > prevY) {
      ops.push({ kind: "equal", a: x - 1, b: y - 1 });
      x -= 1;
      y -= 1;
    }

    // d = 0 is the origin, which was reached without an edit.
    if (d > 0) {
      if (x === prevX) ops.push({ kind: "added", b: prevY });
      else ops.push({ kind: "removed", a: prevX });
    }

    x = prevX;
    y = prevY;
  }

  return ops.reverse();
}

/* -------------------------------------------------------------------------- */
/* Presentation                                                               */
/* -------------------------------------------------------------------------- */

function describe(
  ops: Op[],
  a: string[],
  b: string[],
  mode: DiffMode,
): { segments: DiffSegment[]; stats: DiffStats } {
  const segments = toSegments(ops, a, b, mode);
  return {
    segments: mode === "words" ? coalesce(segments) : segments,
    stats: count(ops, a, b, mode),
  };
}

/**
 * Ops to segments, with one rearrangement: inside a run of changes Myers can
 * interleave removals and additions, and a patch reads as removals first, then
 * the text that replaced them.
 */
function toSegments(ops: Op[], a: string[], b: string[], mode: DiffMode): DiffSegment[] {
  const numbered = mode === "lines";
  const segments: DiffSegment[] = [];
  let index = 0;

  while (index < ops.length) {
    const op = ops[index];

    if (op.kind === "equal") {
      segments.push({
        kind: "equal",
        text: a[op.a],
        beforeLine: numbered ? op.a + 1 : null,
        afterLine: numbered ? op.b + 1 : null,
      });
      index += 1;
      continue;
    }

    const removed: number[] = [];
    const added: number[] = [];
    while (index < ops.length) {
      const current = ops[index];
      if (current.kind === "equal") break;
      if (current.kind === "removed") removed.push(current.a);
      else added.push(current.b);
      index += 1;
    }

    for (const at of removed) {
      segments.push({
        kind: "removed",
        text: a[at],
        beforeLine: numbered ? at + 1 : null,
        afterLine: null,
      });
    }
    for (const at of added) {
      segments.push({
        kind: "added",
        text: b[at],
        beforeLine: null,
        afterLine: numbered ? at + 1 : null,
      });
    }
  }

  return segments;
}

/** Neighbours of the same kind become one span, so words mode reads as prose. */
function coalesce(segments: DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = [];

  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.kind === segment.kind) {
      merged[merged.length - 1] = { ...last, text: last.text + segment.text };
      continue;
    }
    merged.push({ ...segment });
  }

  return merged;
}

/**
 * Counted off the ops rather than the segments, so words mode counts words —
 * whitespace tokens are structure, not content, and a merged span is one span
 * however many words went into it.
 */
function count(ops: Op[], a: string[], b: string[], mode: DiffMode): DiffStats {
  const stats: DiffStats = {
    added: 0,
    removed: 0,
    unchanged: 0,
    unit: mode === "lines" ? "line" : "word",
  };

  for (const op of ops) {
    const text = op.kind === "added" ? b[op.b] : a[op.a];
    if (mode === "words" && text.trim() === "") continue;

    if (op.kind === "added") stats.added += 1;
    else if (op.kind === "removed") stats.removed += 1;
    else stats.unchanged += 1;
  }

  return stats;
}
