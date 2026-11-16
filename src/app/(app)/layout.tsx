import Link from "next/link";
import type { ReactNode } from "react";
import { NavLink } from "@/components/nav-link";
import { buttonStyles } from "@/components/styles";
import { appInfo, creditLine } from "@/lib/app-info";
import { signOutAction } from "@/server/actions";
import { requireUser } from "@/server/auth";
import { lanBannerUrls } from "@/server/network";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();
  const lanUrls = lanBannerUrls();
  return (
    <div className="flex min-h-screen flex-col">
      {lanUrls ? (
        <div
          role="note"
          aria-label="Network"
          className="flex flex-wrap items-center gap-x-2 border-b border-caution/40 bg-caution-soft px-6 py-1.5 text-small text-ink"
        >
          <span className="font-medium">Open to this network</span>
          {lanUrls.length ? (
            <span>
              at <span className="font-mono break-all select-all">{lanUrls.join(" · ")}</span>
            </span>
          ) : null}
          <span className="text-ink-2">Use only on a network you trust.</span>
        </div>
      ) : null}
      <header className="border-b border-rule bg-surface">
        <div className="flex min-h-14 flex-wrap items-center gap-x-4 px-6 xl:gap-x-6">
          <Link
            href="/"
            className="rounded-sm font-paper text-lead font-semibold tracking-[0.08em] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {appInfo.name}
          </Link>
          <nav aria-label="Main" className="flex items-center">
            <NavLink href="/papers">Papers</NavLink>
            <NavLink href="/templates">Templates</NavLink>
            <NavLink href="/bank">Bank</NavLink>
            <NavLink href="/blueprints">Blueprints</NavLink>
            {user.role === "ADMIN" ? (
              <>
                <NavLink href="/admin/users">People</NavLink>
                <NavLink href="/admin/backups">Backups</NavLink>
                <NavLink href="/admin/network">Network</NavLink>
                <NavLink href="/admin/activity">Activity</NavLink>
              </>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {/* The name gives way first, so the seven admin links stay on one line on a
                laptop at 125–150 % display scaling (about 1000–1100 px wide). */}
            <span className="mr-2 hidden max-w-48 truncate text-small text-ink-2 xl:inline">
              {user.name}
            </span>
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
      <footer className="flex h-8 items-center gap-2 border-t border-rule px-6 text-caption text-ink-3">
        <span>{creditLine}</span>
        <span aria-hidden>·</span>
        <Link
          href="/about"
          className="rounded-sm underline-offset-2 hover:text-ink-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          About {appInfo.name} {appInfo.version}
        </Link>
      </footer>
    </div>
  );
}
