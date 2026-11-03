import type { ReactNode } from "react";
import type { PciStatus } from "@/lib/rules";

const TONE = {
  neutral: "bg-sunk text-ink-2 ring-rule",
  blue: "bg-accent-soft text-accent ring-accent/25",
  green: "bg-positive-soft text-positive ring-positive/25",
  amber: "bg-caution-soft text-caution ring-caution/30",
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
      className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 text-caption font-medium whitespace-nowrap ring-1 ring-inset ${TONE[tone]}`}
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
