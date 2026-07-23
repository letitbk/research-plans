// One-time, best-effort migration of pre-rename localStorage keys (rp-* -> pb-*)
// for the research-plans -> planboard rename. Runs once before React mounts so a
// returning visitor keeps their theme, client id, sidebar state, auto-close
// preference, and hosted drafts. Copy-if-absent: a newer pb-* value is never
// overwritten. Old keys are LEFT in place (harmless, and an older board build can
// still read them). The live-draft key is handled separately by loadDrafts, which
// merges by id — a naive copy there could drop unsent annotations.

const PREFIXES: [string, string][] = [
  ["rp-board:", "pb-board:"],
  ["rp-hosted:", "pb-hosted:"],
  ["rp-sidebar:", "pb-sidebar:"],
  ["rp-autoclose:", "pb-autoclose:"],
];

export type MigratableStorage = Pick<Storage, "getItem" | "setItem" | "length" | "key">;

export function migrateLegacyStorage(storage: MigratableStorage): void {
  let keys: string[];
  try {
    keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k !== null) keys.push(k); // snapshot: safe to add new keys while iterating
    }
  } catch {
    return;
  }
  for (const key of keys) {
    for (const [oldPrefix, newPrefix] of PREFIXES) {
      if (key.startsWith(oldPrefix)) {
        const newKey = newPrefix + key.slice(oldPrefix.length);
        try {
          if (storage.getItem(newKey) === null) {
            const value = storage.getItem(key);
            if (value !== null) storage.setItem(newKey, value);
          }
        } catch {
          // per-key failure (quota, etc.) is non-fatal — skip it
        }
        break;
      }
    }
  }
}
