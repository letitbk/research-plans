// Sample payload for `npm run dev` only. The string RP_BOARD_DEV_DATA below is
// a tree-shake sentinel: the build check greps the built template to confirm
// this module was eliminated from production output.
import type { BoardData } from "./lib/types";

const MARKER = "RP_BOARD_DEV_DATA";

const masterPlan = `<!-- research-plans:master-plan -->
# Immigration Attitudes (ISSP) — Master Plan

Last updated: 2026-07-02

## Project context

This project is a cross-national analysis of immigration attitudes using ISSP data (${MARKER}). The core question is how support for immigration varies across countries and what individual- and country-level factors are associated with that variation.

The hard constraint is the deadline: end of July 2026.

## Components

| # | Component | Status | Execution plan | Outcome / notes |
|---|-----------|--------|----------------|-----------------|
| 1 | Data acquisition | done | — | ISSP sample in repo |
| 2 | Data cleaning | done | [v2](execution/02-data-cleaning/v2.md) | 66,864 rows after exclusions |
| 3 | Descriptive analysis | in progress | [v1](execution/03-descriptives/v1.md) | — |
| 4 | Regression modeling | not started | — | — |

Statuses: \`not started\` / \`planned\` / \`in progress\` / \`done\` / \`dropped\`.
`;

const decisionLog = `# Decision Log

Append-only. Entries are timestamped and written as decisions happen.

## 2026-07-01 10:12

**Context:** Starting data cleaning under plan v1.
**Question (Claude):** The codebook lists 97/98 as refusal codes for the support item. Treat as missing?
**Response (researcher):** Yes — recode to NA; add a count to the cleaning log.
**Effect on execution:** Added recode step; 431 rows affected.

## 2026-07-01 15:40

**Context:** Cleaning revealed duplicated household IDs in two countries.
**Decision (Claude):** Flagged rather than dropped — awaiting researcher call.
**Response (researcher):** Drop exact duplicates only; keep the rest.
**Effect on execution:** Plan revision proposed (v2) to record the exclusion rule.

## 2026-07-02 09:05 (late-captured at sync)

**Context:** Yesterday's session ended without logging the weighting decision.
**Question (Claude):** Use ISSP design weights in descriptives?
**Response (researcher):** Yes, weighted and unweighted side by side.
**Effect on execution:** Descriptives plan updated before execution.
`;

const cleaningV1 = `# Data Cleaning — Execution Plan v1

Component: \`02-data-cleaning\` · Master plan: [master-plan.md](../../master-plan.md) · Date: 2026-06-30

## Context

Prepare the ISSP extract for analysis: recode missing values, harmonize country codes, and produce a documented analysis sample.

## Scope decisions

| Dimension | Decision | Why |
|-----------|----------|-----|
| Missing codes | Recode 97/98 to NA | Codebook lists them as refusals |
| Countries | Keep all 31 | Attrition handled at modeling stage |

## Approach

Load raw extract, apply recode table, write cleaned parquet + cleaning log.

## Build steps

1. Load raw CSV
2. Apply missing-value recodes
3. Write cleaned data + row-count log

## Verification

Row counts before/after each step logged; spot-check 20 random rows against raw.

## Out of scope

No imputation; no derived scales (descriptives component owns those).

---
Signed off: Jane Doe, 2026-06-30
`;

const cleaningV2 = `# Data Cleaning — Execution Plan v2

Component: \`02-data-cleaning\` · Master plan: [master-plan.md](../../master-plan.md) · Date: 2026-07-01
Supersedes: v1 — duplicated household IDs discovered in two countries; added an explicit exclusion rule.

## Context

Prepare the ISSP extract for analysis: recode missing values, harmonize country codes, and produce a documented analysis sample.

## Scope decisions

| Dimension | Decision | Why |
|-----------|----------|-----|
| Missing codes | Recode 97/98 to NA | Codebook lists them as refusals |
| Countries | Keep all 31 | Attrition handled at modeling stage |
| Duplicates | Drop exact duplicates only | Household IDs collide in two countries; partial matches kept |

## Approach

Load raw extract, apply recode table, drop exact duplicates, write cleaned parquet + cleaning log.

## Build steps

1. Load raw CSV
2. Apply missing-value recodes
3. Drop exact duplicate rows (log counts per country)
4. Write cleaned data + row-count log

## Verification

Row counts before/after each step logged; spot-check 20 random rows against raw; duplicate report reviewed by researcher.

## Out of scope

No imputation; no derived scales (descriptives component owns those).

---
Signed off: Jane Doe, 2026-07-01
`;

const descriptivesV1 = `# Descriptive Analysis — Execution Plan v1

Component: \`03-descriptives\` · Master plan: [master-plan.md](../../master-plan.md) · Date: 2026-07-02

## Context

Describe the analysis sample: distribution of the support item by country and year, weighted and unweighted.

## Scope decisions

| Dimension | Decision | Why |
|-----------|----------|-----|
| Weights | ISSP design weights, shown alongside unweighted | Comparability with published CRI descriptives |

## Approach

Compute per-country summaries, export table + one figure.

## Build steps

1. Weighted and unweighted means by country
2. Figure: country means with CIs

## Verification

Totals cross-checked against cleaning log row counts.

## Out of scope

No models; no country-level covariates yet.

---
Signed off: Jane Doe, 2026-07-02
`;

