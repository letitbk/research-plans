# Plan-Quality Rubric

**DRAFT v0.1.** Scoring anchors are provisional and will be refined against real plans. Treat scores as structured feedback, not verdicts.

## How to score

- 14 items, each scored **0 (weak) / 1 (adequate) / 2 (strong)**. Maximum raw score 28.
- **Evidence is required for every score.** Each item declares its evidence type:
  - *plan text* — quote the relevant passage from the plan (or state that none exists).
  - *git/artifact* — commit dates, version files (`v1.md`, `v2.md`, ...), decision-log entries. These items cannot be scored from plan text alone. If the evidence is unavailable (no git history, plan not yet committed), score the item `unknown` and say so.
- **N/A** is allowed where a dimension does not apply (noted per item). Both `N/A` and `unknown` items are excluded from the applicable max: applicable max = 28 minus 2 per excluded item; report **raw score / applicable max** and the percentage, and list which items were excluded and why.
- Bands (on the percentage): **below 50%** — revise before executing; **50–75%** — fine to execute, address the flagged items; **above 75%** — strong plan.
- The gradient matters more than the number. A plan can pass every completeness check and still read as the agent's work with a name on top. Items 8–11 are where that shows.

## A. Plan properties (4 items)

**1. Written and self-contained** — *plan text.*
A coauthor could read the plan cold and understand what will be done and why.
- 2: Fully self-contained; no dependence on chat context or unstated background.
- 1: Mostly readable alone; a few references only the author would understand.
- 0: Unintelligible without the session that produced it.

**2. Prospective** — *git/artifact.*
The plan governs the work rather than describing it after the fact.
- 2: Plan version committed before the outputs it governs (check commit dates).
- 1: Plan and early outputs committed together; ambiguous timing.
- 0: Plan written or reshaped after results existed.

**3. Revisable, with versions tracked** — *git/artifact. N/A if execution has not yet deviated from v1.*
- 2: Deviations produced a new version with a clear "Supersedes" reason; earlier versions untouched.
- 1: Versions exist but reasons are thin or some deviations went unversioned.
- 0: Visible deviation with no revision, or earlier versions edited in place.

**4. Researcher-committed** — *plan text (+ decision log if available).*
The plan is signed, and its choices read as this researcher's.
- 2: Signed off; decisions reflect the researcher's stated reasoning.
- 1: Signed, but several decisions carry no visible researcher input.
- 0: Agent output with a name on top.

## B. Component completeness (3 items)

**5. All sections present** — *plan text.*
Context, Scope decisions, Approach, Build steps, Verification, Out of scope (Files to reuse optional).
- 2: All present and non-empty where applicable.
- 1: One section missing or perfunctory.
- 0: Two or more missing.

**6. Scope decisions carry reasons** — *plan text.*
- 2: Every substantive dimension has a chosen option and a one-line reason.
- 1: Choices listed but several reasons missing or circular ("chosen because appropriate").
- 0: Dimensions missing, or choices without reasons.

**7. Verification is checkable** — *plan text.*
- 2: Concrete routines: executable tests, data audits, citation validation, named outputs a human will review.
- 1: Some concrete checks, some hand-waving.
- 0: "Review the results" or nothing.

## C. Engagement quality (4 items)

**8. Decisions are specific, reasoned, and grounded** — *plan text.*
The test from the paper: decision points should be specific, reasoned, and grounded in what the researcher knows — not uniformly the agent's defaults.
- 2: Choices diverge from obvious defaults where the researcher had reasons; reasons are particular to this project.
- 1: A mix; some decision points are clearly defaults accepted without comment.
- 0: Decisions are uniformly the agent's defaults.

**9. Domain knowledge is non-generic** — *plan text.*
Reward concrete project, data, and literature grounding; do not reward ornamental rationale. Generic knowledge is anything reproducible from an agent's training alone.
- 2: The plan contains things only someone close to this data, field, or setting would know (quirks of the instrument, known coding traps, specific disputes in the literature).
- 1: Some genuine grounding amid boilerplate.
- 0: "Domain knowledge" is generic enough to be reproducible from training.

**10. Choices are consequential** — *plan text.*
Researcher input must materially affect the research design, evidentiary strategy, or interpretation — not merely show that a human touched the plan.
- 2: Remove the researcher's choices and the analysis would be materially different.
- 1: Some consequential choices, some cosmetic.
- 0: Human touches are cosmetic (renaming, formatting, tone).

**11. Revisions are substantive and event-triggered** — *git/artifact + plan text. N/A for an unexecuted v1.*
- 2: Revisions respond to real execution events, with reasons; the version history reads as a research process.
- 1: Revisions exist but reasons are vague.
- 0: Revisions absent despite deviation, or contrived (edits that perform revision without changing anything).

## D. Executability and scope (3 items)

**12. Another agent could pick it up** — *plan text.*
- 2: Approach and Build steps are concrete enough to execute without the authoring session.
- 1: Executable with guesswork in places.
- 0: Requires the original conversation to interpret.

**13. Out of scope genuinely constrains** — *plan text.*
- 2: Names the tempting adjacent work this component will not do.
- 1: Present but generic ("no additional analyses").
- 0: Empty or missing.

**14. Right-sized** — *plan text.*
One coherent component, independently completable and verifiable. See `split-criteria.md`.
- 2: One component; a human can hold the whole plan in mind.
- 1: Borderline; one section is doing double duty.
- 0: Spans multiple independent components. **A score of 0 here triggers a split recommendation.**

## Reporting format

For each item: score, evidence (quoted text or named artifact), one-line justification. Then: raw score / applicable max (percentage), band, and the top three concrete revisions that would most improve the plan. End with the split assessment (item 14, elaborated per `split-criteria.md`).
