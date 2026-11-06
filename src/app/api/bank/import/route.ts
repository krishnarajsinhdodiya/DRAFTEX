// POST a CSV file (the raw file as the body) to the question bank import
// (WP-E, D80, D81). `?step=preview` checks every row and saves nothing;
// `?step=save` saves the valid rows; `?step=report` returns the rows that were
// not saved as a CSV. Each step reads the file again, so nothing waits on the
// server. Checks Origin itself (D19); the body is capped before it is read.
import { NextResponse, type NextRequest } from "next/server";
import { CSV_MAX_BYTES, CsvFileError } from "@/lib/bank/csv";
import { getData } from "@/lib/data";
import { bankImport } from "@/server/bank-import";
import { apiActor, jsonError, sameOrigin } from "@/server/http";

const STEPS = new Set(["preview", "save", "report"]);

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError(403, "This request did not come from DRAFTEX.");
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  const step = req.nextUrl.searchParams.get("step") ?? "";
  if (!STEPS.has(step)) return jsonError(400, "Unknown import step.");
  if (Number(req.headers.get("content-length") ?? 0) > CSV_MAX_BYTES) {
    return jsonError(413, "The file is larger than 1 MB. Split it into smaller files.");
  }
  const body = new Uint8Array(await req.arrayBuffer());
  const run = bankImport(await getData(), actor);
  try {
    if (step === "report") {
      return new NextResponse(await run.report(body), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="draftex-import-problems.csv"',
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (step === "save") return NextResponse.json(await run.save(body));
    return NextResponse.json(await run.preview(body));
  } catch (e) {
    if (e instanceof CsvFileError) return jsonError(422, e.message);
    throw e;
  }
}
