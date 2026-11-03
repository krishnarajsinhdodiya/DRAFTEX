import type { ReactNode } from "react";
import type { PciStatus } from "@/lib/rules";

const TONE = {
  neutral:
    "bg-neutral-100 text-neutral-700 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700",
  blue: "bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-900",
  green:
    "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-900",
  amber:
    "bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
} as const;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof TONE;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function PciBadge({ status }: { status: PciStatus }) {
  if (status === "COMPLIANT") return <Badge tone="green">PCI 2026</Badge>;
  if (status === "NON_PCI") return <Badge tone="amber">Non-PCI</Badge>;
  return <Badge>No rule set</Badge>;
}
