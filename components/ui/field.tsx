"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The labelled form controls the three document tools are built from — Invoice
 * Generator, Rent Receipt and anything else that asks for a page full of
 * details rather than a file.
 *
 * They exist as components because those forms have around forty fields between
 * them, and forty copies of the same eight class names is where a design system
 * quietly stops being one. The styling is the same border, radius, focus ring
 * and disabled treatment as PageRangeField, which was the first field here.
 */

const CONTROL =
  "h-10 w-full rounded-md border bg-surface px-3 text-[14px] text-ink transition-colors duration-150 placeholder:text-faint focus:outline-none focus:ring-[3px] focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50";

const BORDER = "border-line focus:border-accent";

interface WrapperProps {
  id: string;
  label: string;
  /** Sits under the control — an example, a unit, or what's wrong with it. */
  hint?: ReactNode;
  /** Renders the hint as a warning rather than as guidance. */
  warn?: boolean;
  className?: string;
  children: ReactNode;
}

function Wrapper({ id, label, hint, warn = false, className, children }: WrapperProps) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted"
      >
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint !== undefined && hint !== "" && (
        <p
          id={`${id}-hint`}
          className={cn(
            "mt-1.5 text-[12px] leading-relaxed",
            warn ? "font-medium text-accent-deep" : "text-muted",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  warn?: boolean;
  /** "date" and "time" get the native pickers; "decimal" is a phone keypad. */
  type?: "text" | "date" | "time";
  numeric?: boolean;
  /** Upper-cases as you type — for a PAN, where lower case would be wrong. */
  uppercase?: boolean;
  disabled?: boolean;
  className?: string;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  warn = false,
  type = "text",
  numeric = false,
  uppercase = false,
  disabled = false,
  className,
}: TextFieldProps) {
  const id = useId();

  return (
    <Wrapper id={id} label={label} hint={hint} warn={warn} className={className}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) =>
          onChange(uppercase ? event.target.value.toUpperCase() : event.target.value)
        }
        placeholder={placeholder}
        inputMode={numeric ? "decimal" : undefined}
        // Off for the money fields, where a browser's saved values are noise, and
        // harmless everywhere else in a form nobody submits.
        autoComplete="off"
        spellCheck={!numeric}
        disabled={disabled}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        className={cn(
          CONTROL,
          warn ? "border-accent" : BORDER,
          numeric && "font-mono tabular-nums placeholder:font-sans",
        )}
      />
    </Wrapper>
  );
}

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  rows?: number;
  className?: string;
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 3,
  className,
}: TextAreaFieldProps) {
  const id = useId();

  return (
    <Wrapper id={id} label={label} hint={hint} className={className}>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        className={cn(
          CONTROL,
          BORDER,
          // Auto height rather than the fixed h-10 the single-line controls use.
          "h-auto resize-y py-2.5 leading-relaxed",
        )}
      />
    </Wrapper>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: ReactNode;
  className?: string;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
  className,
}: SelectFieldProps) {
  const id = useId();

  return (
    <Wrapper id={id} label={label} hint={hint} className={className}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        // The native arrow is kept — a select with appearance-none and no arrow
        // of its own doesn't read as one.
        className={cn(CONTROL, BORDER, "cursor-pointer")}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

/** The uppercase caption every card in these forms is titled with. */
export function FieldGroup({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-line bg-surface p-4", className)}>
      <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}
