import { describe, it, expect } from "vitest";
import {
  newUuid, getClientId, targetHash, isStale, partitionComments, applyPostResult, buildCommentBody,
} from "./hostedComments";
import type { BoardData, StoredComment, Annotation } from "./types";

function boardWith(planContent: string): BoardData {
  return {
    schemaVersion: 1, mode: "hosted", shareHash: "board-hash-1",
    project: { name: "proj" },
    exec: [{ component: "01-x", versions: [{ version: 1, content: planContent, path: "plans/execution/01-x/v1.md" }] }],
  } as unknown as BoardData;
}
const planComment = (): Annotation =>
  ({ id: "n1", type: "plan-comment", component: "01-x", version: 1,
     quote: "q", comment: "c" } as unknown as Annotation);
const stored = (over: Partial<StoredComment>): StoredComment =>
  ({ id: "s1", clientId: "cl1", author: "Ada", shareHash: "board-hash-1",
     docHash: null, annotation: planComment(), receivedAt: "t", ...over });

describe("ids", () => {
  it("newUuid is uuid-shaped and unique", () => {
    const a = newUuid(); const b = newUuid();
    expect(a).toMatch(/^[0-9a-f-]{36}$/i);
    expect(a).not.toBe(b);
  });
  it("getClientId persists across calls", () => {
    const mem: Record<string, string> = {};
    const storage = { getItem: (k: string) => mem[k] ?? null,
                      setItem: (k: string, v: string) => { mem[k] = v; } } as unknown as Storage;
    const id1 = getClientId(storage);
    const id2 = getClientId(storage);
    expect(id1).toBe(id2);
  });
});

describe("per-document staleness", () => {
  it("targetHash changes when the target plan content changes", () => {
    const h1 = targetHash(boardWith("original"), planComment());
    const h2 = targetHash(boardWith("edited"), planComment());
    expect(h1).not.toBe(h2);
    expect(h1).toBeTypeOf("string");
  });
  it("a comment on an unchanged doc is NOT stale", () => {
    const data = boardWith("original");
    const c = stored({ docHash: targetHash(data, planComment()) });
    expect(isStale(c, data)).toBe(false);
  });
  it("a comment on a CHANGED doc IS stale", () => {
    const c = stored({ docHash: targetHash(boardWith("original"), planComment()) });
    expect(isStale(c, boardWith("edited"))).toBe(true);
  });
  it("view/general comments (docHash null) fall back to whole-board shareHash", () => {
    const data = boardWith("x");
    const general = { ...stored({ docHash: null }),
      annotation: { id: "g", type: "general", view: "timeline", comment: "c" } as unknown as Annotation };
    expect(isStale({ ...general, shareHash: "board-hash-1" }, data)).toBe(false);
    expect(isStale({ ...general, shareHash: "OLD" }, data)).toBe(true);
  });
  it("partitionComments splits live vs stale", () => {
    const data = boardWith("original");
    const fresh = stored({ id: "fresh", docHash: targetHash(data, planComment()) });
    const old = stored({ id: "old", docHash: "STALE" });
    const { live, stale } = partitionComments([fresh, old], data);
    expect(live.map((c) => c.id)).toEqual(["fresh"]);
    expect(stale.map((c) => c.id)).toEqual(["old"]);
  });
});

describe("failed-post keeps pending", () => {
  it("removes on ok, keeps on failure", () => {
    const pending = [planComment(), { ...planComment(), id: "n2" }];
    expect(applyPostResult(pending, "n1", true).map((a) => a.id)).toEqual(["n2"]);
    expect(applyPostResult(pending, "n1", false).map((a) => a.id)).toEqual(["n1", "n2"]);
  });
});

describe("buildCommentBody", () => {
  it("carries id/clientId/author/shareHash/docHash and the annotation", () => {
    const data = boardWith("original");
    const body = buildCommentBody(planComment(), data, "Ada", "cl1") as Record<string, unknown>;
    expect(body.author).toBe("Ada");
    expect(body.clientId).toBe("cl1");
    expect(body.shareHash).toBe("board-hash-1");
    expect(typeof body.id).toBe("string");
    expect((body.annotation as Annotation).type).toBe("plan-comment");
  });
});
