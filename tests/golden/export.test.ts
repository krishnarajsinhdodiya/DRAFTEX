// SPEC §13 Phase 6 exit check: the exported zip compiles standalone. The
// fixture paper and key are exported with the real engine, unzipped into an
// empty folder, and typeset there from nothing but the zip's files.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/data";
import { tectonicEngine } from "@/lib/latex/engine";
import { goldenFailures, parseDiagnostics } from "@/lib/latex/log";
import { binaryPath } from "@/lib/latex/tectonic";
import { dataPaths, getDataDir } from "@/lib/paths";
import { exportPaper } from "@/server/export";
import { imageResolver } from "@/server/images";
import { createTestDb, type TestDb } from "../support/db";
import { realCompileService } from "../support/engine";
import { paperMeta, templateFields } from "../unit/data/fixtures";
import { referenceKey } from "../fixtures/papers/keys";
import { ASSETS } from "../fixtures/papers/papers";

let t: TestDb;
let me: Actor;
let root: string;

beforeAll(async () => {
  t = await createTestDb();
  const u = await t.db.user.create({
    data: { name: "E", email: "e@example.com", passwordHash: "x", role: "FACULTY" },
  });
  me = { userId: u.id, role: "FACULTY" };
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dx-export-golden-"));
  fs.mkdirSync(path.join(root, "assets"));
  fs.copyFileSync(ASSETS.box.sourcePath, path.join(root, "assets", `${ASSETS.box.sha256}.pdf`));
  await t.data.assets.add(me, {
    sha256: ASSETS.box.sha256,
    mime: "application/pdf",
    bytes: fs.statSync(ASSETS.box.sourcePath).size,
    originalName: "box.pdf",
  });
});
afterAll(async () => {
  fs.rmSync(root, { recursive: true, force: true });
  await t.close();
});

describe("export bundle", () => {
  it("compiles standalone with zero warnings, paper and key", async () => {
    const f = referenceKey();
    const tpl = await t.data.templates.create(me, templateFields("Standalone"));
    const p = await t.data.papers.create(
      me,
      tpl.id,
      paperMeta({ courseCode: "BP104T", courseTitle: f.paper.meta.courseTitle ?? "" }),
    );
    const keyOf = new Map(f.keys.map((k) => [`${k.groupKey}.${k.position}`, k]));
    for (const s of f.paper.slots) {
      const k = keyOf.get(`${s.groupKey}.${s.position}`);
      await t.data.papers.saveSlot(me, p.id, {
        groupKey: s.groupKey,
        position: s.position,
        content: s.content,
        marks: s.marks ?? (s.groupKey === "g1" ? 1 : s.groupKey === "g2" ? 4 : 10),
        ...(s.coTag ? { coTag: s.coTag.replace(/[^A-Za-z0-9.]/g, "") } : {}),
        ...(k ? { answerKey: k.answerKey, keyCriteria: k.keyCriteria } : {}),
      });
    }
    const r = await exportPaper(
      {
        data: t.data,
        compile: realCompileService(),
        images: imageResolver({
          repoRoot: process.cwd(),
          assetsDir: path.join(root, "assets"),
          ownAsset: (owner, sha) =>
            t.data.assets.get({ userId: owner, role: "FACULTY" }, sha).catch(() => null),
        }),
        exportsDir: path.join(root, "exports"),
      },
      me,
      p.id,
      { confirmed: true },
    );
    if (!r.ok) throw new Error(`${r.message}\n${r.problems.map((x) => x.message).join("\n")}`);

    const out = fs.mkdtempSync(path.join(os.tmpdir(), "dx-unzipped-"));
    try {
      for (const [name, bytes] of Object.entries(unzipSync(r.zip))) {
        const file = path.join(out, ...name.split("/"));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, bytes);
      }
      const [folder] = fs.readdirSync(out);
      const work = path.join(out, folder as string);
      // The fixture template has no logo; the picture is in a question.
      expect(fs.readdirSync(path.join(work, "assets"))).toEqual([`${ASSETS.box.sha256}.pdf`]);
      const paths = dataPaths(getDataDir());
      const engine = tectonicEngine({
        binary: binaryPath(paths.tectonicDir),
        cacheDir: paths.tectonicCache,
      });
      for (const doc of ["paper", "key"]) {
        fs.rmSync(path.join(work, `${doc}.pdf`));
        const res = await engine({
          workDir: work,
          texFile: `${doc}.tex`,
          onlyCached: true,
          timeoutMs: 60_000,
        });
        const log = fs.readFileSync(path.join(work, `${doc}.log`), "utf8");
        const diags = parseDiagnostics(res.stderr, log);
        expect(res.exitCode, `${doc}: ${res.stderr}`).toBe(0);
        expect(diags.filter((d) => d.severity === "error")).toEqual([]);
        expect(goldenFailures(diags)).toEqual([]);
        expect(fs.statSync(path.join(work, `${doc}.pdf`)).size).toBeGreaterThan(1000);
      }
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});
