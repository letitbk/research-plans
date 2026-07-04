---
description: Open the board — browser dashboard for the tracker, plans with version diffs, decision timeline, and rubric scorecards; annotate live or export a shareable snapshot
argument-hint: [component name/number | --export]
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, Bash(python3:*), Bash(git:*), Bash(ls:*), Bash(date:*)
---

Open the project board, or export a shareable snapshot. Skill context: `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/SKILL.md`. The board script is `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/scripts/board.py`; it needs only python3.

1. **Gate.** Requires `plans/master-plan.md` with its marker; if absent, say so and suggest `/research-plans:init`. Stop.

2. **Recover pending feedback first.** If `plans/.board-feedback.md` exists, a previous board session was interrupted before its feedback was routed. Run `python3 <script> --collect`, route what it prints (step 5), and only then consider opening a new board.

3. **Resolve the mode.** If `$ARGUMENTS` contains `--export`, go to step 7. If it names a component (name or number), resolve it to its `NN-slug` from the master plan for `--focus`. A `NN-slug:rN` argument (from /research-plans:results) passes through to `--focus` verbatim — it opens the board directly on that results bundle.

4. **Serve.** Run exactly:
   `python3 ${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/scripts/board.py [--focus NN-slug]`
   **in the background** if the harness supports background bash (completion re-invokes you with its output); otherwise run it in the foreground with a 10-minute timeout. Tell the researcher: the board is open in their browser; annotate, then press "Send to Claude". Handle the exit:
   - **exit 0** — the feedback document is on stdout; go to step 5.
   - **exit 2** (timed out, no feedback) — tell the researcher to finish annotating and run `/research-plans:board` again; step 2 will recover their submission via the pending file.
   - **exit 130** (cancelled) — stop quietly.
   - **exit 1 with "another board is open"** — relay the message; the researcher closes the other board or asks you to re-run with `--force`.
   - If the bash call itself timed out or its output is lost, run `--collect` to retrieve the feedback.

5. **Route the feedback.** Parse the ```json board-feedback``` fence in the document (fall back to the markdown if the fence is missing or corrupt). Then:
   - **Anchored comments on a signed vN**: discuss each with the researcher. If they approve changes, write or refine `plans/execution/<NN-slug>/.draft-v<N+1>.md` — resume an existing draft rather than overwriting it; copy the current version, apply the changes, add the `Supersedes: vN — <reason>` line. Offer the board again so they can review the vN↔draft diff. Only on their sign-off write `v<N+1>.md` (overwrite guard: next unused number), add the sign-off line, and delete the draft. Never edit a signed `vN.md`.
   - **Comments on a draft**: revise the draft file directly (drafts are mutable and unsigned).
   - **General / tracker / timeline / review comments**: answer or act as appropriate.
   - **Verdict block** (`## VERDICT: ...` in the markdown; `verdict` object in the fence): apply it via `python3 ${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/scripts/results.py verdict --component <c> --version <N> --status <s> --reviewer "<git user.name>" [--comment "..."] --plan-version <latest signed vN>`. Then: on **accepted**, update the component's tracker status to `done (verified)`; on **changes-requested**, treat the accompanying result/script comments as revision instructions — fix the scripts, re-run the analysis, and capture the fix as a NEW bundle via /research-plans:results (trigger `redo-after-review`). Either way, append a decision-log entry recording the verdict.
   - **Result comments** (`[<component> rN — artifact/metric/report]`) and **script comments** (`[... lines A-B]`): these reference immutable bundle contents — never edit the bundle. Discuss with the researcher; fixes flow into scripts in the working tree and a new capture.
   - **Log the exchange.** Every submitted feedback produces decision-log entries (real timestamps via `date +"%Y-%m-%d %H:%M"`, standard Context / Question / Response / Effect format; board feedback is the Context, the researcher's comment or decision is the Response). This includes feedback the researcher reviews and declines — one entry recording that it was reviewed, no changes accepted, and why.
   - **After routing completes, delete `plans/.board-feedback.md`** if it still exists.

6. **Close the loop.** Offer to reopen the board to see the updated state. If artifacts changed, suggest a commit (do not run it without approval).

7. **Export mode.** Run `python3 <script> --export`. Then state the privacy reminder in publishing terms: committing or sharing `plans/board.html` IS publishing everything under `plans/` verbatim — treat it exactly like publishing the plans themselves (participant details and IRB specifics stay out, or export to a non-committed path instead). Suggest a commit such as `plans: export board snapshot`.
