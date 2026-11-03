import Link from "next/link";
import type { ReactNode } from "react";
import { buttonStyles } from "@/components/form";
import { appInfo } from "@/lib/app-info";
import { signOutAction } from "@/server/actions";
import { requireUser } from "@/server/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
          <Link href="/" className="text-sm font-semibold tracking-wide">
            {appInfo.name}
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            {user.role === "ADMIN" ? (
              <Link href="/admin/users" className={buttonStyles.quiet}>
                People
              </Link>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 hidden text-sm text-neutral-600 sm:inline dark:text-neutral-400">
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
