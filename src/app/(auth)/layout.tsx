import type { ReactNode } from "react";
import { appInfo } from "@/lib/app-info";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <p className="font-paper text-lead font-semibold tracking-[0.08em] text-ink">
        {appInfo.name}
      </p>
      {children}
    </main>
  );
}
