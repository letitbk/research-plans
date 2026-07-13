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
    <a
      href={url}
      download={basename}
      className="text-xs font-medium text-blue-700 dark:text-blue-400 underline"
    >
      download
    </a>
  ) : (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="text-xs font-medium text-blue-700 dark:text-blue-400 underline"
    >
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
                <th
                  key={i}
                  className="border border-stone-200 dark:border-stone-700 px-2 py-1 text-left font-semibold text-stone-700 dark:text-stone-300"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {capped.rows.slice(1).map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td
                    key={ci}
                    className="border border-stone-100 dark:border-stone-800 px-2 py-1 whitespace-nowrap text-stone-600 dark:text-stone-400"
                  >
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
          <span className="truncate text-sm font-semibold text-stone-800 dark:text-stone-200">
            {title}
          </span>
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
