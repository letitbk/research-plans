import { describe, expect, it } from "vitest";
import { buildProvenanceGraph } from "./provenance";
import { resolveScriptSnapshot } from "./artifactDisplay";
import type { ResultsBundle } from "./types";

const SRC = { path: "output/x", sha256: "0".repeat(64), bytes: 10, oversized: false };

function bundle(over: Partial<ResultsBundle>): ResultsBundle {
  return {
    resultsVersion: 1,
    dir: "plans/execution/02-a/results/r1",
    manifest: null,
    manifestRaw: { path: "m", content: "{}" },
    report: null,
    verdict: null,
    verdictRaw: null,
    scripts: [],
    assets: {},
    ...over,
  } as ResultsBundle;
}

const MANIFEST = {
  schemaVersion: 1,
  component: "02-a",
  resultsVersion: 1,
  planVersion: 2,
  provenance: "planned" as const,
  trigger: "initial" as const,
  capturedAt: "2026-07-09 10:00",
  metrics: [],
  artifacts: [
    {
      id: "fig",
      kind: "figure" as const,
      title: "Figure 1",
      file: "artifacts/fig.png",
      source: { ...SRC, path: "output/fig.png" },
      producedBy: { script: "scripts/02_clean.R", sourcePath: "code/02_clean.R", lang: "r" },
    },
    {
      id: "tbl",
      kind: "table" as const,
      title: "Table 1",
      file: "artifacts/table1.png",
      tex: "artifacts/table1.tex",
      data: "artifacts/table1.csv",
      source: { ...SRC, path: "output/table1.png" },
      producedBy: { script: "scripts/02_clean.R", sourcePath: "code/02_clean.R", lang: "r" },
    },
    {
      id: "orphan",
      kind: "other" as const,
      title: "Mystery CSV",
      file: "artifacts/x.csv",
      source: { ...SRC, path: "output/x.csv" },
      producedBy: null,
    },
  ],
};

const SCRIPTS = [
  {
    path: "plans/execution/02-a/results/r1/scripts/02_clean.R",
    content: "line1\nline2\nline3\n",
  },
];

const ASSETS = {
  "fig.png": "url:fig",
  "table1.png": "url:tbl",
  "table1.tex": "url:tex",
  "table1.csv": "url:csv",
  "x.csv": "url:x",
};

describe("buildProvenanceGraph", () => {
  const b = bundle({ manifest: MANIFEST, scripts: SCRIPTS, assets: ASSETS });
  const g = buildProvenanceGraph(b);

  it("groups artifacts under one node per unique script", () => {
    expect(g.scriptNodes.map((n) => n.key)).toEqual([
      "scripts/02_clean.R",
      "__unknown__",
    ]);
    expect(g.edges).toEqual([
      { from: "scripts/02_clean.R", to: "fig" },
      { from: "scripts/02_clean.R", to: "tbl" },
      { from: "__unknown__", to: "orphan" },
    ]);
  });

  it("script nodes carry label, sourcePath, lang, line count, snapshot path", () => {
    const s = g.scriptNodes[0];
    expect(s.label).toBe("02_clean.R");
    expect(s.sourcePath).toBe("code/02_clean.R");
    expect(s.lang).toBe("r");
    expect(s.lineCount).toBe(3);
    expect(s.snapshotPath).toBe(
      "plans/execution/02-a/results/r1/scripts/02_clean.R",
    );
  });

  it("the ghost node has no snapshot and the unknown label", () => {
    const ghost = g.scriptNodes[1];
    expect(ghost.label).toBe("producer unknown");
    expect(ghost.snapshotPath).toBeNull();
    expect(ghost.lineCount).toBeNull();
  });

  it("artifact nodes carry thumbs for image displays and chips for tex/data", () => {
    const fig = g.artifactNodes.find((n) => n.id === "fig")!;
    expect(fig.thumb).toBe("url:fig");
    const tbl = g.artifactNodes.find((n) => n.id === "tbl")!;
    expect(tbl.thumb).toBe("url:tbl");
    expect(tbl.tex).toBe(true);
    expect(tbl.data).toBe(true);
    const orphan = g.artifactNodes.find((n) => n.id === "orphan")!;
    expect(orphan.thumb).toBeNull();
    expect(orphan.sourcePath).toBe("output/x.csv");
  });

  it("a missing snapshot yields snapshotPath null (node disabled)", () => {
    const noSnap = buildProvenanceGraph(
      bundle({ manifest: MANIFEST, scripts: [], assets: ASSETS }),
    );
    expect(noSnap.scriptNodes[0].snapshotPath).toBeNull();
  });

  it("no manifest → empty graph", () => {
    const empty = buildProvenanceGraph(bundle({}));
    expect(empty.scriptNodes).toEqual([]);
    expect(empty.artifactNodes).toEqual([]);
    expect(empty.edges).toEqual([]);
  });
});

describe("resolveScriptSnapshot", () => {
  it("suffix-matches and returns the exact payload file", () => {
    const f = resolveScriptSnapshot(
      { script: "scripts/02_clean.R", sourcePath: "code/02_clean.R" },
      SCRIPTS,
    );
    expect(f?.path).toBe("plans/execution/02-a/results/r1/scripts/02_clean.R");
    expect(resolveScriptSnapshot(null, SCRIPTS)).toBeNull();
    expect(
      resolveScriptSnapshot(
        { script: "scripts/other.R", sourcePath: "x" },
        SCRIPTS,
      ),
    ).toBeNull();
  });
});
