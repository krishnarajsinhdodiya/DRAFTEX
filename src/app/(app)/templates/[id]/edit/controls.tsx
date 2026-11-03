"use client";
// Compact labelled controls for the builder. Every control has a visible
// label, keeps the keyboard focus ring, and reports changes immediately.
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

export const control =
  "block h-9 w-full rounded-md border border-rule-strong bg-surface px-2.5 text-small text-ink " +
  "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent " +
  "aria-invalid:border-danger";

const labelClass = "text-small font-medium text-ink-2";

function Wrap({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-e`} className="text-caption text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-h`} className="text-caption text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  hint,
  error,
  maxLength,
  className,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  error?: string;
  maxLength?: number;
  className?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Wrap id={id} label={label} hint={hint} error={error} className={className}>
      <input
        id={id}
        className={control}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </Wrap>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  hint,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  rows?: number;
}) {
  const id = useId();
  return (
    <Wrap id={id} label={label} hint={hint}>
      <textarea
        id={id}
        rows={rows}
        className={`${control} h-auto py-2`}
        value={value}
        aria-describedby={hint ? `${id}-h` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </Wrap>
  );
}

/**
 * A number field that lets you type freely ("7.", "") and commits only valid
 * numbers. Out-of-range values show an error and are not committed.
 */
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  integer = false,
  hint,
  error,
  className,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  // Follow outside changes (undo, "use the total") without fighting the typing.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (Number(draft) !== value) setDraft(String(value));
  }
  const n = Number(draft);
  const bad =
    draft.trim() === "" ||
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n));
  const own = bad
    ? `Enter ${integer ? "a whole number" : "a number"} from ${min} to ${max}.`
    : undefined;
  const shown = own ?? error;
  return (
    <Wrap id={id} label={label} hint={hint} error={shown} className={className}>
      <input
        id={id}
        inputMode={integer ? "numeric" : "decimal"}
        className={`${control} tabular-nums`}
        value={draft}
        step={step}
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? `${id}-e` : hint ? `${id}-h` : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = Number(e.target.value);
          if (
            e.target.value.trim() !== "" &&
            Number.isFinite(v) &&
            v >= min &&
            v <= max &&
            (!integer || Number.isInteger(v))
          )
            onChange(v);
        }}
        onBlur={() => {
          if (bad) setDraft(String(value));
        }}
      />
    </Wrap>
  );
}

export function SelectInput<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  className,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  hint?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <Wrap id={id} label={label} hint={hint} className={className}>
      <select
        id={id}
        className={control}
        value={value}
        aria-describedby={hint ? `${id}-h` : undefined}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

export function Check({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-accent"
        aria-describedby={hint ? `${id}-h` : undefined}
      />
      <div className="flex flex-col">
        <label htmlFor={id} className="text-small">
          {label}
        </label>
        {hint ? (
          <span id={`${id}-h`} className="text-caption text-ink-2">
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const iconButton =
  "inline-flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-sunk " +
  "focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-30 disabled:hover:bg-transparent " +
  "transition-[background-color,transform] duration-150 ease-out active:scale-[0.94]";

/** Move up / move down / remove, with names that say what they act on. */
export function ItemTools({
  name,
  index,
  count,
  onMove,
  onRemove,
  minCount = 0,
}: {
  name: string;
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
  minCount?: number;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        className={iconButton}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        aria-label={`Move ${name} up`}
        title="Move up"
      >
        <ArrowUp aria-hidden size={16} />
      </button>
      <button
        type="button"
        className={iconButton}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
        aria-label={`Move ${name} down`}
        title="Move down"
      >
        <ArrowDown aria-hidden size={16} />
      </button>
      <button
        type="button"
        className={iconButton}
        disabled={count <= minCount}
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        title="Remove"
      >
        <X aria-hidden size={16} />
      </button>
    </div>
  );
}

export function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

export function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-rule pt-5">
      <h2 id={id} className="text-caption font-semibold tracking-[0.06em] text-ink-3 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
