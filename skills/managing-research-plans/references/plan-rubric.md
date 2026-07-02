# Plan Rubric — Threshold and Grade

**v0.2** (rebuilt on "What Counts as a Plan," June 2026). Scoring anchors remain provisional; treat results as structured feedback, not verdicts on the researcher.

The definition this rubric implements:

> A plan is a written, prospective, revisable, jointly-produced **contract** that specifies what a piece of research will do, why, and how success will be judged: binding enough to govern and check an agent's execution, open enough to be revised when the data push back.

And its amendment rule:

> A recorded revision is an **amendment**: legitimate, expected. A silent deviation is a **breach**. Preregistration freezes the contract and treats every later change as a deviation; the plan keeps it amendable and treats only undisclosed change as a deviation.

Review happens in two stages. **Stage 1 (threshold)** asks: is this a plan at all? Pass/fail checks derived from the definition's six property tests and four constitutive elements. A document that fails is not a bad plan; it is not a plan yet — a to-do list, a prompt log, a frozen preregistration, or a retrospective methods section. **Stage 2 (grade)** asks the reading-for-engagement question the definition deliberately excludes: how good a plan is it? Grading happens only after the threshold is passed.

Two rules apply throughout. **Form is free; extractability is required** — threshold content may live anywhere in the artifact; if a template section is missing but the content is extractable elsewhere, the check passes and the missing section is named as an improvement. **Recommended elements never disqualify** — Context/motivation, Out of scope, and Files to reuse strengthen a plan; their absence weakens the grade, never the threshold.

## Stage 1 — Threshold (T1–T9, pass / fail / N/A / unknown)

The four constitutive elements are T1–T4. The six property tests map onto the checks as noted (Verifiable is split: findings-validity is T4, execution-fidelity is T7). No check is counted twice.

**T1. Goal + success criteria** *(element 1; grounds Goal-driven and Verifiable — plan text)*
Passes when an objective AND the criteria for judging success are extractable anywhere in the artifact.
Fails like: "No extractable goal or success criteria — nothing says what this work is for or how success will be judged. A task list, not a plan yet."

**T2. Scope decisions with reasons** *(element 2; carries ownership — plan text)*
Passes when each substantive choice has a stated reason. A weak or generic reason passes here (it dies at G1); an empty Why, or a reason that merely restates the choice, counts as missing.
Fails like: "Choices without reasons — no reasons and no success criteria are what make a to-do list not a plan."

**T3. Approach / build steps** *(element 3; the executable altitude — plan text)*
Passes when a stepwise account of what will be done is extractable.
Fails like: "A statement of intent, not a plan yet."

**T4. Verification plan** *(element 4; Verifiable-b, findings validity — plan text)*
Passes when at least one named check exists with where it applies, AND the Goal's success criteria are not left wholly uncovered. Full coverage and depth are graded at G6, not here.
Fails like: "Verification is owed but never named — 'review the results' names no check and no place it applies. The plan does not verify; it names where verification is owed."

**T5. Readable cold** *(property: Readable, human and agent — plan text)*
Passes when a competent reader or agent WITHOUT the producing session could perform the T1–T4 extraction. This is what makes the plan a boundary object.
Fails like: "Unintelligible without the session that produced it. Form is free; extractability is required."

**T6. Goal-driven** *(property: Goal-driven — plan text)*
Passes when every build step traces back to the goal; nothing in the plan is unmotivated by it.
Fails like: "Steps do not trace to a research goal — this reads as a history or backlog of repository actions, not research activity in service of a question."

**T7. Executable and fidelity-checkable** *(properties: Executable two-altitude + Verifiable-a — plan text)*
Passes when the build steps are precise enough that "did the agent do this?" has an answer. The framing and scope may guide without determining — do not fail a high-level Approach when the Build steps are precise.
Fails like: "'Did the agent do this?' has no answer — steps too indeterminate to check execution fidelity."

**T8. Prospective** *(property: Prospective — git/artifact evidence; three-tier)*
- `pass`: the plan version was committed (sign-off + git timestamp) before the work it governs.
- `N/A`: **only when no governed work has occurred yet.** A fresh, unexecuted plan can PASS the threshold cleanly, with the advice "commit before executing to make prospectivity checkable."
- `unknown`: governed work EXISTS but the evidence is missing (no git history, no timestamps). **Unknown blocks a PASS** — the verdict becomes UNDETERMINED, naming the missing evidence.
- `fail`: evidence shows the plan was written or reshaped after its outputs existed.
Fails like: "No committed prospective specification — a prompt log or a retrospective methods section, not a plan."

**T9. Revisable — amendments recorded** *(property: Revisable — git/artifact evidence)*
Passes when deviations produced a recorded new version with a trigger, and earlier versions are untouched. `N/A` when unexecuted or no deviation has occurred.
Fails like: "Silent deviation — execution departed from the plan with no recorded amendment. A recorded revision is an amendment; a silent deviation is a breach." Also fails when versions were edited in place, or when the artifact forbids revision (a frozen preregistration fails Revisable).

