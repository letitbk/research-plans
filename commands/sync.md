---
description: Post-execution checkpoint — update the tracker, catch unlogged decisions, version the plan if execution deviated
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, Bash(git:*), Bash(ls:*), Bash(date:*)
---

Reconcile the plan artifacts with what actually happened. Skill context: `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/SKILL.md`. Requires an initialized project (`plans/master-plan.md` with its marker); if absent, say so and stop.

1. **Gather the evidence.** What happened this session (your own context), plus `git log`/`git diff` since the last sync or plan commit, plus outputs on disk. **No-git fallback:** if this is not a git repository, rely on session context and files only, and say that git evidence was unavailable.

2. **Compare against the plan.** Read the latest `vN.md` for each component touched. Classify what happened: within plan / minor divergence / material deviation (a Scope decision changed, a build step was replaced, verification differed, new work outside Out of scope).

3. **Update the tracker.** For each touched component: status change only with evidence (outputs, commits), one-line outcome note (one line — detail lives elsewhere), refresh `Last updated:`.

4. **Late-capture protocol for the decision log.** List the decision points you can identify from this session that were never logged. **Ask the researcher to confirm each one** — do not reconstruct silently, and never infer decisions from git alone. Append only confirmed items, each explicitly labeled, e.g.:

   `## 2026-07-02 16:40 (late-captured at sync)`

   Entries keep the standard Context / Question / Response / Effect format. Never write a late capture as if it had been logged in real time, and never touch existing entries. Decisions from *earlier* sessions stay unlogged — note the gap to the researcher instead of backfilling it.

5. **Split flag.** If execution revealed the component has become multi-component (per `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/references/split-criteria.md`), say so and propose the split as tracker rows.

6. **Version on material deviation.** If step 2 found material deviation, write the proposed revision to `plans/execution/<NN-slug>/.draft-v<N+1>.md` (resume an existing draft rather than overwriting it): copy the current version, apply the changes, add the `Supersedes: vN — <what changed and why>` line. Walk the researcher through the diff — offer `/research-plans:board <NN-slug>` to review the vN↔draft diff in the browser. Only after the researcher approves and signs, write `v<N+1>.md` (**overwrite guard:** compute the next unused version number; if the target exists, stop and ask) and delete the draft. `vN.md` is never edited — not even typos.

7. **Suggest a commit** naming the change, e.g. `plans: sync — 02-analysis done; v2 supersedes v1 (ICC check)` (do not run without approval).
