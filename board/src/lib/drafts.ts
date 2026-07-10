// Live-board draft persistence (control surface). The live board stores
// pending annotations under a STABLE per-project key — the server's projectId
// — so a relaunch with changed payload never orphans unsent drafts. Legacy
// `${projectName}:${payloadHash}` keys migrate in once, then disappear.
// Remote and hosted boards keep their own schemes untouched.

import type { Annotation } from "./types";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function liveDraftKey(projectId: string): string {
  return `rp-board:${projectId}:live`;
}

export function draftSuffixKey(base: string, suffix: "reviewer" | "seeded"): string {
  return `${base}:${suffix}`;
}

function readList(storage: StorageLike, key: string): Annotation[] {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as Annotation[]) : [];
  } catch {
    return [];
  }
}

/** Load live drafts, merging any legacy payload-hash-keyed drafts (and their
 * seeded-ingest set) into the stable key exactly once. */
export function loadDrafts(
  storage: StorageLike,
  projectId: string,
  legacyProject: string,
  legacyHash: string,
): Annotation[] {
  const liveKey = liveDraftKey(projectId);
  const legacyKey = `rp-board:${legacyProject}:${legacyHash}`;
  const current = readList(storage, liveKey);
  const legacy = readList(storage, legacyKey);
  if (legacy.length === 0 && storage.getItem(legacyKey) === null) {
    return current;
  }
  const seen = new Set(current.map((a) => a.id));
  const merged = current.concat(legacy.filter((a) => !seen.has(a.id)));
  try {
    storage.setItem(liveKey, JSON.stringify(merged));
    const legacySeeded = storage.getItem(draftSuffixKey(legacyKey, "seeded"));
    if (legacySeeded) {
      const liveSeededKey = draftSuffixKey(liveKey, "seeded");
      const union = new Set<string>([
        ...(JSON.parse(storage.getItem(liveSeededKey) ?? "[]") as string[]),
        ...(JSON.parse(legacySeeded) as string[]),
      ]);
      storage.setItem(liveSeededKey, JSON.stringify([...union]));
    }
    storage.removeItem(legacyKey);
    storage.removeItem(draftSuffixKey(legacyKey, "seeded"));
  } catch {
    // storage unavailable — merged result still returned for this session
  }
  return merged;
}

/** Remove ONLY the submitted annotation ids; unsubmitted drafts survive. */
export function clearSubmitted(
  storage: StorageLike,
  projectId: string,
  ids: string[],
): void {
  const key = liveDraftKey(projectId);
  const gone = new Set(ids);
  const kept = readList(storage, key).filter((a) => !gone.has(a.id));
  try {
    if (kept.length === 0) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, JSON.stringify(kept));
    }
  } catch {
    // storage unavailable — nothing to clear
  }
}
