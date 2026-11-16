import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert } from "@/components/form";
import { linkStyles, pageTitleStyles, sheetStyles } from "@/components/styles";
import { actorOf } from "@/lib/auth/service";
import { NotFoundError, getData } from "@/lib/data";
import { EXAM_KIND_LABEL, marksText } from "@/lib/templates/labels";
import { requireUser } from "@/server/auth";
import { blueprintCommands } from "@/server/blueprint-commands";
import { OwnerBadge } from "../../bank/bank-list";
import { BlueprintForm } from "../blueprint-form";
import { DeleteBlueprint, ShareSwitch } from "./buttons";

export const metadata: Metadata = { title: "Blueprint · DRAFTEX" };

export default async function BlueprintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireUser();
  const { id } = await params;
  const saved = (await searchParams).saved === "1";
  const commands = blueprintCommands(await getData(), actorOf(user));
  let b: Awaited<ReturnType<typeof commands.get>>;
  try {
    b = await commands.get(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const title = `${b.courseCode} · ${EXAM_KIND_LABEL[b.examKind]}`;
  const back = (
    <Link href="/blueprints" className={`${linkStyles} self-start text-small`}>
      ← CO blueprints
    </Link>
  );
  if (!b.mine) {
    const unit = b.unit === "PERCENT" ? "%" : " marks";
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-1">
          {back}
          <h1 className={`${pageTitleStyles} break-words [overflow-wrap:anywhere]`}>{title}</h1>
          <p className="flex flex-wrap items-center gap-2 text-small text-ink-2">
            <OwnerBadge name={b.ownerName} /> Allowed difference ±{b.tolerance}
            {unit}
          </p>
        </div>
        <table className={`${sheetStyles} w-full text-small`}>
          <caption className="sr-only">Target per CO</caption>
          <thead>
            <tr className="border-b border-rule text-left text-caption text-ink-2">
              <th scope="col" className="px-5 py-2 font-medium">
                CO
              </th>
              <th scope="col" className="px-5 py-2 text-right font-medium">
                Target
              </th>
            </tr>
          </thead>
          <tbody>
            {b.targets.map((t) => (
              <tr key={t.co} className="border-b border-rule/60 last:border-0">
                <th scope="row" className="px-5 py-1.5 text-left font-normal break-all">
                  {t.co}
                </th>
                <td className="px-5 py-1.5 text-right tabular-nums">
                  {marksText(t.target)}
                  {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const courses = await commands.courses();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        {back}
        <h1 className={`${pageTitleStyles} break-words [overflow-wrap:anywhere]`}>{title}</h1>
      </div>
      {saved ? <FormAlert kind="notice">Blueprint saved.</FormAlert> : null}
      <BlueprintForm
        key={b.version}
        id={b.id}
        version={b.version}
        initial={{
          courseCode: b.courseCode,
          examKind: b.examKind,
          unit: b.unit,
          tolerance: b.tolerance,
          targets: b.targets,
        }}
        courses={courses}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ShareSwitch id={b.id} shared={b.sharing === "SHARED"} />
        <DeleteBlueprint id={b.id} />
      </div>
    </div>
  );
}
