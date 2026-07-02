---
description: Review an execution plan in two stages — threshold verdict (is this a plan?) then quality grade — with a split assessment
argument-hint: [plan path or component name/number]
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, Bash(git:*), Bash(ls:*), Bash(date:*), Bash(mkdir:*)
---

Review one execution plan against the rubric at `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/references/plan-rubric.md` (v0.2, two-stage). Requires an initialized project; if `plans/master-plan.md` is absent, say so and stop.

1. **Resolve the target.** `$ARGUMENTS` may be a path or a component name/number; default is the latest version of the `in progress` (else most recently `planned`) component. Read the plan; read the master plan (research questions, Serves values, and the `Initialized:` line). Gather git evidence for T8/T9: `git log --follow --format='%ad %s' -- <plan path>` for commit timing, the component directory for version history, and `plans/decision-log.md` for engagement traces. **Adoption cutoff:** evidence before the master plan's `Initialized:` timestamp (fall back to the git first-commit of master-plan.md when the line is absent) does not count against T8/T9 — no plan governed that period.

2. **Stage 1 — Threshold (T1–T9).** Run every check exactly as the rubric prescribes. Form is free: content that satisfies a check may live anywhere in the plan; when a template section is missing but the content is extractable elsewhere, the check passes and the missing section is named as an improvement. Apply T8's three-tier semantics (N/A only when no governed work exists yet; `unknown` when work exists but evidence is missing; `fail` only on evidence of retrospection).
   - **FAIL** (any check fails): report `Threshold: FAIL — not a plan yet (…)`, each failure with the rubric's near-miss verdict language, the nearest archetype (to-do list / prompt log / frozen preregistration / methods section), a concrete fix list, and the split assessment. Offer the scorecard save (step 4). **STOP — do not grade, do not report a percent.**
   - **UNDETERMINED** (no fail, ≥1 unknown): name the missing evidence and how to supply it ("commit the plan to make prospectivity checkable"). Offer the save. **STOP — grade withheld.**
   - **PASS**: proceed to Stage 2.

3. **Stage 2 — Grade (G1–G8, only on PASS).** Score each item with typed evidence: quoted plan text for text items; commit dates, version files, or log entries for G4. `N/A`/`unknown` items are excluded and shrink the applicable max by 2 each. Report raw / applicable max, percentage, band (below 50% revise before executing; 50–75% execute and address flags; above 75% strong), the top three concrete revisions (each actionable), and the mandatory split assessment per `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/references/split-criteria.md`. Judge the engagement gradient honestly: boilerplate that passed the threshold scores 0 at G1/G2/G6 — do not let a threshold pass inflate the grade.

4. **Offer to save the scorecard** to `plans/reviews/<NN-slug>-v<N>.md` using the template at `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/templates/review-scorecard.md` (schemaVersion 2: threshold block always present; on FAIL/UNDETERMINED `items: []`, null grade fields, band `"not a plan"`/`"undetermined"`; prose and JSON must agree — the board renders the JSON). If the file exists, ask before overwriting. Saved scorecards appear on the board's Reviews tab (`/research-plans:board`).

5. **If the researcher accepts a revision or a split, that is a decision** — append it to `plans/decision-log.md` (real timestamp), and route the change properly: plan revisions go through a new signed version (see `/research-plans:sync` step 6 semantics — never edit `vN.md`), splits go through tracker rows.
