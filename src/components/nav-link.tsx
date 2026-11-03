"use client";
// A main-navigation link that knows when its section is open.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const current = path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={
        "relative inline-flex h-14 items-center px-2.5 text-small font-medium text-ink-2 hover:text-ink " +
        "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent " +
        // The current section is underlined like a filled-in blank on a paper.
        "after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:bg-transparent " +
        "aria-[current=page]:text-ink aria-[current=page]:after:bg-ink"
      }
    >
      {children}
    </Link>
  );
}
