# In-Board Artifact Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a text artifact (md/csv/tsv/txt/log/json/tex) on the board opens an in-board viewer modal instead of downloading, on all four board modes, with the live `/artifact/` route hardened against active-content navigation.

**Architecture:** Two new pure libs (`parseCsv`, `assetText`) feed a new `ViewerModal` component; `artifactDisplay` (the pure branch-decision lib) decides what is viewable and what anchor policy applies; `ArtifactCard` renders view buttons; `Results` owns the modal state. `Markdown` gains a link-scheme allowlist (fixes a pre-existing `javascript:` hole). `board.py`'s `/artifact/` route gets an explicit mime/disposition policy plus nosniff and CSP sandbox.

**Tech Stack:** React 18 + TypeScript (board/), vitest (+ `// @vitest-environment jsdom` and @testing-library/react for component tests), marked ^15, Python 3 stdlib http.server (board.py), pytest-style unittest (tests/test_board.py).

**Spec:** docs/specs/2026-07-12-artifact-viewer-design.md (revised per codex review docs/specs/2026-07-12-codex-review-artifact-viewer.md — read the Security notes and Server change sections before deviating from any policy below).

## Global Constraints

- No new npm or Python dependencies.
- Version-neutral branch: do NOT touch `.claude-plugin/plugin.json`, `board/package.json` version, or CHANGELOG version headers (add changes under a new `## [Unreleased]` heading in CHANGELOG.md in Task 9).
- Commit messages: conventional prefixes (`feat(board):`, `test(board):`, `feat(server):`), NO `Co-Authored-By` trailer.
- Board tests: `cd board && npm test`. Python tests: `python3 -m pytest tests/ -q` from repo root. Typecheck: `cd board && npx tsc --noEmit`.
- The board template must be rebuilt after component changes: `cd board && npm run build` (copies dist/index.html to skills/managing-research-plans/assets/board-template.html) — Task 9 only, not per-task.
- Security policies from the spec are load-bearing: the live server must never serve `.html`/`.svg`-navigable-as-document without sandbox, and Markdown must never emit non-allowlisted link schemes.

---

### Task 1: CSV parser + render caps (pure lib)

**Files:**
- Create: `board/src/lib/parseCsv.ts`
- Test: `board/src/lib/parseCsv.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseCsv(text: string, delim?: "," | "\t"): string[][]`, `capCsv(rows: string[][]): CappedCsv`, `interface CappedCsv { rows: string[][]; totalRows: number; totalCols: number; rowsTruncated: boolean; colsTruncated: boolean }`, constants `CSV_MAX_ROWS = 500`, `CSV_MAX_COLS = 200`, `CSV_MAX_CELLS = 50000`. Used by Task 5 (ViewerModal).

- [ ] **Step 1: Write the failing tests**

```ts
// board/src/lib/parseCsv.test.ts
import { describe, it, expect } from "vitest";
import { parseCsv, capCsv, CSV_MAX_ROWS, CSV_MAX_COLS } from "./parseCsv";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("handles CRLF and trailing newline without a phantom row", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("strips a leading BOM", () => {
    expect(parseCsv("﻿a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("handles quoted fields with embedded delimiters, quotes, newlines", () => {
    expect(parseCsv('a,"x,y"\n"he said ""hi""","l1\nl2"')).toEqual([
      ["a", "x,y"],
      ['he said "hi"', "l1\nl2"],
    ]);
  });
  it("tolerates an unterminated quote (rest of input becomes the field)", () => {
    expect(parseCsv('a,"unterminated\nrest')).toEqual([["a", "unterminated\nrest"]]);
  });
  it("keeps blank interior lines as single-empty-field rows", () => {
    expect(parseCsv("a\n\nb")).toEqual([["a"], [""], ["b"]]);
  });
  it("parses tsv with the tab delimiter", () => {
    expect(parseCsv("a\tb\n1\t2", "\t")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("returns [] for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("capCsv", () => {
  it("passes small tables through untruncated", () => {
    const c = capCsv([["a"], ["1"]]);
    expect(c).toEqual({
      rows: [["a"], ["1"]], totalRows: 2, totalCols: 1,
      rowsTruncated: false, colsTruncated: false,
    });
  });
  it("caps rows at exactly CSV_MAX_ROWS (500 in, not truncated; 501 in, truncated)", () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => [String(i)]);
    expect(capCsv(mk(CSV_MAX_ROWS)).rowsTruncated).toBe(false);
    const over = capCsv(mk(CSV_MAX_ROWS + 1));
    expect(over.rowsTruncated).toBe(true);
    expect(over.rows.length).toBe(CSV_MAX_ROWS);
    expect(over.totalRows).toBe(CSV_MAX_ROWS + 1);
  });
  it("caps columns and reports it", () => {
    const wide = [Array.from({ length: CSV_MAX_COLS + 5 }, (_, i) => String(i))];
    const c = capCsv(wide);
    expect(c.colsTruncated).toBe(true);
    expect(c.rows[0].length).toBe(CSV_MAX_COLS);
    expect(c.totalCols).toBe(CSV_MAX_COLS + 5);
  });
  it("caps total cells (one pathological wide table can't render 500 full rows)", () => {
    const rows = Array.from({ length: 500 }, () =>
      Array.from({ length: 200 }, () => "x"),
    ); // 100k cells > 50k cap
    const c = capCsv(rows);
    expect(c.rows.length).toBe(250); // 50000 / 200
    expect(c.rowsTruncated).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd board && npx vitest run src/lib/parseCsv.test.ts`
Expected: FAIL — cannot resolve `./parseCsv`.

- [ ] **Step 3: Write the implementation**

```ts
// board/src/lib/parseCsv.ts
// RFC-4180-ish CSV/TSV parsing for the artifact viewer (v0.15 follow-up):
// quoted fields, "" escapes, embedded delimiters/newlines, CRLF+LF, leading
// BOM stripped, trailing newline is not a row, an unterminated quote consumes
// the rest of the input. Render caps keep one pathological file from building
// an unbounded DOM (spec: 500 rows / 200 cols / 50k cells).

export const CSV_MAX_ROWS = 500;
export const CSV_MAX_COLS = 200;
export const CSV_MAX_CELLS = 50000;

export interface CappedCsv {
  rows: string[][];
  totalRows: number;
  totalCols: number;
  rowsTruncated: boolean;
  colsTruncated: boolean;
}

export function parseCsv(text: string, delim: "," | "\t" = ","): string[][] {
  let src = text;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const endField = () => { row.push(field); field = ""; };
  const endRow = () => { endField(); rows.push(row); row = []; };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { inQuotes = true; i++; continue; }
    if (c === delim) { endField(); i++; continue; }
    if (c === "\r") { if (src[i + 1] === "\n") i++; endRow(); i++; continue; }
    if (c === "\n") { endRow(); i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length > 0 || inQuotes) endRow();
  return rows;
}

export function capCsv(rows: string[][]): CappedCsv {
  const totalRows = rows.length;
  const totalCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const colsTruncated = totalCols > CSV_MAX_COLS;
  let out = rows
    .slice(0, CSV_MAX_ROWS)
    .map((r) => (r.length > CSV_MAX_COLS ? r.slice(0, CSV_MAX_COLS) : r));
  let rowsTruncated = totalRows > CSV_MAX_ROWS;
  const colsShown = Math.min(totalCols, CSV_MAX_COLS);
  if (colsShown > 0) {
    const maxRowsByCells = Math.floor(CSV_MAX_CELLS / colsShown);
    if (out.length > maxRowsByCells) {
      out = out.slice(0, maxRowsByCells);
      rowsTruncated = true;
    }
  }
  return { rows: out, totalRows, totalCols, rowsTruncated, colsTruncated };
}
```

