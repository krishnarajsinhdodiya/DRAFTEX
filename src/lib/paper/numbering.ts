// Question numbers as printed on the paper. One source for the serializer,
// the builder outline and the editor's messages ("Q.2(3)", "Q.6").
import type { Group, Structure } from "./schema.ts";

export interface GroupNumbers {
  key: string;
  numbering: NonNullable<Group["numbering"]>;
  /** "Q.2" for a group-numbered group; undefined when each question is numbered. */
  label?: string;
  /** Label of each question, by 1-based position: "Q.2(3)" or "Q.6". */
  slotLabels: string[];
  /** Printed number of each question inside the list: "3." or "Q.6". */
  printed: string[];
}

type NumberingInput = Pick<Structure, "numbering"> & {
  parts: { groups: Pick<Group, "key" | "slots" | "numbering">[] }[];
};

export function questionNumbers(structure: NumberingInput): GroupNumbers[] {
  const { prefix, separator } = structure.numbering;
  const q = (n: number) => `${prefix}${n}${separator}`;
  let n = 0;
  const out: GroupNumbers[] = [];
  for (const part of structure.parts) {
    for (const g of part.groups) {
      const positions = Array.from({ length: g.slots }, (_, i) => i + 1);
      if ((g.numbering ?? "GROUP") === "QUESTION") {
        const labels = positions.map((p) => q(n + p));
        n += g.slots;
        out.push({ key: g.key, numbering: "QUESTION", slotLabels: labels, printed: labels });
      } else {
        n += 1;
        const label = q(n);
        out.push({
          key: g.key,
          numbering: "GROUP",
          label,
          slotLabels: positions.map((p) => `${label}(${p})`),
          printed: positions.map((p) => `${p}.`),
        });
      }
    }
  }
  return out;
}
