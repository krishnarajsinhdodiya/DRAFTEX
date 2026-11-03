import Link from "next/link";
import type { ReactNode } from "react";
import { NavLink } from "@/components/nav-link";
import { buttonStyles } from "@/components/styles";
import { appInfo } from "@/lib/app-info";
import { signOutAction } from "@/server/actions";
import { requireUser } from "@/server/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-rule bg-surface">
        <div className="flex min-h-14 flex-wrap items-center gap-x-6 px-6">
          <Link
            href="/"
            className="rounded-sm font-paper text-lead font-semibold tracking-[0.08em] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {appInfo.name}
          </Link>
          <nav aria-label="Main" className="flex items-center">
            <NavLink href="/papers">Papers</NavLink>
            <NavLink href="/templates">Templates</NavLink>
            {user.role === "ADMIN" ? <NavLink href="/admin/users">People</NavLink> : null}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 hidden text-small text-ink-2 sm:inline">{user.name}</span>
            <Link href="/change-password" className={buttonStyles.quiet}>
              Change password
            </Link>
            <form action={signOutAction}>
              <button type="submit" className={buttonStyles.quiet}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex w-full flex-1 flex-col">{children}</main>
    </div>
  );
}
