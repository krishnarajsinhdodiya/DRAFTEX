import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serializePaper } from "@/lib/latex/serialize";
import { templateFieldsSchema } from "@/lib/data/templates";
import { checkTemplateFields } from "@/lib/templates/check";
import { BUILT_IN_LOGOS } from "@/lib/templates/logos";
import { previewPaper } from "@/lib/templates/preview";
import { BUILT_IN_TEMPLATES } from "@/lib/templates/seeds";
import { syncBuiltInTemplates } from "@/lib/data/templates";
import { createTestDb, type TestDb } from "../../support/db";

const parsed = BUILT_IN_TEMPLATES.map((s) => ({
  seedKey: s.seedKey,
  fields: templateFieldsSchema.parse(s),
}));
const byKey = (k: string) => parsed.find((p) => p.seedKey === k)?.fields;

describe("built-in templates", () => {
  it("are the SPEC §7 list, one per credit tier, with unique keys", () => {
    expect(parsed.map((p) => p.seedKey)).toEqual([
      "pci2026-bpharm-theory-endsem-4",
      "pci2026-bpharm-theory-endsem-3",
      "pci2026-bpharm-theory-endsem-2",
      "pci2026-bpharm-theory-sessional-4",
      "pci2026-bpharm-theory-sessional-3",
      "pci2026-bpharm-theory-sessional-2",
      "pci2026-bpharm-practical-sessional",
      "pci2026-bpharm-practical-endsem",
      "pci2026-bpharm-synopsis",
      "ksv-legacy-external-75",
      "ksv-pharmd-year-end-70",
      "blank",
    ]);
    expect(new Set(parsed.map((p) => p.fields.title)).size).toBe(parsed.length);
  });

  it.each(parsed)("$seedKey has no checker errors", ({ fields }) => {
    expect(checkTemplateFields(fields).errors).toEqual([]);
  });

  it("PCI seeds are compliant; the legacy seed is Non-PCI; the rest have no rule set", () => {
    const status = Object.fromEntries(
      parsed.map((p) => [p.seedKey, checkTemplateFields(p.fields).pci]),
    );
    for (const [k, s] of Object.entries(status)) {
      if (k.startsWith("pci2026-bpharm-") && k !== "pci2026-bpharm-synopsis")
        expect(s, k).toBe("COMPLIANT");
    }
    expect(status["ksv-legacy-external-75"]).toBe("NON_PCI");
    expect(status["pci2026-bpharm-synopsis"]).toBe("NO_RULE_SET");
    expect(status["ksv-pharmd-year-end-70"]).toBe("NO_RULE_SET");
    expect(status.blank).toBe("NO_RULE_SET");
  });

  it("the legacy seed explains why it is Non-PCI", () => {
    const legacy = byKey("ksv-legacy-external-75");
    expect(legacy).toBeDefined();
    const r = checkTemplateFields(legacy as NonNullable<typeof legacy>);
    expect(r.warnings.map((w) => w.code)).toContain("NO_CREDIT_PATTERN");
    for (const w of r.warnings) expect(w.page).toBeDefined();
  });

  it.each(parsed)("$seedKey serialises as an empty preview", ({ fields }) => {
    const ser = serializePaper(previewPaper(fields));
    expect(ser.ok ? [] : ser.issues).toEqual([]);
  });

  it("ships its logos, and the hashes match the files", () => {
    for (const logo of BUILT_IN_LOGOS) {
      const bytes = fs.readFileSync(path.resolve(logo.file));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(logo.sha256);
    }
    const used = new Set(parsed.map((p) => p.fields.header.logoLeft?.sha256).filter(Boolean));
    expect([...used].sort()).toEqual(BUILT_IN_LOGOS.map((l) => l.sha256).sort());
  });
});

describe("syncBuiltInTemplates", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.close();
  });

  it("waits for the first administrator", async () => {
    const r = await syncBuiltInTemplates(t.db, BUILT_IN_TEMPLATES);
    expect(r).toMatchObject({ created: 0, waitingForAdmin: true });
    expect(await t.db.template.count()).toBe(0);
  });

  it("adds every seed as a global built-in owned by the first admin, then leaves them alone", async () => {
    const first = await t.db.user.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", role: "ADMIN" },
    });
    await t.db.user.create({
      data: { name: "B", email: "b@example.com", passwordHash: "x", role: "ADMIN" },
    });
    expect(await syncBuiltInTemplates(t.db, BUILT_IN_TEMPLATES)).toMatchObject({
      created: BUILT_IN_TEMPLATES.length,
      updated: 0,
    });
    const rows = await t.db.template.findMany();
    expect(rows).toHaveLength(BUILT_IN_TEMPLATES.length);
    for (const r of rows) {
      expect(r).toMatchObject({ builtIn: true, visibility: "GLOBAL", ownerId: first.id });
    }
    expect(await syncBuiltInTemplates(t.db, BUILT_IN_TEMPLATES)).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: BUILT_IN_TEMPLATES.length,
    });
  });

  it("rewrites a changed seed in place and repairs a tampered row", async () => {
    const [first, ...rest] = BUILT_IN_TEMPLATES;
    const changed = [{ ...(first as (typeof BUILT_IN_TEMPLATES)[number]), description: "New" }];
    const before = await t.db.template.findUniqueOrThrow({ where: { seedKey: first?.seedKey } });
    expect(await syncBuiltInTemplates(t.db, [...changed, ...rest])).toMatchObject({ updated: 1 });
    const after = await t.db.template.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toMatchObject({ description: "New", version: before.version + 1 });

    await t.db.template.update({ where: { id: before.id }, data: { visibility: "PRIVATE" } });
    expect(await syncBuiltInTemplates(t.db, BUILT_IN_TEMPLATES)).toMatchObject({ updated: 1 });
    const repaired = await t.db.template.findUniqueOrThrow({ where: { id: before.id } });
    expect(repaired).toMatchObject({ visibility: "GLOBAL", description: first?.description });
  });

  it("refuses a seed the checker calls broken", async () => {
    const [first] = BUILT_IN_TEMPLATES;
    await expect(
      syncBuiltInTemplates(t.db, [
        { ...(first as (typeof BUILT_IN_TEMPLATES)[number]), maxMarks: 1 },
      ]),
    ).rejects.toMatchObject({ name: "InvalidTemplateError" });
  });
});
