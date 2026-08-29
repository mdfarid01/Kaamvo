"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DEFAULT_TEAMS,
  MAX_TEAMS,
  MIN_TEAMS,
  clampTeamCount,
  parseItems,
  pickIndex,
  splitTeams,
} from "@/lib/random-picker";
import type { Team } from "@/lib/random-picker";
import { cn } from "@/lib/utils";

/**
 * Textarea, two modes and a result. Every random draw is in
 * lib/random-picker.ts; what's here is the animation and the bookkeeping around
 * it.
 *
 * The animation is decoration over an answer that already exists: the winner is
 * drawn once, up front, and the flashing is a timer moving a highlight around
 * until it lands on that index. Drawing repeatedly and keeping the last one
 * would waste entropy and, worse, make the result depend on when the timer
 * happened to stop.
 */

/** How long the highlight bounces around, and how fast it moves. */
const SPIN_MS = 1100;
const SPIN_STEP_MS = 70;

type Mode = "pick" | "teams";

export function RandomPickerTool() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [teamCount, setTeamCount] = useState(`${DEFAULT_TEAMS}`);

  const [winner, setWinner] = useState<number | null>(null);
  /** Which row the highlight is on mid-animation; null when it isn't running. */
  const [flash, setFlash] = useState<number | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);

  const spinRef = useRef<number | null>(null);
  const settleRef = useRef<number | null>(null);

  const items = useMemo(() => parseItems(text), [text]);

  const stop = useCallback(() => {
    if (spinRef.current !== null) window.clearInterval(spinRef.current);
    if (settleRef.current !== null) window.clearTimeout(settleRef.current);
    spinRef.current = null;
    settleRef.current = null;
    setFlash(null);
  }, []);

  // A pending animation that outlives the component would set state on nothing.
  useEffect(() => stop, [stop]);

  /** Editing the list invalidates whatever was drawn from the old one. */
  const handleText = useCallback(
    (value: string) => {
      stop();
      setText(value);
      setWinner(null);
      setTeams(null);
    },
    [stop],
  );

  const handlePick = useCallback(() => {
    stop();
    setTeams(null);

    const index = pickIndex(items);
    if (index < 0) {
      setWinner(null);
      return;
    }

    // Someone who has asked not to see motion gets the answer straight away.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || items.length < 2) {
      setWinner(index);
      return;
    }

    setWinner(null);

    // The highlight walks the list in order rather than jumping randomly — a
    // random walk over a short list mostly looks like a flicker in place.
    let step = 0;
    spinRef.current = window.setInterval(() => {
      step += 1;
      setFlash(step % items.length);
    }, SPIN_STEP_MS);

    settleRef.current = window.setTimeout(() => {
      stop();
      setWinner(index);
    }, SPIN_MS);
  }, [items, stop]);

  const handleSplit = useCallback(() => {
    stop();
    setWinner(null);
    setTeams(items.length === 0 ? null : splitTeams(items, Number(teamCount)));
  }, [items, stop, teamCount]);

  const handleClear = useCallback(() => {
    stop();
    setText("");
    setWinner(null);
    setTeams(null);
  }, [stop]);

  const count = clampTeamCount(Number(teamCount));
  const isEmpty = items.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="random-picker-input" className="sr-only">
          Names or items, one per line
        </label>
        <textarea
          id="random-picker-input"
          value={text}
          onChange={(event) => handleText(event.target.value)}
          placeholder={"One name or item per line\nAnita\nRavi\nMeera"}
          spellCheck={false}
          className="min-h-[180px] w-full resize-y rounded-lg border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink transition-colors duration-150 placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
        />
        <p className="mt-1.5 text-[12px] text-muted">
          {isEmpty
            ? "Nothing on the list yet."
            : `${items.length} ${items.length === 1 ? "entry" : "entries"} on the list.`}
        </p>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Mode</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <ModeButton label="Pick one" active={mode === "pick"} onClick={() => setMode("pick")} />
          <ModeButton
            label="Team split"
            active={mode === "teams"}
            onClick={() => setMode("teams")}
          />
        </div>

        {mode === "teams" && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="random-picker-teams"
                className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted"
              >
                Number of teams
              </label>
              <input
                id="random-picker-teams"
                type="number"
                min={MIN_TEAMS}
                max={MAX_TEAMS}
                value={teamCount}
                onChange={(event) => setTeamCount(event.target.value)}
                className="mt-1.5 h-10 w-24 rounded-md border border-line bg-surface px-3 font-mono text-[14px] tabular-nums text-ink transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
              />
            </div>
            <p className="pb-2.5 text-[12px] text-muted">
              {isEmpty
                ? `Between ${MIN_TEAMS} and ${MAX_TEAMS}.`
                : `${items.length} split ${count} ways — about ${Math.ceil(items.length / count)} each.`}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {mode === "pick" ? (
          <Button disabled={isEmpty} onClick={handlePick}>
            {flash === null ? "Pick one" : "Picking…"}
          </Button>
        ) : (
          <Button disabled={isEmpty} onClick={handleSplit}>
            Pick a team split
          </Button>
        )}
        <Button variant="secondary" disabled={text === ""} onClick={handleClear}>
          Clear
        </Button>
        <span aria-live="polite" className="sr-only">
          {winner !== null ? `Picked ${items[winner]}` : ""}
        </span>
      </div>

      {mode === "pick" ? (
        <PickResult items={items} winner={winner} flash={flash} />
      ) : (
        <TeamResult teams={teams} />
      )}

      <p className="text-[13px] leading-relaxed text-muted">
        Every draw uses your browser&apos;s cryptographic random number generator, not the ordinary
        one — so the result isn&apos;t predictable from the ones before it, and nobody can work out
        what it was going to be. Nothing on your list is uploaded or stored.
      </p>
    </div>
  );
}

