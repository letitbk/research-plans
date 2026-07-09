import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import { buildProvenanceGraph, UNKNOWN_PRODUCER } from "../lib/provenance";
import type { ResultsBundle } from "../lib/types";

/** The Results view's provenance section (v0.11): a script→artifact flow
 * diagram replacing the old text list. HTML node cards over an SVG bezier
 * layer (pointer-events:none). Click a script → the shared ScriptViewer
 * drawer (read + line comments); click an artifact → lightbox or scroll to
 * its card. Node text is real selectable text and artifact nodes carry
 * provenance:<id> annotation stamps, so drag-select comments route through
 * the surrounding AnnotationLayer — one gesture everywhere. */
export default function ProvenanceFlow({
  bundle,
  planGoal,
  onOpenScript,
  onZoom,
}: {
  bundle: ResultsBundle;
  planGoal: string | null;
  onOpenScript: (snapshotPath: string) => void;
  onZoom?: (url: string, title: string) => void;
}) {
  const m = bundle.manifest;
  const graph = buildProvenanceGraph(bundle);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const lastMeasure = useRef("");
  const [paths, setPaths] = useState<string[]>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const setNodeRef = (key: string) => (el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(key, el);
    else nodeRefs.current.delete(key);
  };

  const measure = useCallback(() => {
    const host = containerRef.current;
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
    if (hostRect.width === 0) return; // details collapsed
    const next: string[] = [];
    for (const e of graph.edges) {
      const from = nodeRefs.current.get(`s:${e.from}`);
      const to = nodeRefs.current.get(`a:${e.to}`);
      if (!from || !to) continue;
      const f = from.getBoundingClientRect();
      const t = to.getBoundingClientRect();
      const x1 = f.right - hostRect.left;
      const y1 = f.top + f.height / 2 - hostRect.top;
      const x2 = t.left - hostRect.left;
      const y2 = t.top + t.height / 2 - hostRect.top;
      const dx = Math.max(24, (x2 - x1) / 2);
      next.push(
        `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      );
    }
    // Runs on every render (layout effect without deps) — only commit state
    // when the measured pixels actually changed, or this would loop.
    const key = `${hostRect.width}x${hostRect.height}|${next.join(";")}`;
    if (key === lastMeasure.current) return;
    lastMeasure.current = key;
    setPaths(next);
    setSize({ w: hostRect.width, h: hostRect.height });
  }, [graph.edges]);

  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    const host = containerRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    return () => ro.disconnect();
  }, [measure]);

  if (!m) return null;

  // A drag-select that ends on a node must open the comment pill, not
  // trigger the node's click action.
  const clickGuard = () => !window.getSelection()?.isCollapsed;

  const scrollToCard = (id: string) => {
    document
      .querySelector(`[data-artifact-card-id="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <details
      className="mb-4 rounded-lg border border-stone-200 bg-white px-4 py-2 dark:border-stone-800 dark:bg-stone-900"
      open
      onToggle={measure}
    >
      <summary className="cursor-pointer select-none py-1 text-xs text-stone-500">
        <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">
          Provenance
        </span>{" "}
        — captured {m.capturedAt}
        {m.planVersion != null
          ? m.provenance === "retrofit"
            ? ` · documented by retrospective plan v${m.planVersion}`
            : ` under plan v${m.planVersion}`
          : " · no governing plan (retrofit)"}
      </summary>

      {planGoal && (
        <div className="mt-2 rounded-md bg-stone-50 px-3 py-2 dark:bg-stone-800/50">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            Plan goal (v{m.planVersion})
          </div>
          <Markdown source={planGoal} className="text-xs" />
        </div>
      )}

      <div ref={containerRef} className="relative mt-3 mb-2">
        <svg
          className="pointer-events-none absolute inset-0"
          width={size.w}
          height={size.h}
          aria-hidden="true"
        >
          {paths.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              className="stroke-stone-300 dark:stroke-stone-600"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        <div className="relative grid grid-cols-[minmax(11rem,1fr)_minmax(3rem,0.4fr)_minmax(14rem,1.6fr)] items-start gap-y-3">
          {/* scripts column */}
          <div className="col-start-1 flex flex-col gap-3">
            {graph.scriptNodes.map((s) => {
              const clickable = s.snapshotPath !== null;
              const ghost = s.key === UNKNOWN_PRODUCER;
              return (
                <div
                  key={s.key}
                  ref={setNodeRef(`s:${s.key}`)}
                  data-annot-scope={`provenance-script:${s.label}`}
                  data-annot-section={`provenance — ${s.label}`}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={
                    clickable
                      ? () => {
                          if (clickGuard()) return;
                          onOpenScript(s.snapshotPath!);
                        }
                      : undefined
                  }
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter") onOpenScript(s.snapshotPath!);
                        }
                      : undefined
                  }
                  className={`rounded-lg border px-3 py-2 ${
                    ghost
                      ? "border-dashed border-stone-300 text-stone-400 dark:border-stone-600 dark:text-stone-500"
                      : "border-stone-300 bg-stone-50 dark:border-stone-600 dark:bg-stone-800/50"
                  } ${clickable ? "cursor-pointer hover:border-blue-400 hover:shadow-sm dark:hover:border-blue-500" : ""}`}
                >
                  <div className="font-mono text-xs font-semibold text-stone-800 dark:text-stone-200">
                    {s.label}
                  </div>
                  {s.sourcePath && (
                    <div className="mt-0.5 truncate font-mono text-[10px] text-stone-500">
                      {s.sourcePath}
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-stone-500">
                    {s.lang && (
                      <span className="rounded bg-stone-200 px-1 py-0.5 uppercase dark:bg-stone-700 dark:text-stone-300">
                        {s.lang}
                      </span>
                    )}
                    {s.lineCount !== null && <span>{s.lineCount} lines</span>}
                    {clickable ? (
                      <span className="ml-auto font-medium text-blue-700 dark:text-blue-400">
                        view code ▸
                      </span>
                    ) : ghost ? null : (
                      <span className="ml-auto">snapshot missing</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* spacer column the edges flow through */}
          <div className="col-start-2" />

          {/* artifacts column */}
          <div className="col-start-3 flex flex-col gap-3">
            {graph.artifactNodes.map((a) => (
              <div
                key={a.id}
                ref={setNodeRef(`a:${a.id}`)}
                data-annot-scope={`provenance:${a.id}`}
                data-annot-section={`provenance — ${a.title}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (clickGuard()) return;
                  if (a.fullUrl && onZoom) onZoom(a.fullUrl, a.title);
                  else scrollToCard(a.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (a.fullUrl && onZoom) onZoom(a.fullUrl, a.title);
                    else scrollToCard(a.id);
                  }
                }}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 hover:border-blue-400 hover:shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:hover:border-blue-500"
              >
                {a.thumb ? (
                  <img
                    src={a.thumb}
                    alt=""
                    onLoad={measure}
                    className="h-11 w-11 shrink-0 rounded border border-stone-100 object-cover dark:border-stone-700"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-stone-200 bg-stone-50 font-mono text-[10px] uppercase text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-500">
                    {a.kind === "table" ? "tbl" : a.kind === "figure" ? "fig" : "file"}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-stone-800 dark:text-stone-200">
                    {a.title}
                  </div>
                  <div className="truncate font-mono text-[10px] text-stone-500">
                    ← {a.sourcePath}
                  </div>
                  {(a.tex || a.data) && (
                    <div className="mt-0.5 flex gap-1 text-[9px] text-stone-500">
                      {a.tex && (
                        <span className="rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-800">
                          .tex
                        </span>
                      )}
                      {a.data && (
                        <span className="rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-800">
                          data
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
