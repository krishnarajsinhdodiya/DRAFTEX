// POST a picture (multipart field "file") → the stored image the editor inserts.
import { NextResponse, type NextRequest } from "next/server";
import { getData } from "@/lib/data";
import { dataPaths, getDataDir } from "@/lib/paths";
import { apiActor, jsonError, sameOrigin } from "@/server/http";
import { MAX_UPLOAD_BYTES, UploadError } from "@/server/uploads/process";
import { storeUpload } from "@/server/uploads/store";
import { engineAcceptsPdf } from "@/server/uploads/verify-pdf";
import { getCompileService } from "@/server/compile";

/** Room for the multipart envelope around a 10 MB file. */
const MAX_BODY = MAX_UPLOAD_BYTES + 64 * 1024;

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError(403, "This request did not come from DRAFTEX.");
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY) {
    return jsonError(413, "The file is larger than 10 MB. Save it smaller and try again.");
  }
  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return jsonError(400, "The upload was not valid. Try again.");
  }
  if (!(file instanceof File)) return jsonError(400, "Choose a file to upload.");
  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonError(413, "The file is larger than 10 MB. Save it smaller and try again.");
  }
  try {
    const stored = await storeUpload(
      {
        data: await getData(),
        assetsDir: dataPaths(getDataDir()).assets,
        checkPdf: (userId, sha, bytes) => engineAcceptsPdf(getCompileService(), userId, sha, bytes),
      },
      actor,
      Buffer.from(await file.arrayBuffer()),
      file.name,
    );
    return NextResponse.json(stored, { status: 201 });
  } catch (e) {
    if (e instanceof UploadError) return jsonError(422, e.message);
    throw e;
  }
}
