import type { Metadata } from "next";
import Link from "next/link";
import { linkStyles, pageTitleStyles } from "@/components/styles";
import { CSV_MAX_ROWS } from "@/lib/bank/csv";
import { requireUser } from "@/server/auth";
import { ImportClient } from "./import-client";

export const metadata: Metadata = { title: "Import questions · DRAFTEX" };

export default async function ImportPage() {
  await requireUser();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <Link href="/bank" className={`${linkStyles} self-start text-small`}>
          ← Question bank
        </Link>
        <h1 className={pageTitleStyles}>Import questions from CSV</h1>
      </div>
      <div className="flex max-w-prose flex-col gap-2 text-small text-ink-2">
        <p>
          Fill in the{" "}
          <a href="/api/bank/template" className={linkStyles} download>
            CSV template
          </a>{" "}
          in Excel, one question per row, and save it as CSV. Up to{" "}
          {CSV_MAX_ROWS.toLocaleString("en")} questions and 1 MB per file.
        </p>
        <p>
          The CO can be the full tag (BP604T.01) or just its number (1). Text only: add equations,
          tables and pictures in the editor afterwards. Nothing is saved until you choose Save.
        </p>
      </div>
      <ImportClient />
    </div>
  );
}