const descriptivesDraft = `# Descriptive Analysis — Execution Plan v2

Component: \`03-descriptives\` · Master plan: [master-plan.md](../../master-plan.md) · Date: 2026-07-02
Supersedes: v1 — reviewer asked for item-level missingness table before means.

## Context

Describe the analysis sample: distribution of the support item by country and year, weighted and unweighted, plus item-level missingness.

## Scope decisions

| Dimension | Decision | Why |
|-----------|----------|-----|
| Weights | ISSP design weights, shown alongside unweighted | Comparability with published CRI descriptives |
| Missingness | Item-level table by country | Reviewer request; informs listwise-deletion defense |

## Approach

Compute missingness table, then per-country summaries, export tables + one figure.

## Build steps

1. Item-level missingness by country
2. Weighted and unweighted means by country
3. Figure: country means with CIs

## Verification

Totals cross-checked against cleaning log row counts.

## Out of scope

No models; no country-level covariates yet.
`;

const review = `# Review — Data Cleaning v2

Plan: [v2.md](../execution/02-data-cleaning/v2.md) · Rubric: plan-rubric.md (draft v0.1) · Date: 2026-07-02
Score: **18 / 22 (82%)** — strong

## Items

| # | Item | Score | Evidence | Justification |
|---|------|-------|----------|---------------|
| 1 | Written and self-contained | 2 | "Prepare the ISSP extract…" | Readable cold |

## Top revisions

1. Name the spot-check seed so verification is reproducible.

## Split assessment

Right-sized: one coherent cleaning component with a single verification routine.

## Data

\`\`\`json board-scorecard
{"schemaVersion":1,"component":"02-data-cleaning","planVersion":2,
 "planPath":"plans/execution/02-data-cleaning/v2.md","rubricVersion":"0.1","date":"2026-07-02",
 "items":[
  {"id":1,"name":"Written and self-contained","score":2,"evidence":"Prepare the ISSP extract for analysis","justification":"Readable cold"},
  {"id":2,"name":"Prospective","score":2,"evidence":"v2 committed 2026-07-01; outputs 2026-07-02","justification":"Plan precedes outputs"},
  {"id":3,"name":"Revisable with versions","score":2,"evidence":"v2 supersedes v1 with reason","justification":"Real event-triggered revision"},
  {"id":4,"name":"Researcher-committed","score":2,"evidence":"Signed off: Jane Doe","justification":"Signed; choices researcher's"},
  {"id":5,"name":"All sections present","score":2,"evidence":"7 sections","justification":"Complete"},
  {"id":6,"name":"Scope decisions carry reasons","score":2,"evidence":"3 rows with reasons","justification":"Each dimension reasoned"},
  {"id":7,"name":"Verification checkable","score":1,"evidence":"spot-check 20 random rows","justification":"No seed named"},
  {"id":8,"name":"Decisions specific and grounded","score":2,"evidence":"duplicate household IDs","justification":"Project-specific"},
  {"id":9,"name":"Domain knowledge non-generic","score":1,"evidence":"codebook refusal codes","justification":"Some grounding"},
  {"id":10,"name":"Choices consequential","score":2,"evidence":"exclusion rule","justification":"Materially affects sample"},
  {"id":11,"name":"Revisions substantive","score":null,"status":"N/A","justification":"Scored at v2 creation"},
  {"id":12,"name":"Another agent could pick it up","score":2,"evidence":"Build steps 1-4","justification":"Concrete"},
  {"id":13,"name":"Out of scope constrains","score":1,"evidence":"No imputation","justification":"Somewhat generic"},
  {"id":14,"name":"Right-sized","score":2,"evidence":"one cleaning component","justification":"Single verification"}],
 "raw":18,"applicableMax":22,"percent":82,"band":"strong",
 "excluded":[{"id":11,"why":"N/A — scored at creation"}],
 "topRevisions":["Name the spot-check seed so verification is reproducible."],
 "split":{"verdict":"right-sized","detail":"One coherent cleaning component with a single verification routine."}}
\`\`\`
`;

export const devData: BoardData = {
  schemaVersion: 1,
  generatedAt: "2026-07-02T12:00:00-04:00",
  mode: "live",
  focus: null,
  project: { name: "issp-immigration-dev", root: "/dev/sample" },
  git: {
    available: true,
    branch: "main",
    head: "abc1234",
    fileDates: {
      "plans/execution/02-data-cleaning/v1.md": {
        firstCommit: "2026-06-30T09:00:00-04:00",
        lastCommit: "2026-06-30T09:00:00-04:00",
      },
      "plans/execution/02-data-cleaning/v2.md": {
        firstCommit: "2026-07-01T16:00:00-04:00",
        lastCommit: "2026-07-01T16:00:00-04:00",
      },
    },
  },
  files: {
    masterPlan: { path: "plans/master-plan.md", content: masterPlan },
    decisionLog: { path: "plans/decision-log.md", content: decisionLog },
    executionPlans: [
      {
        component: "02-data-cleaning",
        versions: [
          { version: 1, path: "plans/execution/02-data-cleaning/v1.md", content: cleaningV1 },
          { version: 2, path: "plans/execution/02-data-cleaning/v2.md", content: cleaningV2 },
        ],
      },
      {
        component: "03-descriptives",
        versions: [
          { version: 1, path: "plans/execution/03-descriptives/v1.md", content: descriptivesV1 },
        ],
        draft: {
          proposedVersion: 2,
          path: "plans/execution/03-descriptives/.draft-v2.md",
          content: descriptivesDraft,
        },
      },
    ],
    reviews: [
      { path: "plans/reviews/02-data-cleaning-v2.md", content: review },
    ],
  },
};
