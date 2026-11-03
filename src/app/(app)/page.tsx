import Link from "next/link";
import { FormAlert } from "@/components/form";
import { buttonStyles } from "@/components/styles";
import { requireUser } from "@/server/auth";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>;
}) {
  const { user } = await requireUser();
  const { password } = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      {password === "changed" ? (
        <FormAlert kind="notice">Your password has been changed.</FormAlert>
      ) : null}
      <h1 className="font-paper text-display font-semibold">Welcome, {user.name}</h1>
      <p className="max-w-prose text-ink-2">
        Start from a template: the built-in ones follow the PCI 2026 and KSV patterns. Make a copy
        to change one. Papers come in the next update.
      </p>
      <div>
        <Link href="/templates" className={buttonStyles.primary}>
          Open the template library
        </Link>
      </div>
    </div>
  );
}
