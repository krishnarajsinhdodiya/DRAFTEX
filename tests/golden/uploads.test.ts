// Gate 3 for uploads: what the upload pipeline stores compiles with zero
// warnings, including a JPEG that arrived with EXIF resolution data and an
// ICC profile (xdvipdfmx warns on both, memory.md) and a tall SVG drawing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CompileService } from "@/lib/latex/compile";
import { goldenFailures } from "@/lib/latex/log";
import { serializePaper } from "@/lib/latex/serialize";
import type { BlockNode } from "@/lib/paper/schema";
import { processUpload } from "@/server/uploads/process";
import { realCompileService } from "../support/engine";
import { jpegWithMetadata, pdfWithPages, solid, svg } from "../support/images";
import { pciEndSem4CreditKsv } from "../fixtures/papers/templates";

let svc: CompileService;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dx-golden-uploads-"));
beforeAll(() => {
  svc = realCompileService();
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("uploaded images", () => {
  it("compile with zero warnings at any width", async () => {
    const inputs = [
      await jpegWithMetadata(1200, 800),
      await solid(2400, 300, "png").toBuffer(),
      svg('<rect width="96" height="960" fill="#333"/>', 'width="96" height="960"'),
      pdfWithPages(1, 300, 150),
    ];
    const images = await Promise.all(inputs.map((b) => processUpload(b)));
    const content: BlockNode[] = images.map((img, i) => {
      fs.writeFileSync(path.join(dir, `${img.sha256}.${img.ext}`), img.bytes);
      return {
        type: "image",
        attrs: { sha256: img.sha256, ext: img.ext, widthPercent: [40, 100, 100, 60][i] as number },
      };
    });
    const ser = serializePaper({
      template: pciEndSem4CreditKsv,
      meta: {},
      emptySlots: "OMIT",
      slots: [{ groupKey: "g3", position: 1, content: { type: "doc", content } }],
    });
    if (!ser.ok) throw new Error(ser.issues.map((i) => i.message).join("\n"));
    const res = await svc.compile({
      userId: "golden",
      tex: ser.tex,
      assets: ser.assets.map((name) => ({
        name,
        sourcePath: path.join(dir, path.basename(name)),
      })),
    });
    expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(goldenFailures(res.diagnostics)).toEqual([]);
    expect(res.pdf?.length).toBeGreaterThan(0);
  });
});

describe("PDF upload check", () => {
  it("accepts a drawable PDF and refuses one the engine cannot embed", async () => {
    const { engineAcceptsPdf } = await import("@/server/uploads/verify-pdf");
    const good = await processUpload(pdfWithPages(1, 300, 150));
    expect(await engineAcceptsPdf(svc, "golden", good.sha256, good.bytes)).toBe(true);
    // pdf.js accepts a page with no content stream; xdvipdfmx does not.
    const empty = Buffer.from(
      pdfWithPages(1).toString("latin1").replace(" /Contents 3 0 R", ""),
      "latin1",
    );
    expect(await engineAcceptsPdf(svc, "golden", "0".repeat(64), empty)).toBe(false);
  });
});
