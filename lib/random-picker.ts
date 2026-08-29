/**
 * The randomness behind the Random Picker. A list of lines in, a winner or a set
 * of teams out — the same split as lib/password.ts, so the UI layer holds the
 * textarea and the animation and nothing else draws a random number.
 *
 * Every choice here comes from crypto.getRandomValues, never Math.random, for
 * the same reason lib/password.ts does it: Math.random is seeded from a
 * predictable source, and a draw for who presents first or who buys lunch is
 * exactly the kind of thing someone will want to be able to trust. There is no
 * fallback — a browser without Web Crypto should fail loudly rather than hand
 * back a riggable result.
 */

/** How many teams the split accepts. Two is the point, and past this it's a list. */
export const MIN_TEAMS = 2;
export const MAX_TEAMS = 20;
export const DEFAULT_TEAMS = 2;

/**
 * One entry per non-blank line, trimmed. Duplicates are kept: the same name
 * typed twice is two entries and two chances, which is what someone weighting a
 * draw by hand means by it.
 */
export function parseItems(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** The index of the winner, or -1 when there is nothing to pick from. */
export function pickIndex(items: string[]): number {
  return items.length === 0 ? -1 : randomBelow(items.length);
}

export interface Team {
  /** 1-based, for a heading — "Team 1". */
  number: number;
  members: string[];
}

/**
 * Shuffles the list, then deals it round-robin into `count` teams, so team sizes
 * differ by at most one and the remainder isn't all dumped on the last team.
 *
 * More teams than items gives some empty teams rather than an error — that's a
 * visible answer to "split five people into eight teams", and the alternative is
 * silently changing what was asked for.
 */
export function splitTeams(items: string[], count: number): Team[] {
  const size = clampTeamCount(count);
  const teams: Team[] = Array.from({ length: size }, (_, index) => ({
    number: index + 1,
    members: [],
  }));

  const shuffled = shuffle(items);
  shuffled.forEach((item, index) => {
    teams[index % size].members.push(item);
  });

  return teams;
}

export function clampTeamCount(count: number): number {
  // Math.round covers a non-integer or a NaN arriving from a number input.
  const rounded = Math.round(count);
  if (!Number.isFinite(rounded)) return DEFAULT_TEAMS;

  return Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, rounded));
}

/** A shuffled copy — Fisher–Yates, so every ordering is equally likely. */
export function shuffle(items: string[]): string[] {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomBelow(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

/**
 * A uniform integer in [0, bound) from crypto.getRandomValues — the same
 * rejection-sampling loop as lib/password.ts, kept here rather than shared so
 * neither file's public surface has to grow a helper for the other.
 *
 * The plain `value % bound` would skew towards the low end whenever bound isn't
 * a power of two, which for a list of ten names means the first few are
 * measurably likelier to win. Discarding the short tail above the last whole
 * multiple of bound removes it; the retry has probability under 2^-32 per draw.
 */
function randomBelow(bound: number): number {
  const range = 0x100000000;
  const limit = range - (range % bound);
  const scratch = new Uint32Array(1);

  let value: number;
  do {
    crypto.getRandomValues(scratch);
    value = scratch[0];
  } while (value >= limit);

  return value % bound;
}
