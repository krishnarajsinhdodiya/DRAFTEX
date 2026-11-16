import type { Metadata } from "next";
import Link from "next/link";
import { linkStyles, pageTitleStyles } from "@/components/styles";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { requireUser } from "@/server/auth";
import { blueprintCommands } from "@/server/blueprint-commands";
import { BlueprintForm, NEW_BLUEPRINT } from "../blueprint-form";

export const metadata: Metadata = { title: "New blueprint · DRAFTEX" };

export default async function NewBlueprintPage() {
  const { user } = await requireUser();
  const courses = await blueprintCommands(await getData(), actorOf(user)).courses();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <Link href="/blueprints" className={`${linkStyles} self-start text-small`}>
          ← CO blueprints
        </Link>
        <h1 className={pageTitleStyles}>New blueprint</h1>
      </div>
      <BlueprintForm id={null} version={1} initial={NEW_BLUEPRINT} courses={courses} />
    </div>
  );
}
