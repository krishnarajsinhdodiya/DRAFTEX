import fs from "node:fs";
import { it } from "vitest";
import { serializePaper } from "@/lib/latex/serialize";
import { realCompileService } from "../support/engine";
import { pciEndSem4CreditKsv } from "../fixtures/papers/templates";
it("debug lastpage", async () => {
  const svc = realCompileService();
  // A long paper with page numbers: 20 questions of long text.
  const long = "word ".repeat(400);
  const t = structuredClone(pciEndSem4CreditKsv);
  t.header.pageNumbers = "X_OF_Y";
  const ser = serializePaper({
    template: t,
    meta: {},
    emptySlots: "OMIT",
    slots: Array.from({ length: 20 }, (_, i) => ({
      groupKey: "g1",
      position: i + 1,
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: long }] }],
      },
    })),
  });
  if (!ser.ok) throw new Error("x");
  const r = await svc.compile({ userId: "d", tex: ser.tex });
  fs.writeFileSync("/tmp/dx/diag.json", JSON.stringify(r.diagnostics.map((d) => d.message)));
  fs.writeFileSync("/tmp/dx/log.txt", r.log);
}, 300000);
