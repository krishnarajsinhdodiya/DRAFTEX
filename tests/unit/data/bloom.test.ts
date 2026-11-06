// Phase 10: each paper's own "Show Bloom level" (D64), elective CO tags on
// saved questions (D63), sub-part fields (D65) and the export warnings.
// Gate 8: nobody else, administrators included, can change the switch.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Actor, ConflictError, NotFoundError } from "@/lib/data";
import { PAPER_LOCKED } from "@/lib/data/papers";
import { exportWarnings } from "@/server/export";
import { createTestDb, type TestDb } from "../../support/db";
import { paperMeta, templateFields, testSlot } from "./fixtures";

let t: TestDb;
let me: Actor;
let other: Actor;
let admin: Actor;
let templateId: string;

async function user(email: string, role: "ADMIN" | "FACULTY"): Promise<Actor> {
  const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
  return { userId: u.id, role };
}

beforeAll(async () => {
  t = await createTestDb();
  me = await user("me@example.com", "FACULTY");
  other = await user("o@example.com", "FACULTY");
  admin = await user("a@example.com", "ADMIN");
  templateId = (await t.data.templates.create(me, templateFields("Bloom"))).id;
});
afterAll(async () => {
  await t.close();
});

const paper = () => t.data.papers.create(me, templateId, paperMeta());
const showBloom = async (id: string) =>
  (await t.data.papers.getWithSlots(me, id)).snapshot.style.showBloom;

describe("the paper's own Bloom switch (D64)", () => {
  it("starts from the template, and changes only this paper's snapshot", async () => {
    const a = await paper();
    const b = await paper();
    expect(await showBloom(a.id)).toBe(false);
    const saved = await t.data.papers.update(me, a.id, a.version, { showBloom: true });
    expect(saved.version).toBe(a.version + 1);
    expect(await showBloom(a.id)).toBe(true);
    expect(await showBloom(b.id)).toBe(false);
    const tpl = await t.data.templates.get(me, templateId);
    expect(tpl.style).toMatchObject({ showBloom: false });
  });

  it("copies the switch to duplicates such as ATKT copies", async () => {
    const a = await paper();
    await t.data.papers.update(me, a.id, a.version, { showBloom: true });
    const copy = await t.data.papers.duplicate(me, a.id, {
      title: "ATKT",
      examKind: "SUPPLEMENTARY_ATKT",
    });
    expect(await showBloom(copy.id)).toBe(true);
  });

  it("is locked while the paper is Final", async () => {
    const a = await paper();
    const final = await t.data.papers.update(me, a.id, a.version, { status: "FINAL" });
    await expect(
      t.data.papers.update(me, a.id, final.version, { showBloom: true }),
    ).rejects.toMatchObject({ message: PAPER_LOCKED });
    await expect(
      t.data.papers.update(me, a.id, final.version, { showBloom: true }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it.each([
    ["another faculty member", () => other],
    ["an administrator", () => admin],
  ])("is not found for %s", async (_l, who) => {
    const a = await paper();
    await expect(
      t.data.papers.update(who(), a.id, a.version, { showBloom: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await showBloom(a.id)).toBe(false);
  });
});

describe("questions with elective CO tags and sub-part fields", () => {
  it("saves BP607T.01 AEC1 and sub-part marks, CO and Bloom", async () => {
    const a = await paper();
    const content = {
      type: "doc" as const,
      content: [
        {
          type: "subParts" as const,
          content: [
            {
              type: "subPart" as const,
              attrs: { marks: 6, coTag: "BP607T.02 AEC1", bloom: "APPLY" as const },
              content: [
                { type: "paragraph" as const, content: [{ type: "text" as const, text: "a" }] },
              ],
            },
          ],
        },
      ],
    };
    const s = await t.data.papers.saveSlot(
      me,
      a.id,
      testSlot({ coTag: "BP607T.01 AEC1", bloomLevel: "UNDERSTAND", content }),
    );
    expect(s).toMatchObject({ coTag: "BP607T.01 AEC1", content });
  });

  it("refuses malformed tags on the question and on sub-parts", async () => {
    const a = await paper();
    await expect(
      t.data.papers.saveSlot(me, a.id, testSlot({ coTag: "BP1.01  X" })),
    ).rejects.toThrow();
    await expect(
      t.data.papers.saveSlot(
        me,
        a.id,
        testSlot({
          content: {
            type: "doc",
            content: [
              {
                type: "subParts",
                content: [
                  {
                    type: "subPart",
                    attrs: { bloom: "GUESS" as never },
                    content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
                  },
                ],
              },
            ],
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("export warnings", () => {
  it("name questions without Bloom or CO only while Bloom is shown, and odd sub-part marks always", async () => {
    const a = await paper();
    await t.data.papers.saveSlot(
      me,
      a.id,
      testSlot({ groupKey: "g2", position: 1, marks: 4, answerKey: null, keyCriteria: [] }),
    );
    const odd = {
      type: "doc" as const,
      content: [
        {
          type: "subParts" as const,
          content: [
            {
              type: "subPart" as const,
              attrs: { marks: 3 },
              content: [
                { type: "paragraph" as const, content: [{ type: "text" as const, text: "a" }] },
              ],
            },
          ],
        },
      ],
    };
    await t.data.papers.saveSlot(
      me,
      a.id,
      testSlot({
        groupKey: "g2",
        position: 2,
        marks: 4,
        bloomLevel: "APPLY",
        coTag: "X.01",
        content: odd,
      }),
    );
    const messages = async () =>
      exportWarnings(await t.data.papers.getWithSlots(me, a.id)).map((p) => p.message);
    const off = await messages();
    expect(off.filter((m) => /Bloom|CO tag/.test(m))).toEqual([]);
    expect(off).toContain("Q.2(2): The sub-part marks add up to 3, but the question is worth 4.");
    const fresh = await t.data.papers.getWithSlots(me, a.id);
    await t.data.papers.update(me, a.id, fresh.version, { showBloom: true });
    const on = await messages();
    expect(on).toContain("Q.2(1) has no Bloom level or CO tag.");
    expect(on.filter((m) => /^Q\.2\(2\) has no (Bloom|CO)/.test(m))).toEqual([]);
  });
});
