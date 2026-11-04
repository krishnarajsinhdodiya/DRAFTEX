// SPEC §11.7: logs never contain question text. Next.js logs unexpected
// errors, so a database error must not repeat the values it was given.
import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../support/db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

it("database errors name the problem, not the data", async () => {
  const secret = "Invented confidential question text";
  const error = await t.db.user
    // @ts-expect-error -- deliberately invalid: email is missing, `bogus` does not exist
    .create({ data: { name: secret, passwordHash: secret, bogus: 1 } })
    .then(
      () => null,
      (e: unknown) => e as Error,
    );
  expect(error).toBeInstanceOf(Error);
  expect(error!.message).toBe("Invalid database query. Argument `email` is missing.");
  const dup = { name: "x", email: "dup@example.com", passwordHash: secret };
  await t.db.user.create({ data: dup });
  const unique = await t.db.user.create({ data: dup }).then(
    () => null,
    (e: unknown) => e as Error & { code?: string },
  );
  expect(unique!.code).toBe("P2002");
  expect(unique!.message).not.toContain(secret);
  expect(unique!.message).not.toContain("dup@example.com");
});
