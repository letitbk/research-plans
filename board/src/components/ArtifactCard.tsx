import type { ResultArtifact, ResultsBundle } from "../lib/types";
import SafeTable from "./SafeTable";

function tableKind(art: ResultArtifact): "html" | "md" | "csv" {
  const f = (art.file ?? "").toLowerCase();
  if (f.endsWith(".html")) return "html";
  if (f.endsWith(".md")) return "md";
  return "csv";
}

/** One artifact (figure / table / download), reused inside a finding block and
 * in the "Additional evidence" section. Figures call onZoom to open a lightbox;
 * the "produced by" button toggles the shared ScriptViewer drawer via openScript. */
export default function ArtifactCard({
  art,
  bundle,
  openScript,
  setOpenScript,
  onZoom,
}: {
  art: ResultArtifact;
  bundle: ResultsBundle;
  openScript: string | null;
  setOpenScript: (s: string | null) => void;
  onZoom?: (url: string, title: string) => void;
}) {
  const basename = art.file ? art.file.split("/").pop()! : null;
  const url = basename ? bundle.assets[basename] : null;
  const scriptFile = art.producedBy
    ? bundle.scripts.find((s) => s.path.endsWith("/" + art.producedBy!.script))
    : null;
  return (
    <div
      data-annot-scope={`artifact:${art.id}`}
      data-annot-section={`artifact ${art.id}: ${art.title}`}
      className="rounded-lg border border-stone-200 bg-white p-4"
    >
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold text-stone-800">{art.title}</span>
        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] uppercase text-stone-500">
          {art.kind}
        </span>
      </div>
      {art.source.oversized ? (
        <div className="rounded border border-dashed border-stone-300 p-6 text-center text-xs text-stone-500">
          Too large to snapshot ({Math.round(art.source.bytes / 1024 / 1024)} MB)
          — original at <code>{art.source.path}</code>
        </div>
      ) : art.kind === "table" && art.inlineText ? (
        <SafeTable content={art.inlineText} kind={tableKind(art)} />
      ) : art.kind === "figure" && url ? (
        <img
          src={url}
          alt={art.title}
          role={onZoom ? "button" : undefined}
          tabIndex={onZoom ? 0 : undefined}
          onClick={onZoom ? () => onZoom(url, art.title) : undefined}
          onKeyDown={
            onZoom
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onZoom(url, art.title);
                  }
                }
              : undefined
          }
          className={`max-h-80 w-full rounded border border-stone-100 object-contain${
            onZoom ? " cursor-zoom-in" : ""
          }`}
        />
      ) : url ? (
        <a
          href={url}
          download={basename ?? undefined}
          className="text-xs font-medium text-blue-700 underline"
        >
          download {basename}
        </a>
      ) : (
        <div className="text-xs text-stone-400">no snapshot file</div>
      )}
      {art.caption && (
        <p className="mt-2 text-xs text-stone-500">{art.caption}</p>
      )}
      {art.producedBy && (
        <button
          className="mt-2 text-[11px] font-medium text-blue-700 underline disabled:text-stone-400 disabled:no-underline"
          disabled={!scriptFile}
          onClick={() =>
            setOpenScript(
              openScript === scriptFile?.path ? null : (scriptFile?.path ?? null),
            )
          }
        >
          ▸ produced by {art.producedBy.sourcePath}
          {scriptFile ? " (view snapshot)" : " (snapshot missing)"}
        </button>
      )}
    </div>
  );
}
