# Results layer — design

**Date:** 2026-07-03
**Target release:** v0.5.0
**Status:** approved by BK (brainstorming session, 2026-07-03)

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
  "comment": "optional one-liner from the researcher"
}
```

`status` ∈ `accepted` | `changes-requested`. Absence of the file means pending. The
file is written once; a changes-requested bundle keeps that record forever — the fix
arrives as the next `r` version.

### Immutability

A bundle is never edited after capture, with one exception: `verdict.json` may be
*created* once. `signoff_gate.py` (the existing PreToolUse hook) is extended to
mechanically deny Write/Edit to any file inside an existing `results/r*/` directory,
allowing only (a) creation of a new `rN/` directory with the next unused number and
(b) one-time creation of a missing `verdict.json`. This is immutability enforcement
only — there is **no** verdict gate; nothing blocks tracker updates on unverified
results. Shell redirection remains out of scope, exactly as for plan versions.

## Capture flows

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
4. **Write the bundle.** Copy artifacts and script snapshots, compute sha256s, write
   `manifest.json`. Next unused `rN` number (the hook also enforces this).
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
capture flow. Never capture silently.

## Board integration

### Data payload

`BoardData.files.executionPlans[]` groups gain
`results: ResultsBundle[]` — manifest (parsed), `report.md` content, `verdict.json`
if present, and script snapshot text. Artifact bytes are **not** inlined in live
mode: the existing HTTP server gains a `GET /artifact/<component>/<rN>/<file>` route
(path-validated against the payload's artifact list). Export mode inlines images as
data URIs and table HTML directly — snapshots stay self-contained. `schemaVersion`
bumps to 2.

### Results view (fifth view)

- **Component list** with latest-bundle status badges.
- **Version strip** per component: `r1 · plan v1 ✓`, `r2 · plan v1 ●` (✓ accepted,
  ✕ changes-requested, ● pending). Selecting a version renders the bundle page.
- **Bundle page:** verdict banner (with Accept / Request changes buttons in live
  mode), rendered `report.md`, metric stat tiles, artifact gallery (figures as
  images with captions, tables as rendered HTML in a horizontally scrolling
  container, oversized placeholders), and a script drawer — each artifact's
  "produced by" opens the highlighted snapshot.
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

### Verdict flow (live mode)

Accept / Request changes POST back alongside annotations. The session then:

- **Accept:** create `verdict.json` (`status: accepted`), append a decision-log
  entry, update the tracker row to `done (verified)`.
- **Request changes:** create `verdict.json` (`status: changes-requested`), append
  the comments to the decision log, act on the feedback (fix scripts, re-run),
  and capture the fix as the next `r` version with `trigger: "redo-after-review"`.

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

- `tests/test_board.py`: payload collection over results fixtures (bundles with
  verdicts, pending, oversized artifacts, retrofit, no-plan components); artifact
  route path-validation; export inlining.
- Gate tests: deny edit/overwrite inside existing `r*/`; allow next-`rN` creation;
  allow one-time `verdict.json` creation, deny its edit.
- `board/src/lib/parse.test.ts`: manifest and verdict parsing, `done (verified)`
  tracker status.
- `board/src/dev-data.ts`: extended with sample bundles for `npm run dev`.
- Headless pressure test for `/research-plans:results` in a scratch repo
  (verify-on-disk before the command reports success).

## Implementation phasing

1. **Data model + capture.** Manifest/verdict schemas, `/results` command
   (including `--adopt`), gate extension, tests.
2. **Board.** Payload + artifact route, Results view, annotations, verdict flow,
   cross-links, export inlining.
3. **Integration.** `/sync` step, `/status` awareness of unverified done
   components, README/QUICKSTART/CHANGELOG.

## Out of scope (this release)

- Verdict gating (blocking tracker writes on unverified results).
- Diffing two result versions (image diff, table diff) — future candidate.
- Large-artifact storage (git-lfs, external stores); the size cap is the answer
  for now.
- Multi-reviewer verdicts; verdicts are single-researcher, like sign-off.
