import type { Metadata } from "next";
import Link from "next/link";
import { linkStyles, pageTitleStyles } from "@/components/styles";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { requireUser } from "@/server/auth";
import { bankCommands } from "@/server/bank-commands";
import { NEW_QUESTION, QuestionForm } from "../question-form";

export const metadata: Metadata = { title: "New question · DRAFTEX" };

export default async function NewQuestionPage() {
  const { user } = await requireUser();
  const courses = await bankCommands(await getData(), actorOf(user)).courseSuggestions();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <Link href="/bank" className={`${linkStyles} self-start text-small`}>
          ← Question bank
        </Link>
        <h1 className={pageTitleStyles}>New question</h1>
      </div>
      <QuestionForm
        id={null}
        version={1}
        initial={NEW_QUESTION}
        courses={courses}
        allowAdvanced={user.allowAdvancedLatex}
      />
    </div>
  );
}
