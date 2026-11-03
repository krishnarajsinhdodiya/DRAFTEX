// Export bundle (SPEC §5, D32, D34): the paper and its key as files that
// compile on their own. Pure: no file system, no clock. The server writes
// the folder and zips it.
import type { KeySlot } from "../latex/key.ts";
import { TECTONIC_VERSION, BUNDLE_URL } from "../latex/pins.ts";
import type { PaperInput } from "../paper/schema.ts";

/**
 * Leaves out empty questions and the groups and parts left with none, and
 * numbers the rest from 1, so the printed paper has no gaps and its key
 * matches it question for question. The group's attempt and marks stay: the
 * paper's totals do not change because a question is missing.
 */
export function compactForExport(
  paper: PaperInput,
  keys: KeySlot[],
): {
  paper: PaperInput;
  keys: KeySlot[];
  leftOut: number;
  /** Compacted slot id ("g2.2") → the editor's ("g2.3"), for messages. */
  origin: Map<string, string>;
} {
  const filled = (s: PaperInput["slots"][number]) => s.content.content.length > 0;
  const moved = new Map<string, { groupKey: string; position: number }>();
  let leftOut = 0;
  const parts = paper.template.structure.parts
    .map((part) => ({
      ...part,
      groups: part.groups
        .map((g) => {
          const present = paper.slots
            .filter((s) => s.groupKey === g.key && s.position <= g.slots && filled(s))
            .sort((a, b) => a.position - b.position);
          leftOut += g.slots - present.length;
          present.forEach((s, i) =>
            moved.set(`${g.key}.${s.position}`, { groupKey: g.key, position: i + 1 }),
          );
          return { ...g, slots: present.length };
        })
        .filter((g) => g.slots > 0),
    }))
    .filter((part) => part.groups.length > 0);
  const place = (x: { groupKey: string; position: number }) =>
    moved.get(`${x.groupKey}.${x.position}`);
  return {
    paper: {
      ...paper,
      template: { ...paper.template, structure: { ...paper.template.structure, parts } },
      slots: paper.slots.flatMap((s) => {
        const to = place(s);
        return to ? [{ ...s, ...to }] : [];
      }),
      emptySlots: "OMIT",
    },
    keys: keys.flatMap((k) => {
      const to = place(k);
      return to ? [{ ...k, ...to }] : [];
    }),
    leftOut,
    origin: new Map(
      [...moved].map(([from, to]) => [`${to.groupKey}.${to.position}`, from] as const),
    ),
  };
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * A folder or file name every OS accepts: no characters Windows forbids, no
 * trailing dot or space, no reserved device names, at most `max` characters.
 */
export function safeName(s: string, fallback: string, max = 60): string {
  let out = s
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  out = [...out].slice(0, max).join("");
  out = out.replace(/[. ]+$/, "").trim();
  if (out === "" || /^-+$/.test(out)) return fallback;
  return RESERVED.test(out) ? `_${out}` : out;
}

/** 2026-11-04 in the computer's own time zone. */
export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** exports/<Program>/<CourseCode>/<YYYY-MM-DD> <title> (SPEC §5), as path segments. */
export function bundleSegments(p: {
  programLabel: string;
  courseCode: string;
  title: string;
  date: Date;
}): [string, string, string] {
  return [
    safeName(p.programLabel, "Program", 20),
    safeName(p.courseCode, "No course code", 30),
    `${localDate(p.date)} ${safeName(p.title, "Untitled paper")}`,
  ];
}

export function readme(p: { title: string; withKey: boolean; leftOut: number }): string {
  const lines = [
    `${p.title}`,
    "",
    "Made with DRAFTEX. This folder holds:",
    "  paper.pdf   the question paper",
    "  paper.tex   its LaTeX source",
    ...(p.withKey
      ? ["  key.pdf     the answer key (marking scheme)", "  key.tex     its LaTeX source"]
      : []),
    "  assets/     pictures used by the .tex files",
    "",
    ...(p.leftOut > 0
      ? [
          `${p.leftOut} empty question${p.leftOut === 1 ? " was" : "s were"} left out; the rest are numbered without gaps.`,
          "",
        ]
      : []),
    "CONFIDENTIAL: unreleased exam papers. Do not share this folder or keep it",
    "in a cloud-synced folder before the exam has been held.",
    "",
    "To typeset the .tex files again without DRAFTEX, run in this folder:",
    "  tectonic paper.tex",
    ...(p.withKey ? ["  tectonic key.tex"] : []),
    `DRAFTEX uses Tectonic ${TECTONIC_VERSION} with the bundle`,
    `  ${BUNDLE_URL}`,
    "The files also need the fix-cm package, which that bundle contains.",
    "",
  ];
  return lines.join("\n");
}
