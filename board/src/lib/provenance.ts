// Provenance graph builder (v0.11): the pure data layer behind the Results
// view's script→artifact flow diagram. One node per unique producing script
// (plus a ghost node for artifacts with no known producer), one node per
// artifact, edges script→artifact. All display decisions (thumbnails) reuse
// artifactDisplay so the diagram and the cards can never disagree.
import { artifactDisplay, resolveScriptSnapshot } from "./artifactDisplay";
import type { ResultsBundle } from "./types";

export const UNKNOWN_PRODUCER = "__unknown__";

export interface ScriptNode {
  key: string; // producedBy.script, or UNKNOWN_PRODUCER
  label: string; // basename, or "producer unknown"
  sourcePath: string | null; // repo path of the source script
  lang: string | null;
  lineCount: number | null; // from the snapshot when present
  snapshotPath: string | null; // exact payload path for the ScriptViewer
}

export interface ArtifactNode {
  id: string;
  title: string;
  kind: "figure" | "table" | "other";
  thumb: string | null; // asset url when the display mode is an image
  fullUrl: string | null; // same url — the lightbox target
  sourcePath: string; // repo path the snapshot was copied from
  tex: boolean;
  data: boolean;
}

export interface ProvenanceGraph {
  scriptNodes: ScriptNode[];
  artifactNodes: ArtifactNode[];
  edges: { from: string; to: string }[];
}

export function buildProvenanceGraph(bundle: ResultsBundle): ProvenanceGraph {
  const m = bundle.manifest;
  if (!m || !Array.isArray(m.artifacts) || m.artifacts.length === 0) {
    return { scriptNodes: [], artifactNodes: [], edges: [] };
  }

  const scriptNodes: ScriptNode[] = [];
  const byKey = new Map<string, ScriptNode>();
  const edges: { from: string; to: string }[] = [];
  const artifactNodes: ArtifactNode[] = [];

  const ensureScriptNode = (key: string): ScriptNode => {
    const existing = byKey.get(key);
    if (existing) return existing;
    let node: ScriptNode;
    if (key === UNKNOWN_PRODUCER) {
      node = {
        key,
        label: "producer unknown",
        sourcePath: null,
        lang: null,
        lineCount: null,
        snapshotPath: null,
      };
    } else {
      const pb = m.artifacts.find((a) => a.producedBy?.script === key)!
        .producedBy!;
      const snapshot = resolveScriptSnapshot(pb, bundle.scripts);
      node = {
        key,
        label: key.split("/").pop() ?? key,
        sourcePath: pb.sourcePath ?? null,
        lang: pb.lang ?? null,
        lineCount: snapshot
          ? snapshot.content.replace(/\n$/, "").split("\n").length
          : null,
        snapshotPath: snapshot?.path ?? null,
      };
    }
    byKey.set(key, node);
    scriptNodes.push(node);
    return node;
  };

  for (const art of m.artifacts) {
    const key = art.producedBy?.script ?? UNKNOWN_PRODUCER;
    ensureScriptNode(key);
    edges.push({ from: key, to: art.id });
    const d = artifactDisplay(art, bundle.assets);
    const url =
      d.mode === "figure" || d.mode === "table-image" ? d.url : null;
    artifactNodes.push({
      id: art.id,
      title: art.title,
      kind: art.kind,
      thumb: url,
      fullUrl: url,
      sourcePath: art.source.path,
      tex: Boolean(art.tex),
      data: Boolean(art.data),
    });
  }

  return { scriptNodes, artifactNodes, edges };
}