Note the unterminated-quote case: when input ends while `inQuotes`, the final `endRow()` still fires (the `|| inQuotes` covers `'a,"'` where field is empty but a field was opened).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd board && npx vitest run src/lib/parseCsv.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add board/src/lib/parseCsv.ts board/src/lib/parseCsv.test.ts
git commit -m "feat(board): RFC-4180 CSV/TSV parser with render caps for the artifact viewer"
```

---

### Task 2: Asset text loader (pure lib)

**Files:**
- Create: `board/src/lib/assetText.ts`
- Test: `board/src/lib/assetText.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `loadAssetText(url: string, signal?: AbortSignal): Promise<string>`, `class AssetTextError extends Error { kind: "oversized" | "http" | "malformed" }`, `MAX_TEXT_BYTES = 2 * 1024 * 1024`. Used by Task 5 (ViewerModal).

- [ ] **Step 1: Write the failing tests**

```ts
// board/src/lib/assetText.test.ts
import { afterEach, describe, it, expect, vi } from "vitest";
import { loadAssetText, AssetTextError, MAX_TEXT_BYTES } from "./assetText";

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");

afterEach(() => vi.unstubAllGlobals());

describe("loadAssetText / data: URLs", () => {
  it("decodes base64 UTF-8 including non-ASCII", async () => {
    const url = `data:text/csv;base64,${b64("héllo,wörld\n1,2")}`;
    expect(await loadAssetText(url)).toBe("héllo,wörld\n1,2");
  });
  it("decodes invalid UTF-8 bytes to replacement chars instead of throwing", async () => {
    // 0xFF is never valid UTF-8
    const url = `data:text/plain;base64,${Buffer.from([0x61, 0xff, 0x62]).toString("base64")}`;
    expect(await loadAssetText(url)).toBe("a�b");
  });
  it("rejects non-base64 or malformed data URLs as malformed", async () => {
    await expect(loadAssetText("data:text/plain,plain%20text")).rejects.toMatchObject({ kind: "malformed" });
    await expect(loadAssetText(`data:text/plain;base64,@@not-base64@@`)).rejects.toMatchObject({ kind: "malformed" });
  });
  it("rejects oversized payloads BEFORE decoding (byte estimate from base64 length)", async () => {
    // fake base64 body longer than 2MB*4/3 — must reject without atob
    const url = "data:text/csv;base64," + "A".repeat(Math.ceil((MAX_TEXT_BYTES + 1024) * (4 / 3)));
    await expect(loadAssetText(url)).rejects.toMatchObject({ kind: "oversized" });
  });
  it("decodes empty base64 to empty string", async () => {
    expect(await loadAssetText("data:text/plain;base64,")).toBe("");
  });
});

describe("loadAssetText / fetch URLs", () => {
  it("returns text for ok responses and passes the signal through", async () => {
    let gotSignal: AbortSignal | null | undefined;
    vi.stubGlobal("fetch", (_u: string, init?: RequestInit) => {
      gotSignal = init?.signal;
      return Promise.resolve(new Response("hello", { status: 200 }));
    });
    const ctrl = new AbortController();
    expect(await loadAssetText("/artifact/x/r1/a.md", ctrl.signal)).toBe("hello");
    expect(gotSignal).toBe(ctrl.signal);
  });
  it("throws an http error for non-2xx instead of rendering the body", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("nope", { status: 404 })));
    await expect(loadAssetText("/artifact/x/r1/a.md")).rejects.toMatchObject({ kind: "http" });
  });
  it("rejects oversized responses via Content-Length before reading the body", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("x", {
        status: 200,
        headers: { "Content-Length": String(MAX_TEXT_BYTES + 1) },
      })),
    );
    await expect(loadAssetText("/artifact/x/r1/a.md")).rejects.toMatchObject({ kind: "oversized" });
  });
  it("errors are AssetTextError instances", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("nope", { status: 500 })));
    await expect(loadAssetText("/x")).rejects.toBeInstanceOf(AssetTextError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd board && npx vitest run src/lib/assetText.test.ts`
Expected: FAIL — cannot resolve `./assetText`.

- [ ] **Step 3: Write the implementation**

```ts
// board/src/lib/assetText.ts
// Text loading for the artifact viewer. Live boards fetch /artifact/ routes;
// static/remote/hosted boards embed artifacts as base64 data: URLs
// (board.py build_assets), decoded here without any network. Byte caps run
// BEFORE decoding (codex review: atob/text() must not process unbounded
// input); invalid UTF-8 decodes to replacement chars rather than throwing.

export const MAX_TEXT_BYTES = 2 * 1024 * 1024;

export class AssetTextError extends Error {
  kind: "oversized" | "http" | "malformed";
  constructor(kind: AssetTextError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

const DATA_URL_RE = /^data:[^,]*;base64,([A-Za-z0-9+/=]*)$/;

export async function loadAssetText(url: string, signal?: AbortSignal): Promise<string> {
  if (url.startsWith("data:")) {
    const m = DATA_URL_RE.exec(url);
    if (!m) throw new AssetTextError("malformed", "unsupported data: URL");
    const b64 = m[1];
    if (b64.length * 0.75 > MAX_TEXT_BYTES) {
      throw new AssetTextError("oversized", "artifact exceeds 2 MB");
    }
    let bin: string;
    try {
      bin = atob(b64);
    } catch {
      throw new AssetTextError("malformed", "invalid base64 payload");
    }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new AssetTextError("http", `HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len > MAX_TEXT_BYTES) throw new AssetTextError("oversized", "artifact exceeds 2 MB");
  const text = await res.text();
  if (new TextEncoder().encode(text).length > MAX_TEXT_BYTES) {
    throw new AssetTextError("oversized", "artifact exceeds 2 MB");
  }
  return text;
}
```

Note: the malformed test `data:text/plain;base64,@@not-base64@@` is rejected by the regex character class (no atob attempt needed); the try/catch stays as a backstop for padding errors.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd board && npx vitest run src/lib/assetText.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add board/src/lib/assetText.ts board/src/lib/assetText.test.ts
git commit -m "feat(board): asset text loader — data: decode + fetched routes, byte caps before decode"
```

---

### Task 3: Markdown link-scheme allowlist (pre-existing hole)

