---
description: Show the project tracker and flag drift between the master plan and reality
allowed-tools: Read, Glob, Grep, Bash(python3:*), Bash(git:*), Bash(ls:*), Bash(date:*)
---

Render the current state of the project and reconcile the master plan against reality. Read-only: report, do not fix (offer `/research-plans:sync` for fixes). Requires an initialized project; if `plans/master-plan.md` is absent, say so and stop.

1. **Render the tracker.** Show the Components table from `plans/master-plan.md` with its `Last updated:` date, plus a one-line summary (components by status).

2. **Reconcile against reality.** Flag:
   - execution plan directories under `plans/execution/` with no tracker row;
   - tracker rows whose Execution plan link points at a missing file;
   - components `in progress` with no git activity for 14+ days (`git log --since`); **no-git fallback:** if not a git repository, use file modification times and note the weaker evidence;
   - a decision log that has stayed empty while execution plans exist (possible logging gap);
   - unsigned plan versions (no sign-off line);
   - `plans/board.html` older than the newest file under `plans/` (stale snapshot — suggest `/research-plans:board --export` to regenerate);
   - master plan missing a `### Research questions` subsection (pre-v0.3 artifact — suggest `/research-plans:init` update mode);
   - component rows with an EMPTY Serves cell while research questions exist (`—` is the deliberate infrastructure marker and is never flagged);
   - Serves values naming RQ numbers that do not exist in the list;
   - an execution plan whose `Serves:` line disagrees with its master-plan row;
   - `—` overuse: a soft warning when more than half the components are `—` while research questions exist — infrastructure should be the exception, not the norm;
   - components marked `done` whose latest results bundle (`plans/execution/<slug>/results/rN/`) is pending or has a `changes-requested` verdict — unverified done;
   - `done (verified)` components where `python3 ${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/scripts/results.py changed --component <NN-slug>` reports drifted sources — the verified results no longer match outputs on disk;
   - leftover `results/.staging-*` directories (an interrupted capture — suggest resuming or removing).

3. **One suggested next action.** End with a single concrete suggestion — the next `not started` component to plan, a stale component to sync, or a flagged drift to resolve — and which command does it. Mention `/research-plans:board` for the visual version of this report.
