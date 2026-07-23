import { describe, it, expect } from "vitest";
import { migrateLegacyStorage, type MigratableStorage } from "./storageMigration";

function fakeStorage(init: Record<string, string> = {}): MigratableStorage & {
  dump(): Record<string, string>;
} {
  const m = new Map<string, string>(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => void m.set(k, v),
    get length() {
      return m.size;
    },
    key: (i) => Array.from(m.keys())[i] ?? null,
    dump: () => Object.fromEntries(m),
  };
}

describe("migrateLegacyStorage", () => {
  it("copies every rp-* prefix to pb-* while leaving the old keys", () => {
    const s = fakeStorage({
      "rp-board:theme": "dark",
      "rp-board:clientId": "cid",
      "rp-hosted:proj:https://x": "name",
      "rp-sidebar:proj": "collapsed",
      "rp-autoclose:proj": "off",
      "unrelated:key": "keep",
    });
    migrateLegacyStorage(s);
    const d = s.dump();
    expect(d["pb-board:theme"]).toBe("dark");
    expect(d["pb-board:clientId"]).toBe("cid");
    expect(d["pb-hosted:proj:https://x"]).toBe("name");
    expect(d["pb-sidebar:proj"]).toBe("collapsed");
    expect(d["pb-autoclose:proj"]).toBe("off");
    expect(d["rp-board:theme"]).toBe("dark"); // old left in place
    expect(d["unrelated:key"]).toBe("keep"); // untouched
    expect("pb-unrelated:key" in d).toBe(false);
  });

  it("does not overwrite an existing newer pb-* value (copy-if-absent)", () => {
    const s = fakeStorage({
      "rp-board:theme": "dark",
      "pb-board:theme": "light",
    });
    migrateLegacyStorage(s);
    expect(s.dump()["pb-board:theme"]).toBe("light"); // newer value wins
  });

  it("is a no-op with nothing to migrate", () => {
    const s = fakeStorage({ "pb-board:theme": "dark" });
    migrateLegacyStorage(s);
    expect(s.dump()).toEqual({ "pb-board:theme": "dark" });
  });
});
