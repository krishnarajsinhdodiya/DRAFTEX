import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert } from "@/components/form";
import { StaticDoc } from "@/components/editor/static-doc";
import { eyebrowStyles, linkStyles, pageTitleStyles, sheetStyles } from "@/components/styles";
import { actorOf } from "@/lib/auth/service";
import { NotFoundError, getData } from "@/lib/data";
import { BLOOM_LABEL } from "@/lib/paper/bloom";
import { GROUP_TYPE_LABEL, PROGRAM_LABEL, marksText } from "@/lib/templates/labels";
import type { BankType } from "@/lib/bank/question";
import { requireUser } from "@/server/auth";
import { bankCommands } from "@/server/bank-commands";
import { QuestionForm } from "../question-form";
import { CopyButton, TrashQuestionButton } from "./buttons";
import { OwnerBadge } from "../bank-list";

export const metadata: Metadata = { title: "Question · DRAFTEX" };

const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function QuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireUser();
  const { id } = await params;
  const justSaved = (await searchParams).saved === "1";
  const commands = bankCommands(await getData(), actorOf(user));
  let q: Awaited<ReturnType<typeof commands.get>>;
  try {
    q = await commands.get(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const uses = (
    <section aria-labelledby="uses" className={`${sheetStyles} flex flex-col gap-2 p-5`}>
      <h2 id="uses" className={eyebrowStyles}>
        Your uses
      </h2>
      {q.uses.length ? (
        <ul className="flex flex-col gap-1 text-small">
          {q.uses.map((u, i) => (
            <li key={i} className="break-words [overflow-wrap:anywhere]">
              {u.paperId ? (
                <Link href={`/papers/${u.paperId}`} className={linkStyles}>
                  {u.paperTitle}
                </Link>
              ) : (
                <span>{u.paperTitle} (deleted)</span>
              )}
              <span className="text-ink-2"> · {day.format(u.usedAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-ink-2">You have not used this question in a paper yet.</p>
      )}
      <p className="text-caption text-ink-3">Only you see your uses.</p>
    </section>
  );

  if (!q.mine) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-1">
          <Link href="/bank" className={`${linkStyles} self-start text-small`}>
            ← Question bank
          </Link>
          <h1 className={pageTitleStyles}>Shared question</h1>
          <p className="flex min-w-0 flex-wrap items-center gap-2 text-small text-ink-2">
            <OwnerBadge name={q.ownerName} />
            <span className="break-words [overflow-wrap:anywhere]">
              {[
                q.courseCode,
                q.courseTitle,
                q.program ? PROGRAM_LABEL[q.program] : null,
                q.unit ? `Unit ${q.unit}` : null,
                q.coTag,
                q.bloomLevel ? BLOOM_LABEL[q.bloomLevel] : null,
                q.type ? GROUP_TYPE_LABEL[q.type as BankType] : null,
                q.marks !== null ? `${marksText(q.marks)} marks` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </p>
        </div>
        <section aria-label="Question" className={`${sheetStyles} p-3 font-paper`}>
          <StaticDoc doc={q.content} />
        </section>
        {q.answerKey ? (
          <section aria-labelledby="answer" className={`${sheetStyles} flex flex-col p-3`}>
            <h2 id="answer" className={`${eyebrowStyles} px-3 pt-2`}>
              Model answer
            </h2>
            <div className="font-paper">
              <StaticDoc doc={q.answerKey} />
            </div>
          </section>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <CopyButton id={q.id} />
          <span className="text-small text-ink-2">
            Only {q.ownerName} can change it. Insert it into a paper from the paper editor, or keep
            your own copy.
          </span>
        </div>
        {uses}
      </div>
    );
  }

  const courses = await commands.courseSuggestions();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/bank" className={`${linkStyles} self-start text-small`}>
            ← Question bank
          </Link>
          <h1 className={pageTitleStyles}>Question</h1>
          {q.courseShared ? (
            <p className="text-small text-ink-2">
              Colleagues see this question because you share the whole course {q.courseCode}.
            </p>
          ) : null}
        </div>
        <TrashQuestionButton id={q.id} />
      </div>
      {justSaved ? (
        <FormAlert kind={q.warnings.length || q.duplicates ? "caution" : "notice"}>
          Saved. The question is in your bank.
          {q.duplicates
            ? ` You already have ${q.duplicates === 1 ? "a question" : `${q.duplicates} questions`} with the same text in this course (Trash included).`
            : ""}
        </FormAlert>
      ) : null}
      {q.warnings.length ? (
        <ul className="-mb-2 list-disc pl-5 text-small text-caution">
          {q.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      <QuestionForm
        id={q.id}
        version={q.version}
        initial={{
          courseCode: q.courseCode ?? "",
          courseTitle: q.courseTitle ?? "",
          program: q.program ?? "B_PHARM",
          unit: q.unit ? String(q.unit) : "",
          coTag: q.coTag,
          bloomLevel: q.bloomLevel ?? "",
          marks: q.marks !== null ? String(q.marks) : "",
          type: (q.type as BankType | null) ?? "SHORT",
          tags: q.tags.join("; "),
          content: q.content,
          answerKey: q.answerKey,
          keyCriteria: q.keyCriteria,
          shared: q.sharing === "SHARED",
        }}
        courses={courses}
        allowAdvanced={user.allowAdvancedLatex}
      />
      {uses}
    </div>
  );
}
