"use client";
// Form building blocks: labelled fields with their error read out by screen
// readers, a submit button that shows it is working, and form-level messages.
import { type InputHTMLAttributes, type ReactNode, useId } from "react";
import { useFormStatus } from "react-dom";
import { buttonStyles } from "./styles";

export { buttonStyles };

const inputClass =
  "block h-10 w-full rounded-md border border-rule-strong bg-surface px-3 text-body text-ink " +
  "placeholder:text-ink-3 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 " +
  "focus-visible:outline-accent aria-invalid:border-danger " +
  "";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
}

export function Field({ label, name, error, hint, className, ...input }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
        className={className ? `${inputClass} ${className}` : inputClass}
        {...input}
      />
      {error ? (
        <p id={errorId} className="text-small text-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-small text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface SelectProps {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, name, defaultValue, options }: SelectProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-ink">
        {label}
      </label>
      <select id={id} name={name} defaultValue={defaultValue} className={inputClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: keyof typeof buttonStyles;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonStyles[variant]}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export function FormAlert({ kind, children }: { kind: "error" | "notice"; children: ReactNode }) {
  const styles =
    kind === "error"
      ? "border-danger/25 bg-danger-soft text-danger"
      : "border-positive/25 bg-positive-soft text-positive";
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2.5 text-small ${styles}`}
    >
      {children}
    </div>
  );
}
