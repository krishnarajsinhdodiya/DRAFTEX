// Spots folders that a cloud service keeps in sync. A live SQLite database
// in such a folder can be corrupted by the sync, and the service would upload
// unreleased papers (memory.md "Data dir outside repo"). Used by the install
// and move-data scripts to warn; nothing is refused.
// Imported by Node scripts under type stripping: relative imports only.
import path from "node:path";

export interface CloudDeps {
  platform: NodeJS.Platform;
  homedir: string;
  env: Record<string, string | undefined>;
}

const NAMED_FOLDERS: Array<[RegExp, string]> = [
  [/^onedrive( - .+)?$/i, "OneDrive"],
  [/^dropbox( \(.+\))?$/i, "Dropbox"],
  [/^google ?drive$/i, "Google Drive"],
  [/^my drive$/i, "Google Drive"],
  [/^icloud ?drive$/i, "iCloud Drive"],
  [/^box$/i, "Box"],
];

/** Name of the sync service that holds `dir`, or null when none is recognised. */
export function cloudSyncedFolder(dir: string, deps: CloudDeps): string | null {
  const p = deps.platform === "win32" ? path.win32 : path.posix;
  const target = p.resolve(dir);
  const fold = (s: string) => (deps.platform === "win32" ? s.toLowerCase() : s);
  const inside = (root: string | undefined): boolean => {
    if (!root) return false;
    const r = fold(p.resolve(root));
    const t = fold(target);
    return t === r || t.startsWith(r.endsWith(p.sep) ? r : r + p.sep);
  };

  if (deps.platform === "win32") {
    for (const key of ["OneDrive", "OneDriveCommercial", "OneDriveConsumer"]) {
      if (inside(deps.env[key])) return "OneDrive";
    }
  }
  if (deps.platform === "darwin") {
    if (inside(p.join(deps.homedir, "Library", "Mobile Documents"))) return "iCloud Drive";
    if (inside(p.join(deps.homedir, "Library", "CloudStorage"))) return "a cloud storage service";
  }
  for (const part of target.split(p.sep)) {
    for (const [pattern, name] of NAMED_FOLDERS) if (pattern.test(part)) return name;
  }
  return null;
}

/** A plain-English warning for `dir`, or null when it looks safe. */
export function cloudWarning(dir: string, what: string, deps: CloudDeps): string | null {
  const service = cloudSyncedFolder(dir, deps);
  if (!service) return null;
  return (
    `${what} "${dir}" seems to be kept in sync by ${service}. ` +
    "Syncing can damage the database while DRAFTEX runs, and it copies unreleased papers to the internet. " +
    "Choose a folder outside it."
  );
}
