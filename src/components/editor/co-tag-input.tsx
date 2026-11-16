"use client";
// A CO tag field: free text in the tag format, with the syllabus COs of the
// paper's course offered as suggestions (D85: the syllabus gives defaults,
// the user's own tag wins, e.g. for courses still on an older syllabus).
// A question may carry a second CO (D119): a second box, shown once the
// first holds a tag; the value stays one string, `BP604T.01, BP604T.03`.
import { CO_TAG_HINT, CO_TAG_MAX, CO_TAG_SEP, cleanCoTagInput } from "@/lib/paper/co-tag";

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
  // Split without trimming: a trailing space is the user typing a suffix.
  const [first = "", second = ""] = (value ?? "").split(CO_TAG_SEP);
  const emit = (a: string, b: string) => onChange((b ? `${a}${CO_TAG_SEP}${b}` : a) || null);
  const field = (n: 1 | 2, v: string, set: (t: string) => void) => (
    <input
      id={n === 1 ? id : `${id}-2`}
      aria-label={n === 1 ? label : `Second ${label} (optional)`}
      value={v}
      placeholder={n === 1 ? placeholder : "2nd CO"}
      maxLength={CO_TAG_MAX}
      title={options.length ? `${CO_TAG_HINT}. Suggestions come from the syllabus.` : CO_TAG_HINT}
      list={options.length ? listId : undefined}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => set(cleanCoTagInput(e.target.value))}
      className={className}
    />
  );
  return (
    <>
      <span className="flex min-w-0 flex-wrap gap-1">
        {field(1, first, (t) => emit(t, t ? second : ""))}
        {first.trim() ? field(2, second, (t) => emit(first, t)) : null}
      </span>
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
