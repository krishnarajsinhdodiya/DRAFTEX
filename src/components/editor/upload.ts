// Uploads a picture for a question (paper slot or bank question) through
// /api/assets; the server checks and re-encodes it (SPEC §11.5).
import type { Uploader } from "./question-editor";

export const upload: Uploader = async (file) => {
  const body = new FormData();
  body.set("file", file);
  let res: Response;
  try {
    res = await fetch("/api/assets", { method: "POST", body });
  } catch {
    throw new Error("DRAFTEX is not reachable, so the picture was not added.");
  }
  const json = (await res.json().catch(() => ({}))) as {
    message?: string;
    sha256?: string;
    ext?: "png" | "jpg" | "pdf";
    width?: number;
  };
  if (!res.ok || !json.sha256 || !json.ext) {
    throw new Error(json.message ?? "The picture could not be added.");
  }
  return { sha256: json.sha256, ext: json.ext, width: json.width ?? 600 };
};
