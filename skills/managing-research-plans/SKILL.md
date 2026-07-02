---
name: managing-research-plans
description: Use when working in a research repository initialized for the research-plans workflow (plans/master-plan.md exists AND the repo's CLAUDE.md contains the research-plans marker) — when a session starts there, when executing analysis or data work, when a decision point arises with the researcher, when work deviates from an execution plan, or when the researcher mentions the master plan, an execution plan, or the decision log. Not for software project planning, and not for repositories without both markers.
---

# Managing Research Plans

## Overview

Dual-tracking: **the researcher plans and decides; you carry the bookkeeping.** The project keeps a lightweight master plan (a roadmap with a components tracker), one versioned execution plan per component, and an append-only decision log. Your job is to keep those three artifacts truthful without the researcher having to think about them.

## When NOT to use (hard gate)

This skill applies only when **both** opt-in markers exist:

1. `plans/master-plan.md` containing `<!-- research-plans:master-plan -->`
2. The repo's `CLAUDE.md` containing `<!-- research-plans:start -->`

If either is absent, this workflow does not apply. Stay silent about it, never create `plans/` uninvited, and never suggest initializing unless the researcher asks. A stray copied `master-plan.md` without the CLAUDE.md marker does not count as opt-in. For software implementation plans, use superpowers writing-plans instead.

## Core pattern

**Session start.** Read `plans/master-plan.md`, then the latest version of the execution plan for whichever component the work touches (`plans/execution/<NN-slug>/`, highest `vN.md`).

**During work.**
- Surface interpretive choices (variable selection, case exclusions, coding rules, model specification) to the researcher *before* acting. Do not decide research questions, analytical choices, or interpretation on the researcher's behalf.
- Append to `plans/decision-log.md` **as decisions happen** — when you ask a clarifying question, when the researcher sets or changes scope, when you make a non-trivial interpretive call (flag it), or when a surprising result changes what happens next. Use the entry format in `templates/decision-log.md`, with a real timestamp (`date +"%Y-%m-%d %H:%M"`). If unsure whether to log: log it.
- If work is about to exceed what the current plan covers, pause and say so. Either the researcher rescopes the task, or you draft a new plan version. Do not drift.

**After execution work.**
- Update the component's row in the master plan tracker (status + one-line outcome) when there is real evidence of progress (outputs on disk, commits), and update `Last updated:`.
- If execution deviated materially from the plan, propose `v<N+1>.md` with a `Supersedes` line stating what changed and why. The researcher approves and signs before it is written.
- `/research-plans:sync` is the explicit checkpoint for all of this; use its late-capture protocol if logging was missed mid-session.

## Conventions

- **Versions are immutable.** `v1.md, v2.md, ...` are never overwritten or edited. Before writing any version, compute the next unused number and refuse to write over an existing file. Deviations are recorded, never hidden — especially the improvised ones.
- **The log is append-only and real-time.** Never backfill at the end of a session. Late captures happen only via `/research-plans:sync` and carry the `(late-captured at sync)` label.
- **The master plan stays light.** One line of outcome per component; detail lives in execution plans and the log. Do not let sync bloat it.
- **The plan is not a preregistration.** It is designed to be revised openly; revision is the process working, not a failure.
- **Researcher signs.** Every execution plan version ends with a sign-off line. Jointly produced, but committed by the researcher.
- **Native plan mode.** If the researcher uses Claude Code's plan mode anyway, copy the approved plan into the component's next version slot so the repo record stays complete.
- **Commits.** After plan versions, log milestones, or tracker changes, suggest a short commit (e.g., `plan: 02-analysis v2 — switched to multilevel after ICC check`). Do not commit without the researcher's go-ahead.

## Quick reference

| Artifact | Path | Rule |
|----------|------|------|
| Master plan | `plans/master-plan.md` | Tracker + context; one-line outcomes |
| Execution plans | `plans/execution/<NN-slug>/vN.md` | One component each; versions immutable |
| Decision log | `plans/decision-log.md` | Append-only, timestamped, real-time |
| Drafts | `plans/execution/<NN-slug>/.draft-vN.md` | Unsigned, mutable, gitignored; deleted on sign-off |
| Saved reviews | `plans/reviews/<NN-slug>-vN.md` | Rubric scorecards; prose and JSON fence agree |
| Board snapshot | `plans/board.html` | Read-only export; regenerate, never hand-edit |

| Command | Purpose |
|---------|---------|
| `/research-plans:init` | Opt a project in (creates the artifacts) |
| `/research-plans:plan` | Scope next component, author its execution plan |
| `/research-plans:sync` | Post-execution checkpoint: tracker, log, revisions |
| `/research-plans:review` | Score a plan against `references/plan-rubric.md` |
| `/research-plans:status` | Render tracker, flag drift |
| `/research-plans:board` | Browser board: tracker, plans + diffs, timeline, scorecards; live annotation or static export |

Judgment criteria live in `references/`: `plan-rubric.md` (quality scoring), `split-criteria.md` (when a plan is too big), `explore-before-planning.md` (bounded data exploration before authoring).

## Common mistakes

- **Backfilling the log** to look thorough. A reconstructed log is worse than a sparse one.
- **Editing an existing version** "to fix a typo." Versions are evidence; new version or nothing.
- **Deciding for the researcher** because the choice seems obvious. Obvious choices are cheap to confirm and expensive to unwind.
- **Updating the tracker without evidence.** Status changes follow artifacts (outputs, commits), not optimism.
- **Letting exploration become analysis.** Bounded exploration informs a plan; results worth keeping belong under a signed plan.
