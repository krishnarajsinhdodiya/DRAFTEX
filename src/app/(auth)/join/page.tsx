import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { JoinForm } from "../forms";

export const metadata: Metadata = { title: "Create your account · DRAFTEX" };

export default async function JoinPage() {
  if (await getSession()) redirect("/");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <JoinForm />
    </>
  );
}
