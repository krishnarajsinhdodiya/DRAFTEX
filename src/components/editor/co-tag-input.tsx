"use client";
// A CO tag field: free text in the tag format, with the syllabus COs of the
// paper's course offered as suggestions (D85: the syllabus gives defaults,
// the user's own tag wins, e.g. for courses still on an older syllabus).
import { CO_TAG_HINT, CO_TAG_MAX, cleanCoTagInput } from "@/lib/paper/co-tag";

export function CoTagInput({
  id,
  label,
  value,
  placeholder,
  options,
  onChange,
  className,
}: {
  id: string;
  label: string;
  value: string | null;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (tag: string | null) => void;
  className: string;
}) {
  const listId = `${id}-suggestions`;
  return (
    <>
      <input
        id={id}
        aria-label={label}
        value={value ?? ""}
        placeholder={placeholder}
        maxLength={CO_TAG_MAX}
        title={options.length ? `${CO_TAG_HINT}. Suggestions come from the syllabus.` : CO_TAG_HINT}
        list={options.length ? listId : undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(cleanCoTagInput(e.target.value) || null)}
        className={className}
      />
      {options.length ? (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o.value} value={o.value} label={o.label} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}