**Files:**
- Modify: `board/src/components/Markdown.tsx` (add `link` renderer inside `makeMarked`)
- Create: `board/src/components/Markdown.links.test.tsx`

**Interfaces:**
- Consumes: existing `makeMarked(assets?)` / `escapeAttr` in Markdown.tsx.
- Produces: no API change — `Markdown({ source, className, assets })` unchanged; only rendering policy changes. Every consumer (PlanReader, Reports, SafeTable md path, Task 5's ViewerModal) inherits the fix.

- [ ] **Step 1: Write the failing tests**

```tsx
// board/src/components/Markdown.links.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render } from "@testing-library/react";
import Markdown from "./Markdown";

afterEach(cleanup);

const html = (source: string) =>
  render(<Markdown source={source} />).container.innerHTML;

describe("Markdown link scheme allowlist", () => {
  it("renders https links as anchors with noopener noreferrer", () => {
    const out = html("[site](https://example.com)");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });
  it("renders mailto and fragment links", () => {
    expect(html("[m](mailto:a@b.c)")).toContain('href="mailto:a@b.c"');
    const frag = html("[top](#top)");
    expect(frag).toContain('href="#top"');
    expect(frag).not.toContain("target=");
  });
  it("drops javascript: links to plain text", () => {
    const out = html("[click](javascript:alert(1))");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("<a");
    expect(out).toContain("click");
  });
  it("drops data: and file: and relative links to plain text", () => {
    expect(html("[d](data:text/html,x)")).not.toContain("<a");
    expect(html("[f](file:///etc/passwd)")).not.toContain("<a");
    expect(html("[r](artifacts/table.csv)")).not.toContain("<a");
  });
  it("keeps inline formatting inside a dropped link", () => {
    expect(html("[**bold** claim](javascript:x)")).toContain("<strong>bold</strong>");
  });
  it("escapes quotes in allowed hrefs and titles", () => {
    const out = html('[t](https://e.com/?q=%22 "ti\\"tle")');
    expect(out).toContain("<a");
    expect(out).not.toMatch(/href="[^"]*" [a-z]+="[^=]*""/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd board && npx vitest run src/components/Markdown.links.test.tsx`
Expected: FAIL — `javascript:` link currently renders as `<a href="javascript:alert(1)">` (marked's default renderer).

- [ ] **Step 3: Implement the link renderer**

In `board/src/components/Markdown.tsx`, add near the top (after `escapeAttr`):

```ts
// Links: allowlist http/https/mailto/#fragment; javascript:, data:, file:,
// other schemes, and relative paths (which cannot resolve on the board)
// render as their inner text — the same "the board never follows a URL the
// payload didn't provide" contract images obey. Pre-existing hole: marked's
// default renderer emitted javascript: hrefs into dangerouslySetInnerHTML.
const SAFE_LINK_RE = /^(https?:|mailto:)/i;
```

Then inside `makeMarked`'s `renderer: { ... }` object, add a `link` method alongside `html` (NOT inside the `assets`-conditional spread — links are hardened whether or not assets exist):

```ts
      link(this: { parser: { parseInline(t: unknown): string } },
           { href, title, tokens }: { href: string; title?: string | null; tokens: unknown }) {
        const inner = this.parser.parseInline(tokens);
        if (href.startsWith("#")) {
          return `<a href="${escapeAttr(href)}"${title ? ` title="${escapeAttr(title)}"` : ""}>${inner}</a>`;
        }
        if (!SAFE_LINK_RE.test(href)) return inner;
        return `<a href="${escapeAttr(href)}"${
          title ? ` title="${escapeAttr(title)}"` : ""
        } target="_blank" rel="noopener noreferrer">${inner}</a>`;
      },
```

(marked ^15 renderer signature is `link({ href, title, tokens })`; `this.parser.parseInline` renders the inner inline tokens — same mechanism marked's own Renderer uses. If tsc complains about the token type, use `Tokens.Link` from `import type { Tokens } from "marked"`.)

- [ ] **Step 4: Run the new tests and the existing Markdown tests**

Run: `cd board && npx vitest run src/components/Markdown.links.test.tsx src/components/Markdown.test.tsx`
Expected: PASS. If an existing Markdown.test.tsx assertion covered default link rendering, update it to the new policy (allowed schemes gain `target`/`rel`; relative links become text) — that behavior change is the point of this task.

- [ ] **Step 5: Commit**

```bash
git add board/src/components/Markdown.tsx board/src/components/Markdown.links.test.tsx board/src/components/Markdown.test.tsx
git commit -m "fix(board): Markdown link-scheme allowlist — javascript:/data:/relative links render as text"
```

---

### Task 4: artifactDisplay view decisions + anchor policy (pure lib)

**Files:**
- Modify: `board/src/lib/artifactDisplay.ts`
- Modify: `board/src/lib/artifactDisplay.test.ts` (add cases)

**Interfaces:**
- Consumes: existing `ArtifactLink`, `ArtifactDisplay`, `links()`, `artifactDisplay()`.
- Produces (used by Tasks 5–7):
  - `type ViewKind = "md" | "csv" | "tsv" | "text"`
  - `interface ViewerRequest { url: string; kind: ViewKind; title: string; basename: string }`
  - `viewKind(f: string | null | undefined): ViewKind | null`
  - `inlineSafe(f: string | null | undefined): boolean`
  - `anchorProps(url: string, basename: string | null): { download?: string; target?: string; rel?: string }`
  - `ArtifactLink.view?: ViewKind`; card-mode result gains `view: ViewKind | null`.

- [ ] **Step 1: Write the failing tests** (append to `board/src/lib/artifactDisplay.test.ts`)

```ts
import { viewKind, inlineSafe, anchorProps } from "./artifactDisplay";

describe("viewKind", () => {
  it("maps extensions to viewer kinds", () => {
    expect(viewKind("artifacts/results.md")).toBe("md");
    expect(viewKind("T.CSV")).toBe("csv");
    expect(viewKind("t.tsv")).toBe("tsv");
    for (const f of ["a.txt", "a.log", "a.json", "a.tex"]) expect(viewKind(f)).toBe("text");
    expect(viewKind("fig.png")).toBeNull();
    expect(viewKind("page.html")).toBeNull();
    expect(viewKind("noext")).toBeNull();
    expect(viewKind(null)).toBeNull();
  });
});

describe("inlineSafe / anchorProps", () => {
  it("marks text, raster, svg, pdf as inline-safe; html/xlsx/unknown not", () => {
    for (const f of ["a.md", "a.csv", "a.png", "a.svg", "a.pdf"]) expect(inlineSafe(f)).toBe(true);
    for (const f of ["a.html", "a.xlsx", "a.xml", "noext", null]) expect(inlineSafe(f as string | null)).toBe(false);
  });
  it("live inline-safe URLs open in a new tab without download", () => {
    expect(anchorProps("/artifact/x/r1/a.pdf", "a.pdf")).toEqual({ target: "_blank", rel: "noopener" });
  });
  it("live active/unknown types keep the download attribute", () => {
    expect(anchorProps("/artifact/x/r1/p.html", "p.html")).toEqual({ download: "p.html" });
  });
  it("data: URLs always download (Chrome blocks top-level data: navigation)", () => {
    expect(anchorProps("data:text/csv;base64,QQ==", "t.csv")).toEqual({ download: "t.csv" });
  });
});

describe("view tagging", () => {
  it("card mode carries the main file's view kind", () => {
    const art = mkArt({ kind: "data", file: "artifacts/notes.md" });
    const d = artifactDisplay(art, { "notes.md": "/artifact/x/r1/notes.md" });
    expect(d).toMatchObject({ mode: "card", view: "md" });
  });
  it("links() tags .tex as text and data files by extension", () => {
    const art = mkArt({ kind: "table", file: "artifacts/t.png", tex: "artifacts/t.tex", data: "artifacts/t.csv" });
    const assets = { "t.png": "u1", "t.tex": "u2", "t.csv": "u3" };
    const d = artifactDisplay(art, assets);
    expect(d.mode).toBe("table-image");
    if (d.mode === "table-image") {
      expect(d.links.find((l) => l.label === ".tex")?.view).toBe("text");
      expect(d.links.find((l) => l.label.startsWith("data:"))?.view).toBe("csv");
    }
  });
});
```

If `artifactDisplay.test.ts` has no `mkArt` helper, add one at the top of the new describe blocks (match the existing test file's artifact-construction style — reuse its existing helper if one exists rather than duplicating):

```ts
import type { ResultArtifact } from "./types";
function mkArt(over: Partial<ResultArtifact> & { file: string }): ResultArtifact {
  return {
    id: "a1", kind: "data", title: "T", caption: "",
    tex: null, data: null, producedBy: null,
    source: { path: "o/" + over.file, sha256: "0".repeat(64), bytes: 1, oversized: false },
    ...over,
  } as ResultArtifact;
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd board && npx vitest run src/lib/artifactDisplay.test.ts`
Expected: FAIL — `viewKind` not exported.

- [ ] **Step 3: Implement** (in `board/src/lib/artifactDisplay.ts`)

Add after `IMAGE_EXTS`:

```ts
export type ViewKind = "md" | "csv" | "tsv" | "text";

/** What the viewer modal needs to open one artifact file. */
export interface ViewerRequest {
  url: string;
  kind: ViewKind;
  title: string;
  basename: string;
}

const VIEW_KINDS: Record<string, ViewKind> = {
  ".md": "md", ".csv": "csv", ".tsv": "tsv",
  ".txt": "text", ".log": "text", ".json": "text", ".tex": "text",
};

function ext(f: string | null | undefined): string {
  const l = (f ?? "").toLowerCase();
  const dot = l.lastIndexOf(".");
  return dot >= 0 ? l.slice(dot) : "";
}

export function viewKind(f: string | null | undefined): ViewKind | null {
  return VIEW_KINDS[ext(f)] ?? null;
}

// Mirrors board.py artifact_headers: types the live server serves inline.
// Active/unknown types (html, xml, xlsx, …) must keep the download attribute
// — never a same-origin navigation path for active content (codex blocker).
const INLINE_SAFE_EXTS = new Set([
  ...Object.keys(VIEW_KINDS),
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf",
]);

export function inlineSafe(f: string | null | undefined): boolean {
  return INLINE_SAFE_EXTS.has(ext(f));
}

export function anchorProps(
  url: string,
  basename: string | null,
): { download?: string; target?: string; rel?: string } {
  if (url.startsWith("data:") || !inlineSafe(basename)) {
    return { download: basename ?? "" };
  }
  return { target: "_blank", rel: "noopener" };
}
```

Change `ArtifactLink` and the card variant:

```ts
export interface ArtifactLink {
  label: string;
  url: string;
  download?: string;
  view?: ViewKind;
}
```

```ts
  | { mode: "card"; url: string | null; basename: string | null; links: ArtifactLink[]; view: ViewKind | null }
```

In `links()`, tag both links:

```ts
  if (tex) out.push({ label: ".tex", url: tex, download: art.tex!.split("/").pop(), view: "text" });
  const data = assetUrl(assets, art.data);
  if (data) {
    const base = art.data!.split("/").pop()!;
    out.push({ label: `data: ${base}`, url: data, download: base, view: viewKind(base) ?? undefined });
  }
```

In `artifactDisplay()`'s card branch:

```ts
    return {
      mode: "card",
      url,
      basename: art.file ? art.file.split("/").pop()! : null,
      links: l,
      view: viewKind(art.file),
    };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd board && npx vitest run src/lib/artifactDisplay.test.ts`
Expected: PASS (existing + new cases).

- [ ] **Step 5: Commit**

```bash
git add board/src/lib/artifactDisplay.ts board/src/lib/artifactDisplay.test.ts
git commit -m "feat(board): view-kind decisions and per-URL anchor policy in artifactDisplay"
```

---

### Task 5: ViewerModal component

**Files:**
- Create: `board/src/components/ViewerModal.tsx`
- Test: `board/src/components/ViewerModal.test.tsx`

**Interfaces:**
- Consumes: `loadAssetText`/`AssetTextError` (Task 2), `parseCsv`/`capCsv` (Task 1), `Markdown` (Task 3), `ViewerRequest` (Task 4).
- Produces: `default ViewerModal({ request, assets, onClose }: { request: ViewerRequest; assets: Record<string, string>; onClose: () => void })`. Used by Task 7 (Results).

- [ ] **Step 1: Write the failing tests**

```tsx
// board/src/components/ViewerModal.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ViewerModal from "./ViewerModal";
import type { ViewerRequest } from "../lib/artifactDisplay";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");
const req = (over: Partial<ViewerRequest>): ViewerRequest => ({
  url: "data:text/plain;base64," + b64("hello"),
  kind: "text", title: "Artifact", basename: "a.txt", ...over,
});
const noop = () => {};

describe("ViewerModal", () => {
  it("renders markdown through the Markdown component with assets resolved", async () => {
    const md = "# Heading\n\n![fig](artifacts/fig1.png)";
    render(
      <ViewerModal
        request={req({ url: "data:text/markdown;base64," + b64(md), kind: "md", basename: "r.md" })}
        assets={{ "fig1.png": "data:image/png;base64,AAAA" }}
        onClose={noop}
      />,
    );
    expect(await screen.findByText("Heading")).toBeTruthy();
    const img = document.querySelector("img");
    expect(img?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });
  it("renders csv as a table and shows truncation notices when capped", async () => {
    const rows = ["h1,h2", ...Array.from({ length: 501 }, (_, i) => `${i},x`)].join("\n");
    render(
      <ViewerModal
        request={req({ url: "data:text/csv;base64," + b64(rows), kind: "csv", basename: "t.csv" })}
        assets={{}}
        onClose={noop}
      />,
    );
    expect(await screen.findByText("h1")).toBeTruthy();
    expect(screen.getByText(/showing first 500 of 502 rows/)).toBeTruthy();
  });
  it("renders plain text in a pre", async () => {
    render(<ViewerModal request={req({})} assets={{}} onClose={noop} />);
    const pre = await screen.findByText("hello");
    expect(pre.closest("pre")).toBeTruthy();
  });
  it("shows the oversized fallback with the escape-hatch link", async () => {
    const url = "data:text/csv;base64," + "A".repeat(4 * 1024 * 1024);
    render(<ViewerModal request={req({ url, kind: "csv" })} assets={{}} onClose={noop} />);
    expect(await screen.findByText(/too large to display here/)).toBeTruthy();
  });
  it("shows an error state for failed fetches, not the body", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("secret", { status: 404 })));
    render(<ViewerModal request={req({ url: "/artifact/x/r1/a.txt" })} assets={{}} onClose={noop} />);
    expect(await screen.findByText(/could not load/i)).toBeTruthy();
    expect(screen.queryByText("secret")).toBeNull();
  });
  it("aborts the in-flight fetch on unmount", async () => {
    let captured: AbortSignal | undefined;
    vi.stubGlobal("fetch", (_u: string, init?: RequestInit) => {
      captured = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const { unmount } = render(
      <ViewerModal request={req({ url: "/artifact/x/r1/a.txt" })} assets={{}} onClose={noop} />,
    );
    unmount();
    expect(captured?.aborted).toBe(true);
  });
  it("closes on scrim click and ✕ but NOT on panel click; Escape closes", async () => {
    const onClose = vi.fn();
    render(<ViewerModal request={req({})} assets={{}} onClose={onClose} />);
    await screen.findByText("hello");
    fireEvent.click(screen.getByText("hello")); // inside panel
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog")); // scrim
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByLabelText("Close viewer"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
  it("live URLs get an open-raw footer link; data: URLs get download", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("x", { status: 200 })));
    const { unmount } = render(
      <ViewerModal request={req({ url: "/artifact/x/r1/a.txt" })} assets={{}} onClose={noop} />,
    );
    expect((await screen.findByText(/open raw/)).getAttribute("target")).toBe("_blank");
    unmount();
    render(<ViewerModal request={req({})} assets={{}} onClose={noop} />);
    expect((await screen.findByText("download")).hasAttribute("download")).toBe(true);
  });
  it("moves focus to the close button on open", async () => {
    render(<ViewerModal request={req({})} assets={{}} onClose={noop} />);
    await screen.findByText("hello");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close viewer");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd board && npx vitest run src/components/ViewerModal.test.tsx`
Expected: FAIL — cannot resolve `./ViewerModal`.

- [ ] **Step 3: Write the component**

```tsx
// board/src/components/ViewerModal.tsx
import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import { AssetTextError, loadAssetText } from "../lib/assetText";
import { capCsv, parseCsv } from "../lib/parseCsv";
import type { ViewerRequest } from "../lib/artifactDisplay";

type Phase =
  | { kind: "loading" }
  | { kind: "oversized" }
  | { kind: "error"; message: string }
  | { kind: "ready"; text: string };

/** In-board viewer for text artifacts (v0.15 follow-up): md renders through
 * the escape-all Markdown component (assets contract identical to Reports),
 * csv/tsv as a capped table, everything else in a pre. NOT part of the
 * AnnotationLayer (deliberate — commenting stays on the artifact card, same
 * as the image zoom modal). */
export default function ViewerModal({
  request,
  assets,
  onClose,
}: {
  request: ViewerRequest;
  assets: Record<string, string>;
  onClose: () => void;
}) {
  const { url, kind, title, basename } = request;
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setPhase({ kind: "loading" });
    const ctrl = new AbortController();
    let live = true; // request-identity guard: a stale resolution never paints
    loadAssetText(url, ctrl.signal)
      .then((text) => { if (live) setPhase({ kind: "ready", text }); })
      .catch((e: unknown) => {
        if (!live || ctrl.signal.aborted) return;
        if (e instanceof AssetTextError && e.kind === "oversized") {
          setPhase({ kind: "oversized" });
        } else {
          setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
        }
      });
    return () => { live = false; ctrl.abort(); };
  }, [url]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, [onClose]);

  const escapeHatch = url.startsWith("data:") ? (
    <a href={url} download={basename}
       className="text-xs font-medium text-blue-700 dark:text-blue-400 underline">
      download
    </a>
  ) : (
    <a href={url} target="_blank" rel="noopener"
       className="text-xs font-medium text-blue-700 dark:text-blue-400 underline">
      open raw ↗
    </a>
  );

  let body: React.ReactNode;
  if (phase.kind === "loading") {
    body = <div className="p-6 text-center text-xs text-stone-400">loading…</div>;
  } else if (phase.kind === "oversized") {
    body = (
      <div className="rounded border border-dashed border-stone-300 dark:border-stone-600 p-6 text-center text-xs text-stone-500">
        This file is too large to display here. {escapeHatch}
      </div>
    );
  } else if (phase.kind === "error") {
    body = (
      <div className="rounded border border-dashed border-stone-300 dark:border-stone-600 p-6 text-center text-xs text-stone-500">
        Could not load this file ({phase.message}). {escapeHatch}
      </div>
    );
  } else if (kind === "md") {
    body = <Markdown source={phase.text} assets={assets} />;
  } else if (kind === "csv" || kind === "tsv") {
    const capped = capCsv(parseCsv(phase.text, kind === "tsv" ? "\t" : ","));
    body = capped.rows.length === 0 ? (
      <div className="p-6 text-center text-xs text-stone-400">empty file</div>
    ) : (
      <>
        {(capped.rowsTruncated || capped.colsTruncated) && (
          <div className="mb-2 text-[11px] text-amber-700 dark:text-amber-400">
            {capped.rowsTruncated &&
              `showing first ${capped.rows.length} of ${capped.totalRows} rows`}
            {capped.rowsTruncated && capped.colsTruncated && " · "}
            {capped.colsTruncated &&
              `showing first ${capped.rows[0].length} of ${capped.totalCols} columns`}
          </div>
        )}
        <table className="border-collapse text-xs">
          <thead className="sticky top-0 bg-white dark:bg-stone-900">
            <tr>
              {capped.rows[0].map((c, i) => (
                <th key={i} className="border border-stone-200 dark:border-stone-700 px-2 py-1 text-left font-semibold text-stone-700 dark:text-stone-300">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {capped.rows.slice(1).map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} className="border border-stone-100 dark:border-stone-800 px-2 py-1 whitespace-nowrap text-stone-600 dark:text-stone-400">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  } else {
    body = (
      <pre className="whitespace-pre-wrap break-words text-xs text-stone-700 dark:text-stone-300">
        {phase.text}
      </pre>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Viewing: ${title}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col rounded-lg bg-white dark:bg-stone-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-stone-200 dark:border-stone-800 px-4 py-2">
          <span className="truncate text-sm font-semibold text-stone-800 dark:text-stone-200">{title}</span>
          <code className="rounded bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 text-[10px] text-stone-500">
            {basename}
          </code>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close viewer"
            className="ml-auto rounded px-2 py-0.5 text-sm text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            ✕
          </button>
        </div>
        <div className="overflow-auto px-4 py-3">{body}</div>
        <div className="border-t border-stone-200 dark:border-stone-800 px-4 py-2 text-right">
          {escapeHatch}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd board && npx vitest run src/components/ViewerModal.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add board/src/components/ViewerModal.tsx board/src/components/ViewerModal.test.tsx
git commit -m "feat(board): ViewerModal — md/csv/text artifact viewer with caps, error states, focus handling"
```

---

### Task 6: ArtifactCard view buttons + anchor policy

**Files:**
- Modify: `board/src/components/ArtifactCard.tsx`
- Create: `board/src/components/ArtifactCard.test.tsx`

**Interfaces:**
- Consumes: `anchorProps`, `ViewerRequest`, `ArtifactLink.view`, card-mode `view` (Task 4).
- Produces: new optional prop `onView?: (v: ViewerRequest) => void` on `ArtifactCard`. Used by Task 7.

- [ ] **Step 1: Write the failing tests**

```tsx
// board/src/components/ArtifactCard.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ArtifactCard from "./ArtifactCard";
import type { ResultArtifact, ResultsBundle } from "../lib/types";

afterEach(cleanup);

function art(over: Partial<ResultArtifact>): ResultArtifact {
  return {
    id: "a1", kind: "data", title: "T", caption: "", tex: null, data: null,
    file: "artifacts/notes.md", producedBy: null,
    source: { path: "o/x", sha256: "0".repeat(64), bytes: 1, oversized: false },
    ...over,
  } as ResultArtifact;
}
function bundle(assets: Record<string, string>): ResultsBundle {
  return { dir: "plans/execution/01-x/results/r1", resultsVersion: 1, scripts: [], assets } as unknown as ResultsBundle;
}
const base = { openScript: null, setOpenScript: () => {} };

describe("ArtifactCard view/anchor policy", () => {
  it("renders a view button for viewable files when onView is provided", () => {
    const onView = vi.fn();
    render(
      <ArtifactCard {...base} art={art({})} onView={onView}
        bundle={bundle({ "notes.md": "/artifact/01-x/r1/notes.md" })} />,
    );
    fireEvent.click(screen.getByText("view notes.md"));
    expect(onView).toHaveBeenCalledWith({
      url: "/artifact/01-x/r1/notes.md", kind: "md", title: "T", basename: "notes.md",
    });
  });
  it("falls back to a download anchor without onView", () => {
    render(
      <ArtifactCard {...base} art={art({})}
        bundle={bundle({ "notes.md": "data:text/markdown;base64,QQ==" })} />,
    );
    const a = screen.getByText("open notes.md");
    expect(a.hasAttribute("download")).toBe(true);
  });
  it("live pdf: anchor without download, opens new tab", () => {
    render(
      <ArtifactCard {...base} art={art({ file: "artifacts/doc.pdf" })}
        bundle={bundle({ "doc.pdf": "/artifact/01-x/r1/doc.pdf" })} />,
    );
    const a = screen.getByText("open doc.pdf");
    expect(a.hasAttribute("download")).toBe(false);
    expect(a.getAttribute("target")).toBe("_blank");
  });
  it("live html: anchor KEEPS download (active content never navigates)", () => {
    render(
      <ArtifactCard {...base} art={art({ file: "artifacts/page.html" })}
        bundle={bundle({ "page.html": "/artifact/01-x/r1/page.html" })} />,
    );
    expect(screen.getByText("open page.html").hasAttribute("download")).toBe(true);
  });
  it("data-file link becomes a view button when viewable", () => {
    const onView = vi.fn();
    render(
      <ArtifactCard {...base} onView={onView}
        art={art({ kind: "table", file: "artifacts/t.png", data: "artifacts/t.csv" })}
        bundle={bundle({ "t.png": "/artifact/01-x/r1/t.png", "t.csv": "/artifact/01-x/r1/t.csv" })} />,
    );
    fireEvent.click(screen.getByText("data: t.csv"));
    expect(onView).toHaveBeenCalledWith({
      url: "/artifact/01-x/r1/t.csv", kind: "csv", title: "T", basename: "t.csv",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd board && npx vitest run src/components/ArtifactCard.test.tsx`
Expected: FAIL — no `onView` prop, no "view notes.md" button, `download` present on pdf.

- [ ] **Step 3: Implement**

In `board/src/components/ArtifactCard.tsx`:

1. Extend the import from `../lib/artifactDisplay`:

```ts
import {
  anchorProps,
  artifactDisplay,
  resolveScriptSnapshot,
  type ArtifactLink,
  type ViewerRequest,
} from "../lib/artifactDisplay";
```

2. Add the prop (after `onZoom`):

```ts
  onZoom?: (url: string, title: string) => void;
  onView?: (v: ViewerRequest) => void;
```

3. Replace `linksRow` with a version that renders view buttons for viewable links and applies `anchorProps` otherwise:

```tsx
  const linksRow = (links: ArtifactLink[]) =>
    links.length > 0 ? (
      <div className="mt-1.5 flex flex-wrap gap-3">
        {links.map((l) =>
          l.view && onView ? (
            <button
              key={l.label}
              onClick={() =>
                onView({
                  url: l.url,
                  kind: l.view!,
                  title: art.title,
                  basename: l.download ?? l.label,
                })
              }
              className="text-[11px] font-medium text-blue-700 dark:text-blue-400 underline"
            >
              {l.label}
            </button>
          ) : (
            <a
              key={l.label}
              href={l.url}
              {...anchorProps(l.url, l.download ?? null)}
              className="text-[11px] font-medium text-blue-700 dark:text-blue-400 underline"
            >
              {l.label}
            </a>
          ),
        )}
      </div>
    ) : null;
```

4. Replace the `card` branch's main link:

```tsx
      ) : d.mode === "card" ? (
        <>
          {d.url && d.view && onView ? (
            <button
              onClick={() =>
                onView({
                  url: d.url!,
                  kind: d.view!,
                  title: art.title,
                  basename: d.basename ?? "",
                })
              }
              className="text-xs font-medium text-blue-700 dark:text-blue-400 underline"
            >
              view {d.basename}
            </button>
          ) : d.url ? (
            <a
              href={d.url}
              {...anchorProps(d.url, d.basename)}
              className="text-xs font-medium text-blue-700 dark:text-blue-400 underline"
            >
              open {d.basename}
            </a>
          ) : null}
          {linksRow(d.links)}
        </>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd board && npx vitest run src/components/ArtifactCard.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add board/src/components/ArtifactCard.tsx board/src/components/ArtifactCard.test.tsx
git commit -m "feat(board): ArtifactCard view buttons + per-URL anchor policy (active types keep download)"
```

---

### Task 7: Results wiring

**Files:**
- Modify: `board/src/views/Results.tsx`
- Create: `board/src/views/Results.viewer.test.tsx`

**Interfaces:**
- Consumes: `ViewerModal` (Task 5), `ViewerRequest` (Task 4), `onView` prop (Task 6).
- Produces: end-user behavior — clicking "view x.csv" on either Evidence surface opens the modal with the current bundle's assets.

- [ ] **Step 1: Write the failing test**

```tsx
// board/src/views/Results.viewer.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Results from "./Results";
import type { BoardData } from "../lib/types";

afterEach(cleanup);

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");

// Mirror Results.lean.test.tsx's fixture, with a csv table artifact whose
// bytes live in the bundle assets as a data: URL (static-mode shape).
function csvData(): BoardData {
  return {
    schemaVersion: 1, generatedAt: "2026-07-12T00:00", mode: "static",
    focus: null, project: { name: "p" }, git: { available: false },
    files: {
      masterPlan: { path: "plans/master-plan.md", content: "# MP" },
      decisionLog: { path: "plans/decision-log.md", content: "# DL" },
      executionPlans: [{
        component: "01-x",
        versions: [{ version: 1, path: "plans/execution/01-x/v1.md", content: "# v1" }],
        results: [{
          resultsVersion: 1, dir: "plans/execution/01-x/results/r1",
          manifest: {
            schemaVersion: 1, component: "01-x", resultsVersion: 1, planVersion: 1,
            provenance: "planned", trigger: "initial", capturedAt: "2026-07-12 10:00",
            metrics: [{ label: "N", value: "10", statement: "Ten.", artifactIds: ["tab"] }],
            artifacts: [{
              id: "tab", kind: "table", title: "Table 1", caption: "",
              file: "artifacts/table.csv",
              source: { path: "o/table.csv", sha256: "0".repeat(64), bytes: 10, oversized: false },
              producedBy: null,
            }],
            validation: { status: "conforms", steps: [], criteria: [] },
          },
          manifestRaw: { path: "plans/execution/01-x/results/r1/manifest.json", content: "{}" },
          report: null, verdict: null, verdictRaw: null, scripts: [],
          assets: { "table.csv": "data:text/csv;base64," + b64("h1,h2\nv1,v2") },
          publishedReport: null, reportFormats: { pdf: false, docx: false },
        }],
      }],
      reviews: [],
    },
  } as BoardData;
}

describe("Results viewer wiring", () => {
  it("clicking a view button opens the modal and renders the csv", async () => {
    render(
      <Results data={csvData()} canAnnotate={false} canPost={false}
        annotations={[]} onAddAnnotation={() => {}} onPaintResult={() => {}}
        focusTarget={null} onFocusConsumed={() => {}} />,
    );
    fireEvent.click(screen.getByText("view table.csv"));
    expect(await screen.findByText("v2")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Close viewer"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

**Adjust the `<Results …/>` props to the component's actual signature** — copy the exact prop list from `renderLeanFixture()` in `board/src/views/Results.lean.test.tsx` (it renders the same component; the fixture above only changes the artifact/assets). Do not guess: open that file and mirror it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd board && npx vitest run src/views/Results.viewer.test.tsx`
Expected: FAIL — "view table.csv" not found (card still renders "open table.csv" anchor because Results passes no `onView`).

- [ ] **Step 3: Implement**

In `board/src/views/Results.tsx`:

1. Imports:

```ts
import ViewerModal from "../components/ViewerModal";
import type { ViewerRequest } from "../lib/artifactDisplay";
```

2. State beside `zoom` (near the existing `const [zoom, setZoom] = useState…`):

```ts
  const [viewer, setViewer] = useState<{ request: ViewerRequest; assets: Record<string, string> } | null>(null);
```

3. Clear on bundle switch — extend the existing `useEffect` that resets state on `bundle?.dir` change:

```ts
    setViewer(null);
```

4. Near `const onZoom = …` (inside the section where `bundle` is in scope), add:

```ts
          const onView = (v: ViewerRequest) =>
            setViewer({ request: v, assets: bundle.assets });
```

5. Pass `onView={onView}` to BOTH `<ArtifactCard` call sites (the Evidence grid in finding mode and the backward-compat gallery).

6. Render the modal next to the zoom modal (same nesting level, after the `{zoom && …}` block):

```tsx
        {viewer && (
          <ViewerModal
            request={viewer.request}
            assets={viewer.assets}
            onClose={() => setViewer(null)}
          />
        )}
```

- [ ] **Step 4: Run the new test and the whole board suite**

Run: `cd board && npx vitest run src/views/Results.viewer.test.tsx && npm test`
Expected: PASS; full suite stays green (Results.lean/summary tests unaffected — they never passed `onView`, and card anchors still render for them).

- [ ] **Step 5: Commit**

```bash
git add board/src/views/Results.tsx board/src/views/Results.viewer.test.tsx
git commit -m "feat(board): wire ViewerModal into Results — view buttons on both evidence surfaces"
```

---

### Task 8: board.py /artifact/ response policy

**Files:**
- Modify: `skills/managing-research-plans/scripts/board.py` (module-level helper + the `/artifact/` branch of `do_GET` in `serve()`)
- Modify: `tests/test_board.py` (new test class)

**Interfaces:**
- Consumes: existing `serve()` handler, `TEXT_INLINE_EXTS` region (module constants live near it), tests' `make_project`, `serve_in_thread`, `_wait_healthy`.
- Produces: `board.artifact_headers(name: str) -> tuple[str, str]` (mime, disposition). The TS mirror is Task 4's `inlineSafe` — if you change either whitelist, change both.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_board.py`)

```python
class TestArtifactHeaders(unittest.TestCase):
    def test_header_policy_by_extension(self):
        ah = board.artifact_headers
        self.assertEqual(ah("notes.md"), ("text/plain; charset=utf-8", "inline"))
        self.assertEqual(ah("T.CSV"), ("text/plain; charset=utf-8", "inline"))
        for name in ("a.tsv", "a.txt", "a.log", "a.json", "a.tex"):
            self.assertEqual(ah(name)[0], "text/plain; charset=utf-8")
        self.assertEqual(ah("fig1.png"), ("image/png", "inline"))
        self.assertEqual(ah("fig.svg"), ("image/svg+xml", "inline"))
        self.assertEqual(ah("doc.pdf"), ("application/pdf", "inline"))
        # active/unknown content must download — the board origin embeds the
        # per-boot mutation token (spec: codex blocker 1)
        self.assertEqual(
            ah("page.html"),
            ("application/octet-stream", 'attachment; filename="page.html"'))
        self.assertEqual(
            ah("data.xlsx"),
            ("application/octet-stream", 'attachment; filename="data.xlsx"'))
        self.assertEqual(
            ah("noext"),
            ("application/octet-stream", 'attachment; filename="noext"'))
        self.assertEqual(ah('we"ird.html')[1], 'attachment; filename="weird.html"')

    def test_live_artifact_responses_carry_policy_headers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            adir = root / "plans" / "execution" / "01-data-prep" / "results" / "r1" / "artifacts"
            (adir / "notes.md").write_text("# hi", encoding="utf-8")
            (adir / "page.html").write_text("<script>fetch('/')</script>", encoding="utf-8")
            url, _lock, _t = serve_in_thread(root)
            _wait_healthy(url)
            with urllib.request.urlopen(url + "/artifact/01-data-prep/r1/notes.md", timeout=5) as r:
                self.assertEqual(r.headers["Content-Type"], "text/plain; charset=utf-8")
                self.assertEqual(r.headers["Content-Disposition"], "inline")
                self.assertEqual(r.headers["X-Content-Type-Options"], "nosniff")
                self.assertEqual(r.headers["Content-Security-Policy"], "sandbox")
            with urllib.request.urlopen(url + "/artifact/01-data-prep/r1/page.html", timeout=5) as r:
                self.assertEqual(r.headers["Content-Type"], "application/octet-stream")
                self.assertEqual(r.headers["Content-Disposition"], 'attachment; filename="page.html"')
                self.assertEqual(r.headers["Content-Security-Policy"], "sandbox")
            with urllib.request.urlopen(url + "/artifact/01-data-prep/r1/fig1.png", timeout=5) as r:
                self.assertEqual(r.headers["Content-Type"], "image/png")
                self.assertEqual(r.headers["Content-Disposition"], "inline")
```

Mirror the teardown/lifecycle of the nearest existing `serve_in_thread` test in the same file (some tests rely on the serve timeout + daemon thread; copy exactly what they do rather than inventing shutdown logic).

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_board.py::TestArtifactHeaders -q`
Expected: FAIL — `board` has no attribute `artifact_headers`.

- [ ] **Step 3: Implement**

In `board.py`, next to `TEXT_INLINE_EXTS` (module level):

```python
TEXT_PLAIN_EXTS = {".md", ".csv", ".tsv", ".txt", ".log", ".json", ".tex"}
INLINE_MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp",
    ".svg": "image/svg+xml", ".pdf": "application/pdf",
}


def artifact_headers(name):
    """Live /artifact/ response policy: text renders as plain text, images and
    PDF keep their type, anything else (incl. .html/.xml — active content on
    the board origin, which embeds the per-boot mutation token) is forced to
    download. The serve() handler adds nosniff + CSP sandbox on top. The TS
    mirror is artifactDisplay.inlineSafe — keep the whitelists in sync."""
    ext = os.path.splitext(name)[1].lower()
    if ext in TEXT_PLAIN_EXTS:
        return "text/plain; charset=utf-8", "inline"
    if ext in INLINE_MIME:
        return INLINE_MIME[ext], "inline"
    return ("application/octet-stream",
            'attachment; filename="%s"' % name.replace('"', ""))
```

In the `serve()` handler's `/artifact/` branch, replace

```python
                data = f.read_bytes()
                mime = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
```

with

```python
                data = f.read_bytes()
                mime, dispo = artifact_headers(f.name)
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Disposition", dispo)
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Content-Security-Policy", "sandbox")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
```

Do NOT touch: `/report/` routes (their attachment disposition is deliberate), `build_assets` (data: URLs keep real mimes; the client decodes regardless), the gate-mode server, or `mimetypes` usage elsewhere.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_board.py::TestArtifactHeaders -q && python3 -m pytest tests/ -q`
Expected: new tests PASS; full suite stays green (existing `/artifact/` tests asserted bodies/amap, not headers — if one asserted the old Content-Type, update it to the new policy).

- [ ] **Step 5: Commit**

```bash
git add skills/managing-research-plans/scripts/board.py tests/test_board.py
git commit -m "feat(server): /artifact/ mime policy — text inline, active types download, nosniff + CSP sandbox"
```

---

### Task 9: Full verification + template rebuild + changelog

**Files:**
- Modify: `skills/managing-research-plans/assets/board-template.html` (generated by build)
- Modify: `CHANGELOG.md` (new `[Unreleased]` section)

- [ ] **Step 1: Typecheck + full suites**

Run: `cd board && npx tsc --noEmit && npm test` then `python3 -m pytest tests/ -q` (repo root).
Expected: tsc silent; board suite ≥ 171 + new tests, all pass; py suite ≥ 276 + new tests, all pass.

- [ ] **Step 2: Rebuild the template**

Run: `cd board && npm run build`
Expected: vite build succeeds and copies `dist/index.html` → `skills/managing-research-plans/assets/board-template.html`.

- [ ] **Step 3: Export smoke — the built template carries the viewer**

```bash
grep -c "open raw" skills/managing-research-plans/assets/board-template.html
```
Expected: ≥ 1 (the viewer's footer string survives minification as a literal).

- [ ] **Step 4: CHANGELOG entry**

Add at the top of `CHANGELOG.md` (below `# Changelog`):

```markdown
## [Unreleased]

### Added
- **In-board artifact viewer.** Clicking a text artifact (`.md`, `.csv`, `.tsv`, `.txt`, `.log`, `.json`, `.tex`) opens a viewer modal on the board — markdown rendered like the Reports tab (figures included), csv/tsv as a table, the rest as plain text — instead of downloading the file. Works on live, exported, and hosted boards.

### Fixed
- Markdown links now enforce a scheme allowlist (`javascript:`/`data:`/relative links render as plain text) — closes a script-injection path reachable from report bodies.
- The live `/artifact/` route serves text types inline and forces active content (`.html`, `.svg` documents, unknown types) to download, with `nosniff` and a sandboxing CSP — artifacts can no longer navigate same-origin with access to the board's action token.
```

- [ ] **Step 5: Commit**

```bash
git add skills/managing-research-plans/assets/board-template.html CHANGELOG.md
git commit -m "build(board): rebuild template with artifact viewer; changelog"
```

---

### Task 10: Real-browser smoke (live HTTP + exported file://)

No file changes — verification only, run before opening the PR. Use a synthetic project (`python3 scripts/new-walkthrough.py` or a tests-style `make_project` scratch dir) with an md, csv, html, and svg artifact in one bundle.

- [ ] **Step 1: Live board checks (Chrome via browser automation)**
  - "view results.md" opens the modal; a heading and an embedded figure render.
  - "view table.csv" renders the table; a >500-row file shows the truncation notice.
  - Footer "open raw ↗" opens a new tab showing plain text (not a download).
  - The `.html` artifact link still downloads (anchor has `download`; direct URL navigation downloads too).
  - An `.svg` figure still renders as an image (CSP sandbox on the response must not break `<img>` — this is the one browser-behavior inference the spec flags for verification).
  - Direct navigation to `/artifact/...svg` shows the image WITHOUT executing scripts (check console).
- [ ] **Step 2: Exported board check**
  - `board.py --export`, open the single file via `file://` in Chrome: view buttons work (data: decode path), download footer works.
- [ ] **Step 3: Record results** in the PR body (pass/fail per check).

---

## Execution notes

- Work in a worktree branch off `main@6f647ba` (post-v0.15.0). Branch name: `worktree-artifact-viewer`.
- Tasks 1–4 are independent of each other except Task 4's `ViewerRequest` (used by 5–7); Tasks 5→6→7 are ordered; Task 8 is independent of all TS tasks; 9–10 last.
- Commit spec + codex review + this plan as the branch's first commit.
