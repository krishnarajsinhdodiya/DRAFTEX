// Near-duplicates of a question in the user's own bank (D114): a note with
// links, never a block. Used on the question page and after saving.
import Link from "next/link";
import { percent } from "@/lib/bank/similar";

export interface SimilarItem {
  id: string;
  score: number;
  summary: string;
}

export function SimilarNote({ items }: { items: SimilarItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Questions that read almost the same" className="text-small text-caution">
      <p>
        {items.length === 1
          ? "One of your questions in this course reads almost the same:"
          : `${items.length} of your questions in this course read almost the same:`}
      </p>
      <ul className="mt-1 flex flex-col gap-1 pl-5 [list-style:disc]">
        {items.map((s) => (
          <li key={s.id} className="min-w-0 break-words">
            <Link href={`/bank/${s.id}`} className="text-accent underline underline-offset-2">
              {s.summary || "Untitled question"}
            </Link>{" "}
            <span className="text-ink-2 tabular-nums">
              ({percent(s.score)} the same three-word runs)
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
