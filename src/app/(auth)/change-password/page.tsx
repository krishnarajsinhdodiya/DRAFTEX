import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/server/auth";
import { ChangePasswordForm } from "../forms";

export const metadata: Metadata = { title: "Change password · DRAFTEX" };

export default async function ChangePasswordPage() {
  const { user } = await requireSession();
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {user.mustChangePassword ? "Choose your own password" : "Change password"}
        </h1>
        {user.mustChangePassword ? (
          <p className="text-neutral-700 dark:text-neutral-300">
            An administrator set your current password. Choose one only you know before you
            continue.
          </p>
        ) : null}
      </div>
      <ChangePasswordForm />
      {user.mustChangePassword ? null : (
        <Link
          href="/"
          className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
        >
          Back without changing
        </Link>
      )}
    </>
  );
}
