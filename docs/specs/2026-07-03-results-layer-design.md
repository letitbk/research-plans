# Results layer — design

**Date:** 2026-07-03
**Target release:** v0.6.0 (v0.5.0 is the remote-plan-review feature, in flight on
`feature/remote-plan-review`; this feature lives on `feature/results-layer`)
**Status:** approved by BK (brainstorming session, 2026-07-03); revised same day
after cross-model review (Codex GPT-5.5 + Gemini 3.1 Pro) — amendments marked
inline where they changed the design

## Problem

The plugin lets a researcher inspect and sign *plans*, but verifying *results* still
means leaving the board: hunting through output folders, guessing which files are
current, opening scripts by hand, and relaying comments to the agent in prose. There
is no versioned record of which outputs corresponded to which plan, and no way to
review or accept results the way plans are reviewed and signed. Projects that adopt
the workflow mid-stream also have pre-existing figures and tables with no home.

## Decisions (settled with the researcher)

1. **Verification = recorded verdict.** The researcher reviews a results bundle in
   the board and issues accept or request-changes. The verdict and comments are
   recorded in the decision log; the tracker distinguishes `done` from
   `done (verified)`. No hook blocks anything on verdicts — this is a recorded act,
   lighter than plan sign-off.
2. **Capture has two entry points, one code path.** A new
   `/research-plans:results` command assembles or updates a bundle anytime;
   `/research-plans:sync` prompts to capture when a component reaches done.
3. **Artifacts are snapshot copies.** Figures/tables/numbers are copied into the
   bundle at capture time. Bundles are immutable; re-running an analysis can never
   silently change what was verified. A size cap keeps git sane.
4. **Scripts are snapshotted too, with line comments.** Each artifact records its
   producing script; the script text is copied into the bundle. The board renders it
   highlighted and accepts comments anchored to lines. Provenance is exact: you
   review the code that actually ran.
5. **Retrofit attaches to components, flagged.** Pre-existing artifacts are adopted
   into normal bundles marked `provenance: retrofit` (no plan governed their
   production). Review and verdicts work identically. No legacy bucket, no
   retroactive as-built plans.
6. **Results have their own version sequence.** Bundles are `r1, r2, …` per
   component, each stamped with the plan version in force and a trigger
   (`initial` / `redo-after-review` / `plan-revision`). A redo under an unchanged
   plan is a new `r` version, not a plan bump and not an overwrite.
7. **Board UX: a fifth view.** A dedicated Results view; Tracker, Plan reader, and
   Timeline get light cross-links. Existing views otherwise unchanged.

## On-disk data model

```
plans/execution/02-analysis/
├── v1.md, v2.md                  signed plans (unchanged)
└── results/
    ├── r1/
    │   ├── manifest.json         the index
    │   ├── report.md             brief report, agent-drafted
    │   ├── verdict.json          created once, at verdict time (absent = pending)
    │   ├── artifacts/            fig1.png, table1.html, table1.csv …
    │   └── scripts/              03_model.R — snapshot of the code that ran
    └── r2/ …
```

### manifest.json (schemaVersion 1)

```json
{
  "schemaVersion": 1,
  "component": "02-analysis",
  "resultsVersion": 1,
  "planVersion": 1,
  "provenance": "planned",
  "trigger": "initial",
  "capturedAt": "2026-07-03 14:22",
  "summary": "One-line description of what this bundle shows",
  "metrics": [
    { "label": "N", "value": "67,295", "note": "analytic sample" },
    { "label": "ICC", "value": "0.14", "note": "country level" }
  ],
  "artifacts": [
    {
      "id": "fig-icc",
      "kind": "figure",
      "title": "Country-level variance",
      "caption": "ICC by wave; error bars are 95% CIs.",
      "file": "artifacts/fig1.png",
      "source": { "path": "output/figures/fig1.png", "sha256": "…", "bytes": 48210, "oversized": false },
      "producedBy": { "script": "scripts/03_model.R", "sourcePath": "code/03_model.R", "lang": "r" }
    },
    {
      "id": "tab-main",
      "kind": "table",
      "title": "Main models",
      "caption": "",
      "file": "artifacts/table1.html",
      "data": "artifacts/table1.csv",
      "source": { "path": "output/tables/table1.csv", "sha256": "…", "bytes": 3120, "oversized": false },
      "producedBy": { "script": "scripts/03_model.R", "sourcePath": "code/03_model.R", "lang": "r" }
    }
  ]
}
```

