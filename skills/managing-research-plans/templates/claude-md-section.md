<!-- research-plans:start -->
## Research plans workflow

This project uses the research-plans workflow (https://github.com/letitbk/research-plans). These rules apply to every session in this repository:

1. At session start, read `plans/master-plan.md`, then the latest version of the execution plan for whichever component the work touches (`plans/execution/<NN-slug>/`).
2. Execution plans are versioned `v1.md, v2.md, ...` and are **never overwritten or edited**. A revision is a new file with a `Supersedes` line explaining what changed and why.
3. Append entries to `plans/decision-log.md` **as decisions happen**: when you ask a clarifying question, when the researcher sets or changes scope, when you make a non-trivial interpretive call (flag it), or when a surprising result changes what happens next. Do not backfill at the end of a session.
4. Surface interpretive choices (variable selection, case exclusions, coding rules, model specification) to the researcher **before** acting on them. Do not decide research questions, analytical choices, or interpretation on the researcher's behalf.
5. After execution work, update the Components table in `plans/master-plan.md`. Keep Outcome / notes to one line per component.
6. If work is about to exceed what the current execution plan covers, pause and tell the researcher. Propose a new plan version rather than drifting.

The `managing-research-plans` skill (from the research-plans plugin) has these conventions in depth. If mid-session logging was missed, `/research-plans:sync` is the recovery checkpoint.
<!-- research-plans:end -->
