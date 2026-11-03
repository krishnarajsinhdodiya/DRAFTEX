import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuth, getSession } from "@/server/auth";
import { SignInForm } from "../forms";

export const metadata: Metadata = { title: "Sign in · DRAFTEX" };

export default async function LoginPage() {
  if (await (await getAuth()).needsSetup()) redirect("/setup");
  if (await getSession()) redirect("/");
  return (
    <>
      <h1 className="font-paper text-display font-semibold">Sign in</h1>
      <SignInForm />
    </>
  );
}
