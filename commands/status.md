---
description: Show the project tracker and flag drift between the master plan and reality
allowed-tools: Read, Glob, Grep, Bash(git:*), Bash(ls:*), Bash(date:*)
---

Render the current state of the project and reconcile the master plan against reality. Read-only: report, do not fix (offer `/research-plans:sync` for fixes). Requires an initialized project; if `plans/master-plan.md` is absent, say so and stop.

1. **Render the tracker.** Show the Components table from `plans/master-plan.md` with its `Last updated:` date, plus a one-line summary (components by status).

2. **Reconcile against reality.** Flag:
   - execution plan directories under `plans/execution/` with no tracker row;
   - tracker rows whose Execution plan link points at a missing file;
   - components `in progress` with no git activity for 14+ days (`git log --since`); **no-git fallback:** if not a git repository, use file modification times and note the weaker evidence;
   - a decision log that has stayed empty while execution plans exist (possible logging gap);
   - unsigned plan versions (no sign-off line).

3. **One suggested next action.** End with a single concrete suggestion — the next `not started` component to plan, a stale component to sync, or a flagged drift to resolve — and which command does it.
