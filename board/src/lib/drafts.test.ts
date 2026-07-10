import { describe, it, expect } from "vitest";
import type { Annotation } from "./types";
import {
  liveDraftKey,
  draftSuffixKey,
  loadDrafts,
  clearSubmitted,
  type StorageLike,
} from "./drafts";

function fakeStorage(): StorageLike & { dump(): Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

function ann(id: string): Annotation {
  return {
    id,
    type: "general",
    view: "tracker",
    comment: `c-${id}`,
    createdAt: "2026-07-10",
  } as unknown as Annotation;
}

const PID = "abc123";

describe("live draft storage", () => {
  it("fresh project loads empty", () => {
    const s = fakeStorage();
    expect(loadDrafts(s, PID, "proj", "hash1")).toEqual([]);
  });

  it("migrates legacy payload-hash drafts once, merging and deleting", () => {
    const s = fakeStorage();
    s.setItem("rp-board:proj:hash1", JSON.stringify([ann("a")]));
    s.setItem("rp-board:proj:hash1:seeded", JSON.stringify(["s1"]));
    s.setItem(liveDraftKey(PID), JSON.stringify([ann("b")]));
    s.setItem(draftSuffixKey(liveDraftKey(PID), "seeded"), JSON.stringify(["s2"]));

    const drafts = loadDrafts(s, PID, "proj", "hash1");
    expect(drafts.map((a) => a.id).sort()).toEqual(["a", "b"]);
    expect(s.getItem("rp-board:proj:hash1")).toBeNull();
    expect(s.getItem("rp-board:proj:hash1:seeded")).toBeNull();
    const seeded = JSON.parse(
      s.getItem(draftSuffixKey(liveDraftKey(PID), "seeded")) as string,
    ) as string[];
    expect(seeded.sort()).toEqual(["s1", "s2"]);
  });

  it("migration deduplicates by annotation id", () => {
    const s = fakeStorage();
    s.setItem("rp-board:proj:hash1", JSON.stringify([ann("a"), ann("b")]));
    s.setItem(liveDraftKey(PID), JSON.stringify([ann("b")]));
    const drafts = loadDrafts(s, PID, "proj", "hash1");
    expect(drafts.map((a) => a.id).sort()).toEqual(["a", "b"]);
  });

  it("clearSubmitted removes only the given ids", () => {
    const s = fakeStorage();
    s.setItem(liveDraftKey(PID), JSON.stringify([ann("a"), ann("b"), ann("c")]));
    clearSubmitted(s, PID, ["a", "c"]);
    const kept = JSON.parse(s.getItem(liveDraftKey(PID)) as string) as Annotation[];
    expect(kept.map((a) => a.id)).toEqual(["b"]);
  });

  it("clearSubmitted removes the key entirely when nothing survives", () => {
    const s = fakeStorage();
    s.setItem(liveDraftKey(PID), JSON.stringify([ann("a")]));
    clearSubmitted(s, PID, ["a"]);
    expect(s.getItem(liveDraftKey(PID))).toBeNull();
  });
});
