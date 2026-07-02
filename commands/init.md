---
description: Set up the plan-based research workflow in this project (master plan, decision log, CLAUDE.md conventions)
argument-hint: [optional: one-line project description]
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, Bash(git:*), Bash(ls:*), Bash(date:*), Bash(mkdir:*), Bash(touch:*)
---

Initialize (or update) the research-plans workflow in this project. Skill context: read `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/SKILL.md` first if you have not already.

Follow these steps in order:

1. **Resolve the project root.** If inside a git repository, the root is `git rev-parse --show-toplevel`. If that differs from the current directory, or if this is not a git repository, confirm the intended project root with the researcher before creating anything. Never nest a second `plans/` tree inside a project that already has one at its root.

2. **Check for prior initialization.**
   - If `plans/master-plan.md` already exists: switch to **update mode**. Never clobber it. Offer to (a) review and refresh the components table together, and (b) upgrade the CLAUDE.md section (step 6) if the plugin has changed. Skip steps 3–5.
   - If the repo's `CLAUDE.md` contains `<!-- research-plans:start -->` but `plans/` is missing, tell the researcher the project looks partially initialized and ask how to proceed.

3. **Short interview.** Ask the researcher (use AskUserQuestion; keep it to one round, four questions max): the research question, the data (sources, rough size, sensitivity), who is involved, and key constraints or deadlines. `$ARGUMENTS`, if provided, seeds the project description — confirm rather than re-ask.

4. **Seed the components list honestly.** Scan the repo (`git log --oneline | tail -30`, top-level directories, existing scripts and data folders) and propose an initial components list with realistic statuses — work that already happened gets `done` or `in progress`, not `not started`. For a fresh project, propose the researcher's stated phases. Keep components at the granularity of "independently completable and verifiable" (see `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/references/split-criteria.md`). Confirm the list with the researcher. If demo-style artifacts exist (`plan-versions/`, `askuserquestion-log.md`), mention them and treat them as read-only context; do not migrate or modify them.

5. **Create the artifacts** from the templates in `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/templates/`:
   - `plans/master-plan.md` from `master-plan.md` — keep the `<!-- research-plans:master-plan -->` marker on line 1, fill in project context (2–3 paragraphs from the interview), the confirmed components table, and today's date (`date +%Y-%m-%d`). Delete the Sequencing notes section unless dependencies are non-linear.
   - `plans/decision-log.md` from `decision-log.md` — header and rules only. **Never fabricate entries for work that predates initialization.** The log starts now.
   - `plans/execution/.gitkeep` — write it as an empty file with the Write tool (not `touch`), so the directory survives a git commit. Execution plans are created later by `/research-plans:plan`.

6. **Bind the conventions in CLAUDE.md.** Read `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/templates/claude-md-section.md`.
   - If the project has no `CLAUDE.md`, create one containing that block.
   - If `CLAUDE.md` exists without the `<!-- research-plans:start -->` marker, append the block to the end. Touch nothing else in the file.
   - If the marker already exists, replace everything between `<!-- research-plans:start -->` and `<!-- research-plans:end -->` (inclusive) with the current block. Never duplicate the section; never modify content outside the markers.

7. **Wrap up.** Verify on disk that every artifact from steps 5–6 actually exists, and report only what exists — if a write was denied or skipped, say so plainly. Then suggest (do not run without approval) a commit such as `plans: initialize research-plans workflow`, and point the researcher at `/research-plans:plan` to scope the first component.
