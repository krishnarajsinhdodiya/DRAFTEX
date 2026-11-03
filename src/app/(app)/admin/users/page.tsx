import type { Metadata } from "next";
import { actorOf } from "@/lib/auth/service";
import { getData } from "@/lib/data";
import { getAuth, requireAdmin } from "@/server/auth";
import { CreateUserForm, InviteForm, type PersonView, RevokeInviteButton, UserRow } from "./client";

export const metadata: Metadata = { title: "People · DRAFTEX" };

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

type Person = Awaited<ReturnType<Awaited<ReturnType<typeof getData>>["users"]["list"]>>[number];

/** What the table shows; a lock that has already ended is not shown. */
function personViews(people: Person[], youId: string): PersonView[] {
  const now = Date.now();
  return people.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    isActive: p.isActive,
    mustChangePassword: p.mustChangePassword,
    lockedUntil: p.lockedUntil && p.lockedUntil.getTime() > now ? when.format(p.lockedUntil) : null,
    isYou: p.id === youId,
  }));
}

export default async function UsersPage() {
  const { user } = await requireAdmin();
  const actor = actorOf(user);
  const data = await getData();
  const [people, invites] = await Promise.all([
    data.users.list(actor),
    (await getAuth()).listInvites(actor),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-10">
      <section aria-labelledby="people" className="flex flex-col gap-4">
        <h1 id="people" className="font-paper text-display font-semibold">
          People
        </h1>
        <div className="overflow-x-auto rounded-lg border border-rule">
          <table className="w-full text-left text-small">
            <thead className="bg-sunk text-ink-2">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Name
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Role
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {personViews(people, user.id).map((p) => (
                <UserRow key={p.id} person={p} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-12 md:grid-cols-2">
        <section aria-labelledby="add" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="add" className="font-paper text-title font-semibold">
              Add a person
            </h2>
            <p className="text-small text-ink-2">
              Choose a temporary password and tell them. They pick their own when they first sign
              in.
            </p>
          </div>
          <CreateUserForm />
        </section>

        <section aria-labelledby="invites" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="invites" className="font-paper text-title font-semibold">
              Invite codes
            </h2>
            <p className="text-small text-ink-2">
              A code lets one person create their own account. It works once and expires after 7
              days.
            </p>
          </div>
          <InviteForm />
          {invites.length > 0 ? (
            <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule text-small">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">
                      {i.note ?? (i.role === "ADMIN" ? "Administrator invite" : "Faculty invite")}
                    </span>
                    <span className="text-ink-2">
                      {i.role === "ADMIN" ? "Administrator" : "Faculty"} · expires{" "}
                      {when.format(i.expiresAt)}
                    </span>
                  </div>
                  <RevokeInviteButton inviteId={i.id} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-2">No unused invite codes.</p>
          )}
        </section>
      </div>
    </div>
  );
}
