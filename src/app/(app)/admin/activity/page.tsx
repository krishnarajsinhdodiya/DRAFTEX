import type { Metadata } from "next";
import Link from "next/link";
import { buttonStyles, inputStyles, linkStyles, pageTitleStyles } from "@/components/styles";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { requireAdmin } from "@/server/auth";

export const metadata: Metadata = { title: "Activity · DRAFTEX" };

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" });

const THING: Record<string, string> = {
  Paper: "a paper",
  Template: "a template",
  Image: "a picture",
  User: "an account",
  Invite: "an invite",
  Backup: "a backup",
};

/** Plain English for an audit row; question text is never in the log, so none can show here. */
function describe(action: string, entity: string): string {
  const thing = THING[entity] ?? entity.toLowerCase();
  const fixed: Record<string, string> = {
    "sign-in": "Signed in",
    "sign-in-failed": "Wrong password",
    lockout: "Locked out after wrong passwords",
    unlock: "Unlocked an account",
    "setup-admin": "Set up DRAFTEX",
    "change-password": "Changed own password",
    "reset-password": "Set a password for an account",
    "reset-password-offline": "Reset a password on the DRAFTEX computer",
    trash: "Moved a paper to Trash",
    "empty-trash": "Emptied Trash",
    print: "Exported a paper (now Printed)",
    reopen: "Put a Final or Printed paper back to Draft",
    "restore-version": "Restored a version of a paper as a new paper",
    "purge-trash": "Removed papers that were in Trash for 30 days",
    "restore-built-ins": "Restored the built-in templates",
    "advanced-latex:on": "Allowed Advanced LaTeX",
    "advanced-latex:off": "Stopped Advanced LaTeX",
    redeem: "Joined with an invite",
    backup: "Made a backup",
    "delete-backup": "Deleted a backup",
    "stage-restore": "Prepared a restore",
    "cancel-restore": "Cancelled a restore",
    "restore-applied": "Restored a backup",
    "network:save": "Changed network settings",
    "firewall:add": "Allowed other computers through the firewall",
    "firewall:remove": "Stopped allowing other computers through the firewall",
    restart: "Restarted DRAFTEX",
  };
  if (fixed[action]) return fixed[action]!;
  const verb: Record<string, string> = {
    create: "Created",
    update: "Changed",
    delete: "Deleted",
    copy: "Copied",
    duplicate: "Duplicated",
    revoke: "Withdrew",
    restore: "Restored",
  };
  if (verb[action]) return entity ? `${verb[action]} ${thing}` : `${verb[action]} something`;
  // An action this screen has no words for yet: still readable.
  const words = action.replace(/[-:_]+/g, " ").trim();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}${entity ? ` (${thing})` : ""}`;
}

function detailOf(action: string, detail: string | null): string {
  if (!detail) return "";
  if (action === "network:save") {
    const [mode, port] = detail.split(":");
    const label = { local: "this computer only", lan: "this network", server: "secure web server" };
    return `${label[mode as keyof typeof label] ?? mode}, port ${port}`;
  }
  if (action === "firewall:add") return `port ${detail}`;
  if (action === "restore-applied") {
    const d = new Date(detail);
    return Number.isNaN(d.getTime()) ? detail : `backup of ${when.format(d)}`;
  }
  return `from ${detail}`;
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ActivityPage({ searchParams }: { searchParams: Search }) {
  const { user } = await requireAdmin();
  const actor = actorOf(user);
  const data = await getData();
  const sp = await searchParams;
  const action = one(sp.action);
  const person = one(sp.person);
  const [log, actions, people] = await Promise.all([
    data.audit.list(actor, {
      page: Number(one(sp.page)) || 1,
      action: action || undefined,
      actorId: person || undefined,
    }),
    data.audit.actions(actor),
    data.users.list(actor),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const href = (page: number) => {
    const q = new URLSearchParams({
      ...(action && { action }),
      ...(person && { person }),
      page: String(page),
    });
    return `/admin/activity?${q}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className={pageTitleStyles}>Activity</h1>
        <p className="max-w-prose text-ink-2">
          Who signed in, and who changed papers, templates, accounts, backups and network settings.
          What a paper says is never recorded here.
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter activity">
        <label className="flex flex-col gap-1.5 text-small font-medium">
          Person
          <select name="person" defaultValue={person} className={inputStyles}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-small font-medium">
          What
          <select name="action" defaultValue={action} className={inputStyles}>
            <option value="">Everything</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {describe(a, "")}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={`${buttonStyles.secondary} h-9`}>
          Show
        </button>
        {action || person ? (
          <Link href="/admin/activity" className={`${linkStyles} pb-2 text-small`}>
            Clear
          </Link>
        ) : null}
      </form>

      {log.rows.length ? (
        <div className="overflow-x-auto rounded-lg border border-rule">
          <table className="w-full text-left text-small">
            <thead className="bg-sunk text-ink-2">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium whitespace-nowrap">
                  When
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Who
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  What
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {log.rows.map((r) => {
                const detail = detailOf(r.action, r.detail);
                // Which account, when the row is about someone other than the person who did it.
                const about =
                  r.entity === "User" && r.entityId && r.entityId !== r.actor?.id
                    ? names.get(r.entityId)
                    : undefined;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink-2 tabular-nums">
                      {when.format(r.at)}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.actor?.name ?? <span className="text-ink-3">Someone not signed in</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {describe(r.action, r.entity)}
                      {about ? <span>: {about}</span> : null}
                      {detail ? <span className="text-ink-2"> · {detail}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-ink-2">Nothing recorded{action || person ? " for this filter" : ""}.</p>
      )}

      {log.pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center gap-3 text-small">
          {log.page > 1 ? (
            <Link href={href(log.page - 1)} className={buttonStyles.secondary}>
              Newer
            </Link>
          ) : null}
          <span className="text-ink-2 tabular-nums">
            Page {log.page} of {log.pages} · {log.total} entries
          </span>
          {log.page < log.pages ? (
            <Link href={href(log.page + 1)} className={buttonStyles.secondary}>
              Older
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
