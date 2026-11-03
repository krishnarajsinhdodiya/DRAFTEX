import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth";
import { networkMode } from "@/server/cookie";
import { SetupForm } from "../forms";

export const metadata: Metadata = { title: "Set up · DRAFTEX" };

export default async function SetupPage() {
  if (!(await (await getAuth()).needsSetup())) redirect("/login");
  if (networkMode() !== "local") {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up DRAFTEX on its own computer
        </h1>
        <p className="text-neutral-700 dark:text-neutral-300">
          The first administrator can only be created on the computer that runs DRAFTEX, while it is
          in local mode. Open DRAFTEX there to finish setting it up.
        </p>
      </>
    );
  }
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to DRAFTEX</h1>
        <p className="text-neutral-700 dark:text-neutral-300">
          Create the administrator account. You can add colleagues afterwards.
        </p>
      </div>
      <SetupForm />
    </>
  );
}
