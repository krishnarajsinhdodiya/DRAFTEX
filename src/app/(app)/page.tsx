import { FormAlert } from "@/components/form";
import { requireUser } from "@/server/auth";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>;
}) {
  const { user } = await requireUser();
  const { password } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      {password === "changed" ? (
        <FormAlert kind="notice">Your password has been changed.</FormAlert>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
      <p className="max-w-prose text-neutral-700 dark:text-neutral-300">
        Your templates and papers will appear here.
      </p>
    </div>
  );
}
