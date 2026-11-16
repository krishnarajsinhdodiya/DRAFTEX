import type { Metadata } from "next";
import Link from "next/link";
import { linkStyles, pageTitleStyles, sheetStyles } from "@/components/styles";
import { actorOf } from "@/lib/auth/service";
import { percent } from "@/lib/bank/similar";
import { getData } from "@/lib/data";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Possible duplicates · DRAFTEX" };

/** Pairs shown on one screen; the most similar come first. */
const SHOWN = 200;

// D114: pairs of the user's own questions (same course, not in Trash) that
// read almost the same. Never colleagues' questions, for anyone (D73).
export default async function DuplicatesPage() {
  const { user } = await requireUser();
  const data = await getData();
  const pairs = await data.bank.possibleDuplicates(actorOf(user));
  const shown = pairs.slice(0, SHOWN);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <Link href="/bank" className={`${linkStyles} self-start text-small`}>
          ← Question bank
        </Link>
        <h1 className={pageTitleStyles}>Possible duplicates</h1>
      </div>
      <p className="-mt-3 max-w-prose text-small text-ink-2">
        Pairs of your own questions in the same course that read almost the same, most alike first.
        Only your questions are compared, never colleagues&rsquo;. Nothing is changed here: open a
        question to edit it or move it to Trash. Questions with the very same text are listed on the
        question itself.
      </p>
      {shown.length === 0 ? (
        <div className={`${sheetStyles} px-6 py-12 text-center`}>
          <p className="font-medium">No possible duplicates.</p>
          <p className="mt-1 text-small text-ink-2">
            None of your questions reads almost the same as another in its course.
          </p>
        </div>
      ) : (
        <>
          <p className="-mt-2 text-small text-ink-2" aria-live="polite">
            {pairs.length === 1 ? "1 pair" : `${pairs.length} pairs`}
            {pairs.length > SHOWN ? `, showing the ${SHOWN} most alike` : ""}
          </p>
          <ul aria-label="Possible duplicates" className="flex flex-col gap-3">
            {shown.map((p) => (
              <li
                key={`${p.a.id}/${p.b.id}`}
                aria-label={`${p.courseCode}, ${percent(p.score)} alike`}
                className={`${sheetStyles} flex min-w-0 flex-col gap-2 p-4`}
              >
                <p className="text-small text-ink-2 tabular-nums">
                  {p.courseCode} · {percent(p.score)} of three-word runs the same
                </p>
                {[p.a, p.b].map((q) => (
                  <Link
                    key={q.id}
                    href={`/bank/${q.id}`}
                    className="min-w-0 font-paper break-words text-ink underline-offset-2 hover:underline"
                  >
                    {q.summary || "Untitled question"}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
