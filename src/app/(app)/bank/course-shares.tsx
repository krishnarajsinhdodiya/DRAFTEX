"use client";
// "Share a whole course" (D73): every question of yours in that course,
// now and later, is visible to every colleague until you turn it off.
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/form";
import { eyebrowStyles, sheetStyles } from "@/components/styles";
import { setCourseShareAction } from "@/server/bank-actions";

export function CourseShares({
  courses,
}: {
  courses: { code: string; title: string; shared: boolean }[];
}) {
  const [state, setState] = useState(() => new Map(courses.map((c) => [c.code, c.shared])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section aria-labelledby="share-courses" className={`${sheetStyles} flex flex-col gap-3 p-5`}>
      <h2 id="share-courses" className={eyebrowStyles}>
        Share a whole course
      </h2>
      <p className="text-small text-ink-2">
        A shared course shows every question of yours in it, including ones you add later, to every
        colleague on this DRAFTEX. Questions stay private otherwise.
      </p>
      {error ? <FormAlert kind="error">{error}</FormAlert> : null}
      <ul className="flex flex-col gap-1.5">
        {courses.map((c) => (
          <li key={c.code}>
            <label className="flex items-start gap-2 text-small">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
                checked={state.get(c.code) ?? false}
                disabled={pending}
                onChange={(e) => {
                  const on = e.target.checked;
                  setState((m) => new Map(m).set(c.code, on));
                  start(async () => {
                    setError(null);
                    const r = await setCourseShareAction(c.code, on);
                    if (!r.ok) {
                      setError(r.message);
                      setState((m) => new Map(m).set(c.code, !on));
                    }
                  });
                }}
              />
              <span className="break-words [overflow-wrap:anywhere]">
                <span className="font-medium">{c.code}</span>
                {c.title ? ` · ${c.title}` : ""}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
