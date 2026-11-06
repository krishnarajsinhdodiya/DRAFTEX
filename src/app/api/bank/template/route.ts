// GET the CSV template for the question bank import (D79): the headings and
// two invented example rows, UTF-8 with BOM so Excel reads it correctly.
import { NextResponse } from "next/server";
import { csvTemplate } from "@/lib/bank/csv";
import { apiActor } from "@/server/http";

export async function GET() {
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  return new NextResponse(csvTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="draftex-question-bank-template.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
