import type { Metadata } from "next";
import { FormAlert } from "@/components/form";
import { eyebrowStyles, linkStyles, pageTitleStyles } from "@/components/styles";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { requireAdmin } from "@/server/auth";
import { backupCommands } from "@/server/backup-commands";
import { backupContext } from "@/server/backups";
import { BackupNowButton, CancelRestoreButton, RestoreForm } from "./client";

export const metadata: Metadata = { title: "Backups · DRAFTEX" };

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function BackupsPage() {
  const { user } = await requireAdmin();
  const { rows, pending, folder } = backupCommands(
    await getData(),
    backupContext(),
    actorOf(user),
  ).list();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className={pageTitleStyles}>Backups</h1>
        <p className="max-w-prose text-ink-2">
          A backup holds every paper, answer key, template, picture and account. DRAFTEX makes one
          every day and keeps the last 14 of those. Other backups (made by hand, before an update or
          before a restore) are never removed for you: delete old ones from the folder when you no
          longer need them. They are saved in <span className="break-all text-ink">{folder}</span>.
        </p>
        <FormAlert kind="caution">
          Backups contain unreleased exam papers. Keep copies on a drive only you use, not in a
          shared or cloud-synced folder.
        </FormAlert>
      </header>

      {pending ? (
        <section
          aria-labelledby="pending"
          className="flex flex-wrap items-center gap-3 rounded-lg border-l-4 border-caution bg-caution-soft px-4 py-3"
        >
          <p id="pending" className="min-w-0 flex-1 text-small">
            <span className="font-semibold">A restore is waiting.</span> Stop DRAFTEX and start it
            again to finish it. Until then nothing has changed.
          </p>
          <CancelRestoreButton />
        </section>
      ) : null}

      <section aria-labelledby="saved" className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 id="saved" className={eyebrowStyles}>
            Saved backups
          </h2>
          <span className="ml-auto" />
          <BackupNowButton />
        </div>
        {rows.length ? (
          <div className="overflow-x-auto rounded-lg border border-rule">
            <table className="w-full text-left text-small">
              <thead className="bg-sunk text-ink-2">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Made
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Kind
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Size
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    <span className="sr-only">Download</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="border-t border-rule">
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                      {when.format(new Date(r.at))}
                    </td>
                    <td className="px-4 py-2.5 text-ink-2">{r.kind}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-ink-2 tabular-nums">
                      {size(r.bytes)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <a
                        href={`/api/admin/backups/${encodeURIComponent(r.name)}`}
                        download={r.name}
                        className={linkStyles}
                        aria-label={`Download the backup made ${when.format(new Date(r.at))}`}
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-small text-ink-2">
            No backups yet. Make one now; DRAFTEX also makes one every day while it runs.
          </p>
        )}
      </section>

      <section aria-labelledby="restore" className="flex flex-col gap-3">
        <h2 id="restore" className={eyebrowStyles}>
          Restore
        </h2>
        <p className="max-w-prose text-small text-ink-2">
          Restoring replaces everything in DRAFTEX with the backup: papers, templates and accounts.
          DRAFTEX checks the file first and backs up what is there now, then makes the change the
          next time it starts.
        </p>
        <RestoreForm disabled={pending} />
      </section>
    </div>
  );
}