function PickResult({
  items,
  winner,
  flash,
}: {
  items: string[];
  winner: number | null;
  flash: number | null;
}) {
  if (items.length === 0) {
    return (
      <Card className="flex min-h-[120px] items-center justify-center p-6">
        <p className="text-[13px] text-muted">Add a few names and press Pick one.</p>
      </Card>
    );
  }

  const active = flash ?? winner;

  return (
    <Card className="p-4">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {winner === null ? "The list" : "Picked"}
      </h2>

      {winner !== null && (
        <p className="mt-3 font-mono text-[24px] leading-tight text-accent-deep">{items[winner]}</p>
      )}

      <ul className="mt-4 flex flex-wrap gap-2">
        {items.map((item, index) => (
          <li
            key={`${index}-${item}`}
            className={cn(
              "rounded-md border px-3 py-1.5 text-[13px] transition-colors duration-100",
              index === active
                ? "border-accent bg-accent/[0.12] font-medium text-accent-deep"
                : "border-line-soft text-muted",
            )}
          >
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TeamResult({ teams }: { teams: Team[] | null }) {
  if (teams === null) {
    return (
      <Card className="flex min-h-[120px] items-center justify-center p-6">
        <p className="text-[13px] text-muted">
          Add a few names and press Pick a team split.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {teams.map((team) => (
        <Card key={team.number} className="p-4">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            Team {team.number}
            <span className="ml-1.5 font-mono tabular-nums opacity-70">
              {team.members.length}
            </span>
          </h3>
          {team.members.length === 0 ? (
            <p className="mt-3 text-[13px] text-faint">Empty — more teams than entries.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {team.members.map((member, index) => (
                <li key={`${index}-${member}`} className="text-[14px] leading-snug text-ink">
                  {member}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

/**
 * Tinted accent when idle, solid accent when selected — the same control the QR
 * tools use for their size buttons.
 */
function ModeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        active
          ? "border-accent bg-accent text-canvas"
          : "border-transparent bg-accent/[0.10] text-accent-deep hover:border-accent",
      )}
    >
      {label}
    </button>
  );
}
