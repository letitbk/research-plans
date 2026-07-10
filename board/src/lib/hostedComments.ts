import type { Annotation, BoardData, StoredComment } from "./types";

export function newUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  let hex = "";
  for (let i = 0; i < 32; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const CLIENT_KEY = "rp-board:clientId";
export function getClientId(storage: Storage): string {
  let id = storage.getItem(CLIENT_KEY);
  if (!id) { id = newUuid(); storage.setItem(CLIENT_KEY, id); }
  return id;
}

function hashContent(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The content of the annotation's target document, if file-backed; else null. */
export function targetHash(data: BoardData, a: Annotation): string | null {
  const exec = (data as { exec?: Array<Record<string, unknown>> }).exec ?? [];
  const findComp = (c: string) => exec.find((g) => g.component === c);
  if (a.type === "plan-comment") {
    const g = findComp(a.component) as { versions?: Array<{ version: number; content: string }> } | undefined;
    const v = g?.versions?.find((x) => x.version === a.version);
    return v ? hashContent(v.content) : null;
  }
  if (a.type === "result-comment" || a.type === "script-comment") {
    // File-backed under the component's results; hash the component's results blob.
    const g = findComp(a.component) as { results?: unknown } | undefined;
    return g?.results ? hashContent(JSON.stringify(g.results)) : null;
  }
  // doc-comment (a derived view) and general: no single file — fall back to board hash.
  return null;
}

export function isStale(c: StoredComment, data: BoardData): boolean {
  if (c.docHash != null) return targetHash(data, c.annotation) !== c.docHash;
  return c.shareHash !== data.shareHash;
}

export function partitionComments(
  server: StoredComment[], data: BoardData,
): { live: StoredComment[]; stale: StoredComment[] } {
  const live: StoredComment[] = []; const stale: StoredComment[] = [];
  for (const c of server) (isStale(c, data) ? stale : live).push(c);
  return { live, stale };
}

export function applyPostResult(pending: Annotation[], id: string, ok: boolean): Annotation[] {
  return ok ? pending.filter((a) => a.id !== id) : pending;
}

export function buildCommentBody(a: Annotation, data: BoardData, author: string, clientId: string) {
  return {
    id: a.id && /^[0-9a-f-]{36}$/i.test(a.id) ? a.id : newUuid(),
    clientId, author, shareHash: (data as { shareHash?: string }).shareHash ?? "",
    docHash: targetHash(data, a),
    annotation: a,
  };
}
