// The card's whole branch decision, unit-tested without a DOM: a table's
// typeset render displays like a figure; CSVs (including legacy inlineText
// bundles) NEVER inline — they are click-to-open links.
import { describe, expect, it } from "vitest";
import { artifactDisplay } from "./artifactDisplay";
import type { ResultArtifact } from "./types";

const SRC = { path: "output/x", sha256: "0".repeat(64), bytes: 10, oversized: false };

function art(over: Partial<ResultArtifact>): ResultArtifact {
  return {
    id: "a",
    kind: "other",
    title: "A",
    file: null,
    source: { ...SRC },
    producedBy: null,
    ...over,
  } as ResultArtifact;
}

const ASSETS = {
  "table1.png": "url:png",
  "table1.tex": "url:tex",
  "table1.csv": "url:csv",
  "fig.svg": "url:svg",
  "t.html": "url:html",
  "t.md": "url:md",
};

describe("artifactDisplay", () => {
  it("table + png renders as an image (like a figure)", () => {
    const d = artifactDisplay(
      art({ kind: "table", file: "artifacts/table1.png" }),
      ASSETS,
    );
    expect(d).toMatchObject({ mode: "table-image", url: "url:png" });
  });

  it("table with only a CSV file is a card, never inline", () => {
    const d = artifactDisplay(
      art({ kind: "table", file: "artifacts/table1.csv" }),
      ASSETS,
    );
    expect(d.mode).toBe("card");
  });

  it("LEGACY table with csv inlineText is a card (no dump)", () => {
    const d = artifactDisplay(
      art({
        kind: "table",
        file: "artifacts/table1.csv",
        inlineText: "a,b\n1,2\n",
      }),
      ASSETS,
    );
    expect(d.mode).toBe("card");
  });

  it("html and md tables still inline (sanitized path)", () => {
    const h = artifactDisplay(
      art({ kind: "table", file: "artifacts/t.html", inlineText: "<table/>" }),
      ASSETS,
    );
    expect(h).toMatchObject({ mode: "table-inline", kind: "html" });
    const m = artifactDisplay(
      art({ kind: "table", file: "artifacts/t.md", inlineText: "| a |" }),
      ASSETS,
    );
    expect(m).toMatchObject({ mode: "table-inline", kind: "md" });
  });

  it("figure with a url renders as figure", () => {
    const d = artifactDisplay(art({ kind: "figure", file: "artifacts/fig.svg" }), ASSETS);
    expect(d).toMatchObject({ mode: "figure", url: "url:svg" });
  });

  it("oversized always wins", () => {
    const d = artifactDisplay(
      art({ kind: "figure", file: "artifacts/fig.svg", source: { ...SRC, oversized: true } }),
      ASSETS,
    );
    expect(d.mode).toBe("oversized");
  });

  it("tex and data attach as labeled links when present in assets", () => {
    const d = artifactDisplay(
      art({
        kind: "table",
        file: "artifacts/table1.png",
        tex: "artifacts/table1.tex",
        data: "artifacts/table1.csv",
      }),
      ASSETS,
    );
    expect(d.mode).toBe("table-image");
    if (d.mode === "table-image") {
      expect(d.links.map((l) => l.label)).toEqual([".tex", "data: table1.csv"]);
      expect(d.links[0].url).toBe("url:tex");
    }
  });

  it("tex/data absent from assets are silently omitted", () => {
    const d = artifactDisplay(
      art({ kind: "table", file: "artifacts/table1.png", tex: "artifacts/gone.tex" }),
      ASSETS,
    );
    if (d.mode === "table-image") expect(d.links).toEqual([]);
  });

  it("other kind with a url is a card; nothing at all is missing", () => {
    expect(
      artifactDisplay(art({ kind: "other", file: "artifacts/table1.csv" }), ASSETS).mode,
    ).toBe("card");
    expect(artifactDisplay(art({}), ASSETS).mode).toBe("missing");
  });
});
