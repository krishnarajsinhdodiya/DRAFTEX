import type { Metadata } from "next";
import { eyebrowStyles, pageTitleStyles, sheetStyles } from "@/components/styles";
import { appInfo } from "@/lib/app-info";
import { getDataDir } from "@/lib/paths";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: `About · ${appInfo.name}` };

const BUILT_WITH = [
  "Next.js",
  "React",
  "TipTap",
  "MathLive",
  "Tectonic",
  "pdf.js",
  "Prisma",
  "SQLite",
];

export default async function AboutPage() {
  const { user } = await requireUser();
  const facts: [string, string][] = [
    ["Version", appInfo.version],
    ["Typesetting", appInfo.engine],
    ["Made for", appInfo.madeFor],
    // The folder path names the computer's user account; only administrators see it.
    ...(user.role === "ADMIN" ? ([["Data folder", getDataDir()]] as [string, string][]) : []),
  ];
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className={pageTitleStyles}>About {appInfo.name}</h1>
        <p className="max-w-prose text-lead text-ink-2">{appInfo.tagline}</p>
      </header>

      <section aria-labelledby="about-facts" className={`${sheetStyles} p-6`}>
        <h2 id="about-facts" className={eyebrowStyles}>
          This copy
        </h2>
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-body">
          {facts.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-ink-3">{term}</dt>
              <dd className="min-w-0 break-words text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="about-what" className="flex flex-col gap-3">
        <h2 id="about-what" className={eyebrowStyles}>
          What it does
        </h2>
        <p className="max-w-prose text-ink-2">
          {appInfo.name} helps pharmacy teachers write question papers. Pick a template that follows
          the PCI 2026 or KSV pattern, type the questions with equations, tables and pictures, and
          watch the paper take shape as a PDF in the university&apos;s house style. Answer keys,
          exports and backups sit beside every paper.
        </p>
        <p className="max-w-prose text-ink-2">
          Papers are confidential. They are kept on this computer and typeset here; nothing you
          write is sent over the internet.
        </p>
      </section>

      <section aria-labelledby="about-credits" className="flex flex-col gap-3">
        <h2 id="about-credits" className={eyebrowStyles}>
          Credits
        </h2>
        <p className="max-w-prose text-ink">
          Designed and built by{" "}
          <span className="font-paper text-lead font-semibold">{appInfo.creator}</span>.
        </p>
        <p className="max-w-prose text-small text-ink-3">
          Built on open-source software: {BUILT_WITH.join(", ")}.
        </p>
      </section>
    </div>
  );
}
