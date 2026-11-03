// Unsaved question drafts in the browser's IndexedDB (SPEC §8: "never lose
// text"). A draft is written on every change and removed once the server has
// confirmed the save. A tiny wrapper instead of a library (D27).
const DB_NAME = "draftex-drafts";
const STORE = "slots";

export interface Draft {
  /** `${paperId}:${groupKey}.${position}` */
  key: string;
  paperId: string;
  slotId: string;
  /** Stored-form content plus the slot fields being edited. */
  value: unknown;
  at: number;
}

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  opening ??= new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "key" });
      store.createIndex("paperId", "paperId");
    };
    req.onsuccess = () => resolve(req.result);
    // Private windows may refuse storage; the editor still saves to the server.
    req.onerror = () => resolve(null);
  });
  return opening;
}

async function tx<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

export const draftKey = (paperId: string, slotId: string) => `${paperId}:${slotId}`;

export function putDraft(paperId: string, slotId: string, value: unknown): Promise<unknown> {
  const d: Draft = { key: draftKey(paperId, slotId), paperId, slotId, value, at: Date.now() };
  return tx("readwrite", (s) => s.put(d));
}

export function dropDraft(paperId: string, slotId: string): Promise<unknown> {
  return tx("readwrite", (s) => s.delete(draftKey(paperId, slotId)));
}

export async function draftsFor(paperId: string): Promise<Draft[]> {
  return (await tx("readonly", (s) => s.index("paperId").getAll(paperId))) ?? [];
}
