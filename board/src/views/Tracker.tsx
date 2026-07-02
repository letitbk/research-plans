import Markdown from "../components/Markdown";
import { GeneralCommentBox } from "../components/AnnotationLayer";
import type { BoardData, TrackerStatus } from "../lib/types";
import { parseMasterPlan } from "../lib/parse";

const CHIP: Record<TrackerStatus, string> = {
  "not started": "bg-stone-100 text-stone-600 border-stone-200",
  planned: "bg-blue-50 text-blue-700 border-blue-200",
  "in progress": "bg-amber-50 text-amber-800 border-amber-200",
  done: "bg-green-50 text-green-800 border-green-200",
  dropped: "bg-red-50 text-red-700 border-red-200 line-through",
  unknown: "bg-stone-100 text-stone-500 border-stone-200",
};

function slugFromLink(link: string): string | null {
  const m = /execution\/([^/)]+)\//.exec(link);
  return m ? m[1] : null;
}

export default function Tracker({
  data,
  live,
  onOpenComponent,
  onAddGeneral,
}: {
  data: BoardData;
  live: boolean;
  onOpenComponent: (slug: string | null, name: string) => void;
  onAddGeneral: (view: string, comment: string) => void;
}) {
  const mp = parseMasterPlan(data.files.masterPlan.content);

  if (!mp.ok) {
    return (
      <div>
        <Notice text="The master plan did not match the expected format — showing it raw." />
        <Markdown source={mp.raw} />
      </div>
    );
  }

  const knownSlugs = new Set(data.files.executionPlans.map((g) => g.component));
  const linkedSlugs = new Set(
    mp.components
      .map((r) => slugFromLink(r.planLink))
      .filter((s): s is string => s !== null),
  );
  const orphanGroups = data.files.executionPlans.filter(
    (g) => !linkedSlugs.has(g.component),
  );

  const counts = mp.components.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-stone-900">{mp.title}</h1>
        {mp.lastUpdated && (
          <span className="text-xs text-stone-500">
            Last updated {mp.lastUpdated}
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(counts).map(([status, n]) => (
          <span
            key={status}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${CHIP[status as TrackerStatus] ?? CHIP.unknown}`}
          >
            {n} {status}
          </span>
        ))}
      </div>

      <section className="mb-6 rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Project context
        </h2>
        <Markdown source={mp.contextMd} className="text-sm" />
      </section>

      <section className="rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Component</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Plan</th>
              <th className="px-4 py-2">Outcome / notes</th>
            </tr>
          </thead>
          <tbody>
            {mp.components.map((r, i) => {
              const slug = slugFromLink(r.planLink);
              const missingFile =
                slug !== null && !knownSlugs.has(slug);
              return (
                <tr key={i} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-2.5 text-stone-400">{r.num}</td>
                  <td className="px-4 py-2.5 font-medium text-stone-800">
                    {r.component}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${CHIP[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {slug && !missingFile ? (
                      <button
                        className="text-xs font-medium text-blue-700 underline hover:text-blue-900"
                        onClick={() => onOpenComponent(slug, r.component)}
                      >
                        open plan
                      </button>
                    ) : missingFile ? (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">
                        linked file missing
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-stone-600">{r.notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {orphanGroups.length > 0 && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          Drift: execution plan{orphanGroups.length > 1 ? "s" : ""} with no
          tracker row —{" "}
          {orphanGroups.map((g, i) => (
            <button
              key={g.component}
              className="font-medium underline"
              onClick={() => onOpenComponent(g.component, g.component)}
            >
              {g.component}
              {i < orphanGroups.length - 1 ? ", " : ""}
            </button>
          ))}
        </div>
      )}

      {mp.sequencingMd && (
        <section className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
            Sequencing notes
          </h2>
          <Markdown source={mp.sequencingMd} className="text-sm" />
        </section>
      )}

      {live && <GeneralCommentBox view="Tracker" onAdd={onAddGeneral} />}
    </div>
  );
}

export function Notice({ text }: { text: string }) {
  return (
    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {text}
    </div>
  );
}
