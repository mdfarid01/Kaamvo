"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CHARACTER_SETS,
  DEFAULT_LENGTH,
  DEFAULT_TOGGLES,
  MAX_LENGTH,
  MIN_LENGTH,
  STRENGTH_LABELS,
  generatePassword,
} from "@/lib/password";
import type { CharacterSet, SetToggles, Strength, StrengthLevel } from "@/lib/password";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "failed";

const COPY_RESET_MS = 1600;

const COPY_LABELS: Record<CopyState, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

/** The password and the strength of the run that produced it, kept together. */
interface Output {
  password: string;
  strength: Strength;
}

export function PasswordGeneratorTool() {
  const [length, setLength] = useState(DEFAULT_LENGTH);
  const [toggles, setToggles] = useState<SetToggles>(DEFAULT_TOGGLES);
  const [output, setOutput] = useState<Output | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();

  const regenerate = useCallback(() => {
    const result = generatePassword(length, toggles);
    if (result.ok) {
      setOutput({ password: result.password, strength: result.strength });
      setError(null);
      return;
    }
    // No character types selected — there is nothing to leave on screen, and
    // an empty box would read as a broken generate.
    setOutput(null);
    setError(result.error);
  }, [length, toggles]);

  // Runs on mount and again whenever the length or a toggle changes, so the
  // password on screen always matches the settings above it. It has to be an
  // effect rather than an initial state value: generating during render would
  // put a password in the server-rendered HTML that the browser then replaces.
  useEffect(() => {
    regenerate();
  }, [regenerate]);

  // A new password invalidates the "Copied" confirmation, which would otherwise
  // claim the clipboard holds the password now shown.
  useEffect(() => {
    setCopyState("idle");
  }, [output]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const flashCopyState = useCallback((state: CopyState) => {
    setCopyState(state);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState("idle"), COPY_RESET_MS);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!output) return;

    try {
      await navigator.clipboard.writeText(output.password);
      flashCopyState("copied");
    } catch {
      // Denied permission or a non-secure context — say so instead of
      // silently pretending the copy worked.
      flashCopyState("failed");
    }
  }, [flashCopyState, output]);

  const handleToggle = useCallback((set: CharacterSet) => {
    setToggles((current) => ({ ...current, [set]: !current[set] }));
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor="password-generator-length"
            className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted"
          >
            Length
          </label>
          <span className="font-mono text-[13px] tabular-nums text-ink">{length}</span>
        </div>
        <input
          id="password-generator-length"
          type="range"
          min={MIN_LENGTH}
          max={MAX_LENGTH}
          step={1}
          value={length}
          onChange={(event) => setLength(Number(event.target.value))}
          // Native track and thumb, tinted by accent-color — the same coral
          // marks every active control here, and it needs no shadow.
          className="mt-3 w-full cursor-pointer accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        />
        <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-faint">
          <span>{MIN_LENGTH}</span>
          <span>{MAX_LENGTH}</span>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Include</h2>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {CHARACTER_SETS.map((entry) => (
            <SetCheckbox
              key={entry.set}
              set={entry.set}
              label={entry.label}
              hint={entry.hint}
              checked={toggles[entry.set]}
              onChange={() => handleToggle(entry.set)}
            />
          ))}
        </div>
      </div>

      {error && <Notice message={error} />}

      <Card className="min-h-[104px] p-4">
        {output ? (
          <>
            <p className="select-all break-all font-mono text-[15px] leading-relaxed text-ink">
              {output.password}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
              <StrengthLabel level={output.strength.level} />
              <span className="font-mono text-[11px] tabular-nums text-faint">
                {output.strength.bits} bits of entropy
              </span>
            </div>
          </>
        ) : (
          <p className="text-[13px] text-muted">Your password will appear here.</p>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={regenerate}>Generate</Button>
        <Button variant="secondary" disabled={output === null} onClick={handleCopy}>
          {COPY_LABELS[copyState]}
        </Button>
        <span aria-live="polite" className="sr-only">
          {copyState === "copied" ? "Password copied to clipboard" : ""}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        Every character comes from your browser&apos;s cryptographic random number generator, and the
        password is built on your device — it is never sent anywhere and nothing is stored. Each type
        you switch on is guaranteed to appear at least once.
      </p>
    </div>
  );
}

/**
 * A native checkbox tinted with accent-color, in a bordered row so the whole
 * label is a target — the same border-only hover the cards use.
 */
function SetCheckbox({
  set,
  label,
  hint,
  checked,
  onChange,
}: {
  set: CharacterSet;
  label: string;
  hint: string;
  checked: boolean;
  onChange: () => void;
}) {
  const id = `password-generator-${set}`;

  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 transition-colors duration-150",
        checked ? "border-accent bg-accent/[0.06]" : "border-line bg-transparent hover:border-ink",
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 shrink-0 cursor-pointer accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      />
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <span className="font-mono text-[11px] text-faint">{hint}</span>
    </label>
  );
}

/**
 * Three steps up the one accent the palette has: neutral tint, accent tint,
 * solid accent — the same escalation the QR size buttons use for inactive
 * versus active. There is no red to spend on "weak", and a colour the palette
 * doesn't own would be the only one on the page.
 */
const STRENGTH_STYLES: Record<StrengthLevel, string> = {
  weak: "bg-ink/[0.05] text-muted",
  medium: "bg-accent/[0.10] text-accent-deep",
  strong: "bg-accent text-canvas",
};

function StrengthLabel({ level }: { level: StrengthLevel }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em]",
        STRENGTH_STYLES[level],
      )}
    >
      {STRENGTH_LABELS[level]} password
    </span>
  );
}

/** Same accent-tinted panel the other tools use for inline messages. */
function Notice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-accent bg-accent/[0.06] px-4 py-3">
      <p className="text-[13px] font-medium leading-relaxed text-accent-deep">{message}</p>
    </div>
  );
}
