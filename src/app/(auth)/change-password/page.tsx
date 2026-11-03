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
        <h1 className="font-paper text-display font-semibold">
          {user.mustChangePassword ? "Choose your own password" : "Change password"}
        </h1>
        {user.mustChangePassword ? (
          <p className="text-ink-2">
            An administrator set your current password. Choose one only you know before you
            continue.
          </p>
        ) : null}
      </div>
      <ChangePasswordForm />
      {user.mustChangePassword ? null : (
        <Link
          href="/"
          className="text-small font-medium text-accent underline-offset-2 hover:underline"
        >
          Back without changing
        </Link>
      )}
    </>
  );
}
