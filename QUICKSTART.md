# Quickstart

This is the short path from install to your first plan-execute-sync loop. It assumes Claude Code is installed and you have a research project (new or ongoing) in a folder, ideally a git repository.

## 1. Install the plugin

In any Claude Code session:

```
/plugin marketplace add letitbk/research-plans
/plugin install research-plans@research-plans
```

Restart Claude Code. Type `/research-plans` and the five commands should appear in the menu. Use the full namespaced names (`/research-plans:init`, not `/init`, which is a different built-in command).

## 2. Initialize your project

Open Claude Code in your project folder and run:

```
/research-plans:init
```

Claude will ask a few questions (research question, data, who is involved, constraints), look at what already exists in the folder, and propose a components list. Adopting mid-project is fine: work you have already done gets marked `done` or `in progress`, and nothing is invented about the past. Then it creates `plans/master-plan.md`, `plans/decision-log.md`, and a marked section in your `CLAUDE.md`. Commit when it looks right.

## 3. Plan your first component

```
/research-plans:plan
```

Claude proposes the next component (or name one: `/research-plans:plan data cleaning`). Expect a dialogue, not a generated document. It will walk through the substantive choices one dimension at a time and ask for your reason on each. That is deliberate: the reasons are what make the plan yours. If the data has not been explored yet, it will offer a short read-only look first, which makes for much better scope decisions.

The result is `plans/execution/01-data-cleaning/v1.md` with your sign-off, and the tracker updated.

## 4. Execute, then sync

Work normally under the plan in the same or later sessions. Claude should surface interpretive choices before acting and add entries to the decision log as things happen. When a work session ends, or whenever you want a checkpoint:

```
/research-plans:sync
```

This updates the tracker, asks you about any decisions that went unlogged (they get an explicit `late-captured` label), and, if the work genuinely deviated from the plan, drafts a `v2.md` for your approval. `v1.md` is never edited. Revising the plan is the process working, not a failure.

## 5. Optional: review a plan before executing

```
/research-plans:review
```

Scores the plan against a 14-item rubric (properties, completeness, engagement quality, scope) and tells you whether the component should be split. Scores come with quoted evidence and the three revisions that would help most. The bands: below 50 percent, revise before executing; 50 to 75 percent, fine to execute but address the flags; above 75 percent, strong. The rubric is a draft; disagreements with it are useful feedback.

And `/research-plans:status` at any time shows the tracker and flags drift.

## FAQ

**My project is not a git repository.** Everything works, but the plugin loses git-based evidence (commit timing, staleness checks) and will say so. A git repository is strongly recommended since the version history is part of the point.

**I use Claude Code's plan mode.** Fine. If a plan gets approved through plan mode, Claude copies it into the component's next version slot so the repository record stays complete.

**My project is small.** Use fewer, larger components, and let the Scope decisions be a short list instead of a table. If maintaining the structure feels like more work than the project, that is real feedback; please report it.

**What about sensitive material?** `plans/` is designed to be committed and eventually shared. Keep participant details, IRB specifics, and anything else sensitive out of the plans, or in a gitignored appendix.

**Claude stopped logging decisions mid-session.** It happens; the CLAUDE.md section makes it likely but not guaranteed. `/research-plans:sync` exists exactly for this. Late captures are labeled so the log stays honest.

## Feedback

Friction, confusion, rubric disagreements, ideas: please open an issue at https://github.com/letitbk/research-plans/issues. Notes on where the workflow felt constraining or freeing are especially useful.