Field notes:

- `planVersion` is `null` for retrofit bundles in components that have no signed
  plan; otherwise it is the latest signed version at capture time.
- `provenance` ∈ `planned` | `retrofit`; `trigger` ∈ `initial` |
  `redo-after-review` | `plan-revision`. Retrofit bundles use `trigger: "initial"`.
- `metrics` are the "key numbers" — rendered as stat tiles at the top of the bundle
  page.
- `kind` ∈ `figure` | `table` | `other`. Tables carry both a renderable `file`
  (HTML or markdown; the agent generates one if the pipeline only produced CSV) and
  the raw `data` file.
- **Size cap:** artifacts over 5 MB are not copied. `file` is `null`,
  `source.oversized` is `true`, and the board shows a placeholder card with the
  original path and checksum.
- `producedBy.script` points at the snapshot inside the bundle;
  `producedBy.sourcePath` records where the script lives in the repo. One script
  snapshot may be shared by several artifacts.

### verdict.json

```json
{
  "status": "accepted",
  "date": "2026-07-04 09:10",
  "planVersion": 1,
  "reviewer": "BK",
  "comment": "optional one-liner from the researcher"
}
```

`status` ∈ `accepted` | `changes-requested`. Absence of the file means pending. The
file is written once; a changes-requested bundle keeps that record forever — the fix
arrives as the next `r` version. `reviewer` defaults to git `user.name` (review
amendment: verdicts need attribution).

### Immutability — staging protocol (review amendment)

A capture writes many files; a naive "deny writes inside existing `r*/`" rule would
block every file after the first. So capture goes through staging:

1. All bundle files are written to `results/.staging-<id>/` (gitignored, freely
   writable, resumable like plan drafts).
2. `results.py finalize` validates the staged bundle (manifest parses, files
   referenced exist, checksums match) and atomically renames it to the next unused
   `rN/`.

Only **finalized** bundles are immutable. `signoff_gate.py` (the existing PreToolUse
hook) is extended to deny Write/Edit to any file inside an existing `results/r*/`
directory, with one exception: one-time creation of a missing `verdict.json`.
Critically, the results branch of the hook is **synchronous file-policy only** — it
never opens the browser gate UI (that would deadlock capture). This is immutability
enforcement only — there is **no** verdict gate; nothing blocks tracker updates on
unverified results. Shell redirection remains out of scope, exactly as for plan
versions.

## Capture flows

### `results.py` — the shared helper (review amendment)

"Two entry points, one code path" needs real shared code, not duplicated command
prose — `/sync`'s allowed tools (`git`, `ls`, `date`) cannot copy files or compute
hashes. A new `skills/managing-research-plans/scripts/results.py` (python3 stdlib
only, like `board.py`) owns the mechanics, with subcommands:

- `discover` — candidate artifacts (recently changed output files; excludes
  anything under `plans/execution/**/results/**` so bundles never adopt themselves)
- `stage` — create/resume `.staging-<id>/`, copy artifacts + script snapshots,
  compute sha256s, apply the size cap
- `finalize` — validate the staged bundle and atomically rename to the next `rN/`
- `verdict` — one-time creation of `verdict.json` for a finalized bundle

Both commands call it; the interview and report drafting remain the agent's job.
`/results` and `/sync` get `Bash(python3:*)`-scoped access to this script.

### `/research-plans:results <component>`

1. **Gather candidates.** Session context, output files that changed recently
   (`git status` + mtimes; no-git fallback: mtimes only), and the plan's
   verification section (outputs the plan promised).
2. **Interview.** The researcher confirms which artifacts belong in the bundle,
   titles/captions, and which key numbers to surface. The agent may propose; the
   researcher decides. Report zero artifacts honestly if nothing qualifies.
