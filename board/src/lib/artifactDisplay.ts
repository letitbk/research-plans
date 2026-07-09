// The artifact card's branch decision, pure and unit-tested (v0.10): a table's
// typeset render (.png) displays like a figure; CSVs — including legacy
// inlineText bundles — NEVER inline. tex/data sources attach as quiet links.
import type { BoardFile, ResultArtifact } from "./types";

export interface ArtifactLink {
  label: string;
  url: string;
  download?: string;
}

export type ArtifactDisplay =
  | { mode: "oversized" }
  | { mode: "table-image"; url: string; links: ArtifactLink[] }
  | { mode: "table-inline"; kind: "html" | "md"; links: ArtifactLink[] }
  | { mode: "figure"; url: string }
  | { mode: "card"; url: string | null; basename: string | null; links: ArtifactLink[] }
  | { mode: "missing" };

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".gif"];

function isImage(f: string | null | undefined): boolean {
  const l = (f ?? "").toLowerCase();
  return IMAGE_EXTS.some((e) => l.endsWith(e));
}

function assetUrl(
  assets: Record<string, string>,
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  return assets[path.split("/").pop()!] ?? null;
}

function links(art: ResultArtifact, assets: Record<string, string>): ArtifactLink[] {
  const out: ArtifactLink[] = [];
  const tex = assetUrl(assets, art.tex);
  if (tex) out.push({ label: ".tex", url: tex, download: art.tex!.split("/").pop() });
  const data = assetUrl(assets, art.data);
  if (data) {
    const base = art.data!.split("/").pop()!;
    out.push({ label: `data: ${base}`, url: data, download: base });
  }
  return out;
}

/** The one place a producedBy.script (a bundle-relative name like
 * "scripts/02_clean.R") resolves to its snapshot BoardFile — suffix match,
 * returning the exact payload path the ScriptViewer drawer keys on. Used by
 * both the artifact card button and the provenance diagram (v0.11). */
export function resolveScriptSnapshot(
  producedBy: ResultArtifact["producedBy"],
  scripts: BoardFile[],
): BoardFile | null {
  if (!producedBy?.script) return null;
  return scripts.find((s) => s.path.endsWith("/" + producedBy.script)) ?? null;
}

export function artifactDisplay(
  art: ResultArtifact,
  assets: Record<string, string>,
): ArtifactDisplay {
  if (art.source.oversized) return { mode: "oversized" };
  const url = assetUrl(assets, art.file);
  const l = links(art, assets);
  if (art.kind === "table") {
    if (url && isImage(art.file)) return { mode: "table-image", url, links: l };
    const f = (art.file ?? "").toLowerCase();
    if (art.inlineText && (f.endsWith(".html") || f.endsWith(".md"))) {
      return {
        mode: "table-inline",
        kind: f.endsWith(".html") ? "html" : "md",
        links: l,
      };
    }
    // CSV / .tex / anything else falls through to a card — never an inline dump.
  }
  if (art.kind === "figure" && url) return { mode: "figure", url };
  if (url || l.length > 0) {
    return {
      mode: "card",
      url,
      basename: art.file ? art.file.split("/").pop()! : null,
      links: l,
    };
  }
  return { mode: "missing" };
}
