---
description: Score an execution plan against the plan-quality rubric, with a split assessment
argument-hint: [plan path or component name/number]
allowed-tools: Read, Glob, Grep, Bash(git:*), Bash(ls:*)
---

Score one execution plan against the rubric at `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/references/plan-rubric.md`. Requires an initialized project; if `plans/master-plan.md` is absent, say so and stop.

1. **Resolve the target.** `$ARGUMENTS` may be a path or a component name/number; default is the latest version of the `in progress` (else most recently `planned`) component. Read the plan and, for the property items, gather git evidence: `git log --follow --format='%ad %s' -- <plan path>` for commit timing, the component directory for version history, and `plans/decision-log.md` for engagement traces.

2. **Score all 14 items** exactly as the rubric prescribes:
   - typed evidence per item — quoted plan text for content items; commit dates, version files, or log entries for the property items (2, 3, 11);
   - `unknown` where evidence is unavailable (say why: not committed yet, no git);
   - `N/A` where the rubric allows it; applicable max shrinks by 2 per N/A.
   - Judge against the engagement gradient honestly: generic-but-tidy plans score low on items 8–10 even when complete. Do not reward ornamental rationale.

3. **Report in chat** (do not write files unless the researcher asks):
   - one line per item: score, evidence, justification;
   - raw score / applicable max, percentage, band (below 50% revise before executing; 50–75% execute and address flags; above 75% strong);
   - the **top three concrete revisions** that would most improve the plan, each actionable ("add a Why for the DV choice grounded in the codebook", not "improve engagement");
   - a mandatory **Split assessment**: item 14 elaborated per `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/references/split-criteria.md` — either "right-sized" with a reason, or the concrete proposed split.

4. **If the researcher accepts a revision or a split, that is a decision** — append it to `plans/decision-log.md` (real timestamp), and route the change properly: plan revisions go through a new signed version (see `/research-plans:sync` step 6 semantics — never edit `vN.md`), splits go through tracker rows.