### Threshold verdicts

- **PASS** — no check `fail`, no check `unknown` (`N/A` never blocks).
- **UNDETERMINED** — no `fail`, but at least one `unknown`: name the missing evidence ("commit the plan to make prospectivity checkable"), withhold the grade until it is resolved.
- **FAIL** — any check `fail`: report each failure with its verdict language, name the nearest near-miss archetype where one fits (to-do list / prompt log / frozen preregistration / retrospective methods section), give a concrete fix list, include the split assessment (it advises the redo), and **stop — no grade, no percent.**

Anti-gaming note: boilerplate can pass the threshold **by design** — the threshold tests existence, not quality. Hollow goals and generic reasons are punished at Stage 2 (G1, G2, G6 score 0, which lands in the lowest band). Do not inflate threshold checks into quality judgments; T4's "named check + where it applies" is the deliberate structural backstop.

## Stage 2 — Grade (G1–G8, 0/1/2, only after a threshold PASS)

Evidence is required for every score: quoted plan text for text items; commit dates, version files, or log entries for artifact items. `N/A` where noted; `unknown` where evidence is unavailable. Excluded items (N/A or unknown) shrink the applicable max by 2 each; report **raw / applicable max** and the percentage, and list exclusions with reasons.

**G1. Decisions are specific, reasoned, and grounded** — *plan text.*
- 2: Choices diverge from obvious defaults where the researcher had reasons; reasons are particular to this project.
- 1: A mix; some decision points are clearly defaults accepted without comment.
- 0: Decisions are uniformly the agent's defaults.

**G2. Domain knowledge is non-generic** — *plan text.*
Reward concrete project, data, and literature grounding; do not reward ornamental rationale.
- 2: The plan contains things only someone close to this data, field, or setting would know (instrument quirks, known coding traps, specific disputes in the literature).
- 1: Some genuine grounding amid boilerplate.
- 0: "Domain knowledge" generic enough to be reproducible from an agent's training.

**G3. Choices are consequential** — *plan text.*
- 2: Remove the researcher's choices and the analysis would be materially different.
- 1: Some consequential choices, some cosmetic.
- 0: Human touches are cosmetic (renaming, formatting, tone).

**G4. Revisions are substantive amendments** — *git/artifact + plan text. N/A for an unexecuted v1.*
- 2: Amendments respond to real execution events, with triggers recorded; the version history reads as a research process.
- 1: Amendments exist but triggers are vague.
- 0: Deviation without amendment, or contrived edits that perform revision without changing anything.

**G5. Readability quality** — *plan text; the gradient above T5's floor.*
- 2: A coauthor could read it cold and follow both what and why; no dependence on unstated background.
- 1: Mostly readable alone; a few references only the author would understand.
- 0: Barely clears the threshold; heavy reconstruction needed.

**G6. Verification checkability** — *plan text; the gradient above T4's floor.*
- 2: Concrete routines — executable tests, data audits, citation validation, named outputs a human will review — covering the success criteria.
- 1: Some concrete checks, some hand-waving.
- 0: Minimally named checks only; coverage of the success criteria is thin.

**G7. Out of scope genuinely constrains** — *plan text. (Recommended element: absence weakens, never disqualifies.)*
- 2: Names the tempting adjacent work this component will not do.
- 1: Present but generic ("no additional analyses").
- 0: Empty or missing.

**G8. Right-sized** — *plan text; see `split-criteria.md`.*
- 2: One coherent component, independently completable and verifiable; a human can hold the whole plan in mind.
- 1: Borderline; one section is doing double duty.
- 0: Spans multiple independent components. **A 0 here triggers the split recommendation.**

Max 16. Bands (on the percentage of the applicable max): **below 50%** — revise before executing; **50–75%** — fine to execute, address the flagged items; **above 75%** — strong plan.

## Reporting format

Line 1 is the threshold verdict:
- `Threshold: PASS — 9/9 (T8 N/A: unexecuted; T9 N/A: no deviation yet)`
- `Threshold: UNDETERMINED — T8 unknown: work exists but the plan is uncommitted; commit it to make prospectivity checkable`
- `Threshold: FAIL — not a plan yet (T1: no success criteria; T4: verification never named)`

On FAIL: per-failure verdicts, the nearest near-miss archetype, a concrete fix list, the split assessment. Stop.
On UNDETERMINED: the missing evidence and how to supply it. Stop (no grade).
On PASS: `Grade: <raw>/<applicable> (<pct>%) — <band>`, one row per item (score, evidence, one-line justification), exclusions with reasons, the top three concrete revisions, and the split assessment (always mandatory).