3. **Draft `report.md`.** Brief: what ran, what came out, how it meets or misses the
   plan's success criteria, anomalies worth the researcher's eyes. No overclaiming —
   the report cites artifacts by id, and claims must trace to an artifact or metric.
4. **Write the bundle.** `results.py stage` copies artifacts and script snapshots
   into `.staging-<id>/` and computes sha256s; the agent writes `report.md` and
   `manifest.json` there; `results.py finalize` validates and atomically renames to
   the next unused `rN/` (the hook also enforces immutability after that point).
5. **Offer the board.** Open `/research-plans:board` focused on the new bundle for
   review and verdict.

### `/research-plans:results --adopt`

Retrofit mode. Scans likely output locations (`output/`, `figures/`, `tables/`,
`results/`, common image/table extensions), presents candidates, and interviews the
researcher to assign each chosen artifact to a component — creating tracker rows for
work that has no component yet. Producing scripts are identified where the
researcher or session context can name them; unknown producers are recorded as
`producedBy: null` rather than guessed. Bundles are written with
`provenance: "retrofit"`.

### `/research-plans:sync` integration

One new step after the tracker update: for each component whose status moved to
`done`, or whose outputs on disk are newer than its latest bundle, offer to run the
capture flow. Never capture silently. "Newer" is defined concretely (review
amendment): a source file recorded in the latest manifest whose current sha256
differs from the recorded one, or files in the discovery scope modified after the
bundle's `capturedAt`.

## Board integration

### Data payload

`BoardData.files.executionPlans[]` groups gain
`results: ResultsBundle[]` — manifest (parsed), `report.md` content, `verdict.json`
if present, and script snapshot text. Review amendments, all grounded in current
code:

- **Plan-less components must still be emitted.** `collect_payload()` currently
  appends a group only `if versions or draft` — a retrofit component with only
  `results/` would silently vanish. The condition gains `or results`.
- **Payload hashes include results files.** Both `payload_files()` (board.py) and
  `allFiles()` (parse.ts) add manifests, reports, verdicts, and script snapshots,
  so annotation storage keys and staleness checks stay correct.
- **Artifact route.** Live mode serves bytes via
  `GET /artifact/<component>/<rN>/<file>`: requests are validated against the
  payload's artifact list (no path math from user input), MIME types via the
  `mimetypes` module, 404 for anything unknown — today's handler returns the board
  HTML for every path, which would corrupt image loads.
- **Focus.** `--focus` becomes result-aware (`<component>` or `<component>:rN`) so
  capture can open the board directly on a new bundle.
- Export mode inlines images as data URIs and table HTML directly — snapshots stay
  self-contained. `schemaVersion` bumps (to the next free number after the
  remote-review feature lands its own bump).

### Results view (fifth view)

- **Component list** with latest-bundle status badges.
- **Version strip** per component: `r1 · plan v1 ✓`, `r2 · plan v1 ●` (✓ accepted,
  ✕ changes-requested, ● pending). Selecting a version renders the bundle page.
- **Bundle page:** verdict banner (with Accept / Request changes buttons in live
  mode), rendered `report.md`, metric stat tiles, artifact gallery (figures as
  images with captions, tables in a horizontally scrolling container, oversized
  placeholders), and a script drawer — each artifact's "produced by" opens the
  highlighted snapshot.
- **Tables render through a narrow, sanitized path** (review amendment):
  `Markdown.tsx` deliberately escapes raw HTML and stays that way. Captured table
  HTML renders through a dedicated component that whitelists table tags/attributes
  only; markdown-format tables render through the normal pipeline.
- Retrofit bundles show a visible `retrofit` provenance chip.

### Annotations

Two new types, reusing the existing anchor + feedback machinery:

```ts
interface ResultCommentAnnotation {
  id: string; type: "result-comment";
  component: string; resultsVersion: number;
  target: { kind: "artifact" | "report" | "metric"; artifactId?: string;
            quote?: string; prefix?: string; suffix?: string; occurrenceIndex?: number;
            metricLabel?: string };
  comment: string;
}
interface ScriptCommentAnnotation {
  id: string; type: "script-comment";
  component: string; resultsVersion: number;
  script: string;             // snapshot path inside the bundle
  lineStart: number; lineEnd: number;
  excerpt: string;            // the quoted lines, for re-anchoring and the feedback doc
  comment: string;
}
```

