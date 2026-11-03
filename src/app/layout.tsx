import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// Every page depends on who is signed in, so nothing is prerendered at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DRAFTEX",
  description: "Build question papers and export them as PDF.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-white font-sans text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
