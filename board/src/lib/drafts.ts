// Live-board draft persistence (control surface). The live board stores
// pending annotations under a STABLE per-project key — the server's projectId
// — so a relaunch with changed payload never orphans unsent drafts. Older keys
// migrate in once, then disappear: the pre-rename `rp-board:${projectId}:live`
// stable key and the oldest `rp-board:${projectName}:${payloadHash}` key.
// Remote and hosted boards keep their own schemes untouched.

import type { Annotation } from "./types";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function liveDraftKey(projectId: string): string {
  return `pb-board:${projectId}:live`;
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

/** Load live drafts, merging the two older generations into the stable pb-board
 * key exactly once: the pre-rename `rp-board:${projectId}:live` stable key and
 * the oldest `rp-board:${project}:${hash}` key. Annotations merge by id (the
 * current key wins on a collision), seeded-ingest sets union, and the old keys
 * are removed only after the destination writes succeed. */
export function loadDrafts(
  storage: StorageLike,
  projectId: string,
  legacyProject: string,
  legacyHash: string,
): Annotation[] {
  const liveKey = liveDraftKey(projectId);
  // Oldest first is irrelevant — the current key always wins by id; order only
  // decides which older generation supplies a given non-colliding annotation.
  const olderKeys = [
    `rp-board:${projectId}:live`,
    `rp-board:${legacyProject}:${legacyHash}`,
  ];
  const current = readList(storage, liveKey);
  const present = olderKeys.filter((k) => storage.getItem(k) !== null);
  if (present.length === 0) return current;
  const seen = new Set(current.map((a) => a.id));
  const merged = current.slice();
  for (const k of olderKeys) {
    for (const a of readList(storage, k)) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        merged.push(a);
      }
    }
  }
  try {
    storage.setItem(liveKey, JSON.stringify(merged));
    const liveSeededKey = draftSuffixKey(liveKey, "seeded");
    const union = new Set<string>(
      JSON.parse(storage.getItem(liveSeededKey) ?? "[]") as string[],
    );
    let sawSeeded = false;
    for (const k of olderKeys) {
      const seeded = storage.getItem(draftSuffixKey(k, "seeded"));
      if (seeded) {
        sawSeeded = true;
        for (const id of JSON.parse(seeded) as string[]) union.add(id);
      }
    }
    if (sawSeeded) storage.setItem(liveSeededKey, JSON.stringify([...union]));
    // Remove old keys ONLY after the destination writes above succeeded.
    for (const k of olderKeys) {
      storage.removeItem(k);
      storage.removeItem(draftSuffixKey(k, "seeded"));
    }
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