Both are included in the "Send to Claude" feedback document with enough context
(component, rN, artifact title or script lines) for the session to act without
opening the board.

UI mechanics (review amendment): the existing anchor machinery is
`window.getSelection()`-based and cannot select an image or a stat tile. Figure
cards and metric tiles therefore get an explicit "comment" affordance; text
selection still works for report passages (reusing `anchor.ts`) and script comments
use line-range selection in the script drawer, rendered by a line-based component,
not the quote anchorer.

### Verdict flow (live mode)

`board.py` stays a messenger (review amendment): it never mutates plan or results
files itself, exactly as today. The verdict POST produces a structured **action
block** in the feedback document (alongside any annotations), and the *session*
then applies it via `results.py verdict`:

- **Accept:** create `verdict.json` (`status: accepted`), append a decision-log
  entry, update the tracker row to `done (verified)`.
- **Request changes:** create `verdict.json` (`status: changes-requested`), append
  the comments to the decision log, act on the feedback (fix scripts, re-run),
  and capture the fix as the next `r` version with `trigger: "redo-after-review"`.

`commands/board.md` is updated to teach the session this routing (it currently
covers only plan comments and general comments).

The `TrackerStatus` parser gains `done (verified)`. Static exports render verdicts
read-only and disable the buttons (as annotation already is in snapshots).

### Cross-links

- **Tracker:** a results cell per row — latest bundle id + verdict badge, linking
  into the Results view.
- **Plan reader:** a chip row listing bundles captured under the open plan version.
- **Timeline:** capture events (`r2 captured under plan v1`) and verdict events.

### Export

`--export` includes results bundles with inlined images. The existing warning —
a snapshot publishes everything under `plans/` — now explicitly mentions figures
and script snapshots.

## What stays untouched

Plan sign-off gate semantics, review scorecards, decision-log format, annotation
anchoring internals, and all four existing views beyond the cross-links above.

## Testing

- New `tests/test_results.py`: `results.py` discover/stage/finalize/verdict —
  staging resume, atomic rename, next-`rN` computation, size cap, checksum
  validation, self-adoption exclusion.
- `tests/test_board.py`: payload collection over results fixtures (bundles with
  verdicts, pending, oversized artifacts, retrofit, **no-plan components**);
  artifact route path-validation + 404s; export inlining; payload hash includes
  results files.
- Gate tests: deny edit/overwrite inside finalized `r*/`; staging dir writes pass;
  allow one-time `verdict.json` creation, deny its edit; results branch never
  blocks on the browser.
- `board/src/lib/parse.test.ts`: manifest and verdict parsing, `done (verified)`
  tracker status, sanitized table rendering.
- `board/src/dev-data.ts`: extended with sample bundles for `npm run dev`.
- Headless pressure test for `/research-plans:results` in a scratch repo
  (verify-on-disk before the command reports success).

## Implementation phasing

1. **Mechanics + capture.** `results.py` (discover/stage/finalize/verdict),
   manifest/verdict schemas, `/results` command (including `--adopt`), gate
   extension, tests.
2. **Board.** Payload (incl. plan-less components + hashing) + artifact route,
   Results view, annotations, verdict action block, cross-links, export inlining.
3. **Integration.** `/sync` step, `/status` awareness of unverified done
   components, `commands/board.md` verdict routing, README/QUICKSTART/SKILL/
   CHANGELOG, plugin.json → 0.6.0.

## Out of scope (this release)

- Verdict gating (blocking tracker writes on unverified results).
- Diffing two result versions (image diff, table diff) — future candidate.
- Large-artifact storage (git-lfs, external stores); the size cap is the answer
  for now. Bundles are committed by default — they are the record.
- Zip-based export for image-heavy projects (Gemini review suggestion); data-URI
  inlining under the 5 MB cap is acceptable for now, revisit if exports get heavy.
- Special handling for PDFs or interactive HTML figures (Plotly/Bokeh); they are
  captured as files, shown as download cards, not rendered inline.
- Multi-reviewer verdicts; verdicts are single-researcher, like sign-off.
