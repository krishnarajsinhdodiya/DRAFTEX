// D115: search and paging timings on 5,000 invented bank questions.
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Actor } from "@/lib/data";
import { createTestDb, type TestDb } from "../support/db";
import { seedBank } from "./seed-bank";

let t: TestDb;
let author: Actor;
let colleague: Actor;
let admin: Actor;

async function user(email: string, role: "ADMIN" | "FACULTY"): Promise<Actor> {
  const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
  return { userId: u.id, role };
}

async function time(label: string, fn: () => Promise<unknown>, n = 15) {
  await fn();
  const ms: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = performance.now();
    await fn();
    ms.push(performance.now() - s);
  }
  ms.sort((a, b) => a - b);
  const p = (q: number) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))]!.toFixed(1);
  console.log(
    `${label.padEnd(34)} p50 ${p(0.5)} ms  p95 ${p(0.95)} ms  max ${ms.at(-1)!.toFixed(1)} ms`,
  );
}

beforeAll(async () => {
  t = await createTestDb();
  admin = await user("admin@example.test", "ADMIN");
  author = await user("author@example.test", "FACULTY");
  colleague = await user("colleague@example.test", "FACULTY");
  await seedBank(
    t.db,
    { author: author.userId, colleague: colleague.userId },
    Number(process.env.SEED_COUNT ?? 5000),
  );
});
afterAll(() => t.close());

it("times the bank list, search and keyset paging (D115)", async () => {
  const count = async (actor: Actor) => {
    let n = 0;
    let page = await t.data.bank.list(actor, {});
    n += page.rows.length;
    while (page.older) {
      page = await t.data.bank.list(actor, { after: page.older });
      n += page.rows.length;
    }
    return n;
  };
  const visible = await count(author);
  console.log(`visible to author: ${visible}; to admin: ${await count(admin)}`);
  expect(visible).toBeGreaterThan(0);
  // The cursor of page 40, found once by walking.
  let page = await t.data.bank.list(author, {});
  for (let i = 1; i < 40 && page.older; i++) {
    page = await t.data.bank.list(author, { after: page.older });
  }
  const after40 = page.older ?? undefined;
  await time("list page 1", () => t.data.bank.list(author, {}));
  await time("list page 41", () => t.data.bank.list(author, { after: after40 }));
  await time("search 'paracetamol'", () => t.data.bank.list(author, { q: "paracetamol" }));
  await time("search 'butyl' (substring)", () => t.data.bank.list(author, { q: "butyl" }));
  await time("search 'of' (short word)", () => t.data.bank.list(author, { q: "of" }));
  await time("search no hit", () => t.data.bank.list(author, { q: "zzzzqq" }));
  await time("search + course + bloom", () =>
    t.data.bank.list(author, { q: "synthesis", course: "XX603T", bloom: "APPLY" }),
  );
  await time("colleague, two words", () => t.data.bank.list(colleague, { q: "stability tablets" }));
});
