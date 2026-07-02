---
description: Scope the next component and co-author its execution plan
argument-hint: [component name or number]
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, Bash(git:*), Bash(ls:*), Bash(date:*), Bash(mkdir:*)
---

Author an execution plan for one component, jointly with the researcher. Skill context: `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/SKILL.md`. This command requires an initialized project (`plans/master-plan.md` with its marker); if absent, say so and stop — suggest `/research-plans:init`.

1. **Pick the component.** Read `plans/master-plan.md`. If `$ARGUMENTS` names or numbers a component, use it; otherwise propose the first `not started` row (table order is the default sequence) and confirm.

2. **Scope check before authoring.** Judge the component against `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/references/split-criteria.md`. If it spans independent parts, propose the split first: new named components as tracker rows, then plan only the one being worked on next.

3. **Offer bounded exploration.** If the component is data-facing and the data has not been explored, offer a short, read-only exploration per `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/references/explore-before-planning.md` before authoring. Findings feed the Scope decisions table; surprises go to the decision log.

4. **Co-author through dialogue, not generation.** Work dimension by dimension through the substantive choices (sample, measures, model or method, robustness, outputs — whatever fits the component), using AskUserQuestion. For each choice:
   - present the live options with trade-offs,
   - **require a reason** — the Why column is the point of the artifact,
   - **push back on pure agent defaults**: if the researcher waves a choice through, say what the default assumes and ask if that assumption holds here. Draw the researcher's knowledge out; do not substitute your own.
   - Append decision-log entries **as the dialogue happens** (real timestamps via `date +"%Y-%m-%d %H:%M"`), not afterward.

5. **Write the plan.** Determine `NN` (next number in `plans/execution/`) and a short slug. **Overwrite guard:** the target is `plans/execution/<NN-slug>/v1.md`; if that file already exists, stop and ask — never overwrite any `vN.md`. Fill the template at `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/templates/execution-plan.md`: all seven sections (Files to reuse only if real), no Supersedes line for v1, researcher's choices and reasons in the Scope decisions table. What goes in: the choices and their reasons. What stays out: speculation about results, agent boilerplate.

6. **Sign-off.** Read the finished draft back in brief. On the researcher's approval, add the sign-off line with their name and today's date, write the file, update the component's tracker row to `planned` with a link to the plan, and update `Last updated:`.

7. **Suggest a commit** such as `plan: <NN-slug> v1` (do not run without approval).
