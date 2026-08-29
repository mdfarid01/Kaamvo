"use client";

import { useMemo, useState } from "react";
import { FieldGroup, SelectField, TextField } from "@/components/ui/field";
import {
  CATEGORIES,
  convert,
  formatResult,
  getCategory,
  getUnit,
  parseValue,
  rateLabel,
  unitOptions,
} from "@/lib/unit-converter";
import type { CategoryId } from "@/lib/unit-converter";
import { cn } from "@/lib/utils";

/**
 * Form state over lib/unit-converter.ts, which holds every factor.
 *
 * Only one of the two value fields is real: `entry` is what was typed and `side`
 * says which box it was typed into, and the other box is derived. Keeping both
 * as independent state is the version of this tool that drifts — two fields each
 * trying to update the other re-round the number on every keystroke, so 1 metre
 * becomes 3.28084 feet becomes 0.999999 metres.
 *
 * That also makes swapping trivial: exchange the units, flip the side, and the
 * typed number stays attached to the unit it was typed for.
 */

type Side = "from" | "to";

export function UnitConverterTool() {
  const [categoryId, setCategoryId] = useState<CategoryId>("length");
  const category = getCategory(categoryId);

  const [fromId, setFromId] = useState(category.defaults[0]);
  const [toId, setToId] = useState(category.defaults[1]);
  const [entry, setEntry] = useState("1");
  const [side, setSide] = useState<Side>("from");

  const parsed = parseValue(entry);

  const converted = useMemo(() => {
    if (parsed === null) return "";

    const target = side === "from" ? toId : fromId;
    const source = side === "from" ? fromId : toId;

    return formatResult(convert(category, parsed, source, target));
  }, [category, fromId, toId, parsed, side]);

  const fromValue = side === "from" ? entry : converted;
  const toValue = side === "to" ? entry : converted;

  function handleCategory(next: CategoryId) {
    const nextCategory = getCategory(next);

    setCategoryId(next);
    setFromId(nextCategory.defaults[0]);
    setToId(nextCategory.defaults[1]);
    setSide("from");
    setEntry("1");
  }

  function handleSwap() {
    setFromId(toId);
    setToId(fromId);
    setSide(side === "from" ? "to" : "from");
  }

  function handleEntry(value: string, from: Side) {
    setEntry(value);
    setSide(from);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Category</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORIES.map((entryCategory) => (
            <CategoryButton
              key={entryCategory.id}
              label={entryCategory.label}
              active={entryCategory.id === categoryId}
              onClick={() => handleCategory(entryCategory.id)}
            />
          ))}
        </div>
      </div>

      <FieldGroup title="From">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Value"
            value={fromValue}
            onChange={(value) => handleEntry(value, "from")}
            placeholder="0"
            numeric
          />
          <SelectField
            label="Unit"
            value={fromId}
            onChange={setFromId}
            options={unitOptions(category)}
          />
        </div>
      </FieldGroup>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSwap}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-colors duration-150 hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <SwapIcon />
          Swap
        </button>
        <p className="font-mono text-[13px] tabular-nums text-muted">
          {rateLabel(category, fromId, toId)}
        </p>
      </div>

      <FieldGroup title="To">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Value"
            value={toValue}
            onChange={(value) => handleEntry(value, "to")}
            placeholder="0"
            numeric
          />
          <SelectField
            label="Unit"
            value={toId}
            onChange={setToId}
            options={unitOptions(category)}
          />
        </div>
      </FieldGroup>

      <p aria-live="polite" className="text-[13px] leading-relaxed text-muted">
        {parsed === null
          ? "Type a number in either box — the other one follows."
          : `${formatResult(parsed)} ${getUnit(category, side === "from" ? fromId : toId).symbol} = ${converted} ${getUnit(category, side === "from" ? toId : fromId).symbol}`}
      </p>

      <p className="text-[13px] leading-relaxed text-muted">
        Both boxes are editable and convert as you type. Everything is worked out in your browser —
        nothing is sent anywhere.
      </p>
    </div>
  );
}

function CategoryButton({
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

function SwapIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 5.5h10M10.5 3 13 5.5 10.5 8" />
      <path d="M13 10.5H3M5.5 8 3 10.5 5.5 13" />
    </svg>
  );
}
