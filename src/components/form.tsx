"use client";
// Form building blocks: labelled fields with their error read out by screen
// readers, a submit button that shows it is working, and form-level messages.
import { type InputHTMLAttributes, type ReactNode, useId } from "react";
import { useFormStatus } from "react-dom";

const inputClass =
  "block h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-[15px] text-neutral-900 " +
  "placeholder:text-neutral-400 focus-visible:border-blue-600 focus-visible:outline-2 focus-visible:outline-offset-1 " +
  "focus-visible:outline-blue-600 aria-invalid:border-red-600 dark:border-neutral-700 dark:bg-neutral-900 " +
  "dark:text-neutral-100 dark:aria-invalid:border-red-400";

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
      <label htmlFor={id} className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
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
        <p id={errorId} className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-sm text-neutral-600 dark:text-neutral-400">
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
      <label htmlFor={id} className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
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

const buttonBase =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-md px-4 text-[15px] font-medium " +
  "transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 disabled:active:scale-100";

export const buttonStyles = {
  primary: `${buttonBase} bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500`,
  secondary: `${buttonBase} border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800`,
  quiet: `${buttonBase} h-8 px-2.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800`,
  danger: `${buttonBase} h-8 px-2.5 text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950`,
};

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
      ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2.5 text-sm ${styles}`}
    >
      {children}
    </div>
  );
}
