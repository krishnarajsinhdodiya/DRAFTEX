// Measures the two SPEC §13 performance targets against a fresh throwaway copy
// of DRAFTEX, with invented accounts and questions only:
//   editor input latency < 50 ms: Chromium's Event Timing entries (key press
//     to the next painted frame) while typing into a question;
//   warm preview < 3 s: GET of the saved paper's PDF after each change (the
//     server compiles it; the 1.5 s debounce before it is by design).
// 1. node scripts/e2e-server.ts 3216        (fresh data folder, built app)
// 2. node scripts/measure-performance.ts http://127.0.0.1:3216
import { chromium, expect } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:3216";
const ADMIN = { name: "Perf Admin", email: "perf@example.test", password: "perf test password" };
const TEXT =
  "Describe the mechanism of action of an example drug and explain its main uses in two short paragraphs. ";

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  return { n: s.length, p50: at(0.5), p95: at(0.95), max: s.at(-1) ?? 0 };
}

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1366, height: 768 },
  reducedMotion: "reduce",
});
const page = await context.newPage();

await page.goto("/");
await page.getByLabel("Your name").fill(ADMIN.name);
await page.getByLabel("Email").fill(ADMIN.email);
await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
await page.getByLabel("Type the password again").fill(ADMIN.password);
await page.getByRole("button", { name: "Create administrator" }).click();
await page.getByRole("heading", { name: `Welcome, ${ADMIN.name}` }).waitFor();

await page.goto("/templates");
await page
  .getByRole("link", { name: /Theory · End-Semester · 4 credits/ })
  .first()
  .click();
await page.getByRole("img", { name: /page 1 of/ }).waitFor({ timeout: 300_000 });
await page.getByRole("button", { name: "New paper" }).click();
const dialog = page.getByRole("dialog", { name: "New paper" });
await dialog.getByLabel("Title", { exact: true }).fill("Performance Example Paper");
await dialog.getByRole("button", { name: "Create paper" }).click();
await page.waitForURL(/\/papers\/[0-9a-f-]{36}$/);
const paperId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
await page.getByRole("img", { name: /page 1 of/ }).waitFor({ timeout: 120_000 });

// Fill a few questions first so the paper is not trivially small.
const write = async (name: string, text: string) => {
  await page
    .getByRole("button", { name: new RegExp(`^(Write|Edit) ${name.replace(/[().]/g, "\\$&")}$`) })
    .click();
  await expect(page.getByRole("textbox", { name: `Text of ${name}` })).toBeFocused();
  await page.keyboard.type(text);
};
for (const q of ["Q.1(1)", "Q.1(2)", "Q.1(3)", "Q.2(1)"]) await write(q, "Example question text. ");
await page.getByRole("status").filter({ hasText: "All changes saved" }).waitFor({ timeout: 15_000 });

// Input latency: observe every key event's duration while typing.
await page.evaluate(() => {
  const w = window as unknown as { __dxEvents: number[] };
  w.__dxEvents = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.name === "keydown" || e.name === "keypress" || e.name === "keyup") {
        w.__dxEvents.push(e.duration);
      }
    }
    // durationThreshold 16 is the smallest Chromium allows; shorter events
    // are counted as 16 below, which only overstates latency.
  }).observe({ type: "event", buffered: false, durationThreshold: 16 } as PerformanceObserverInit);
});
await write("Q.3(1)", "");
await page.keyboard.type(TEXT.repeat(2), { delay: 40 });
await page.waitForTimeout(500);
const slow = await page.evaluate(() => (window as unknown as { __dxEvents: number[] }).__dxEvents);
const keys = TEXT.length * 2 * 3;
const latency = stats([...slow, ...Array<number>(Math.max(0, keys - slow.length)).fill(16)]);

// Warm preview: change the paper, wait for the save, then time the compile.
const times: number[] = [];
for (let i = 0; i < 5; i++) {
  await page.keyboard.type(` change ${i}.`);
  await page
    .getByRole("status")
    .filter({ hasText: "All changes saved" })
    .waitFor({ timeout: 15_000 });
  const ms = await page.evaluate(async (id) => {
    const t = performance.now();
    const r = await fetch(`/api/papers/${id}/preview`);
    await r.arrayBuffer();
    if (!r.ok) throw new Error(`preview ${r.status}`);
    return performance.now() - t;
  }, paperId);
  times.push(Math.round(ms));
}

console.log(
  JSON.stringify(
    {
      inputLatencyMs: { ...latency, eventsOver16ms: slow.length },
      warmPreviewMs: { ...stats(times), samples: times },
    },
    null,
    2,
  ),
);
await browser.close();
