# Sign-at-execution: slim owned gate, lazy sign-off policy, post-execution amendments

Date: 2026-07-18
Status: draft for codex review
Origin: the p2p trailer-in-draft failure (napkin Domain Notes 2026-07-18) prompted a comparison with plannotator's approval model. Four decisions were locked with BK via AskUserQuestion rounds; this spec records them and the design that follows.

## 1. Problem

Approval in research-plans is a stateful, board-mediated transaction: draft on disk, persistent server with a frozen boot payload, content-hash staleness checks, trailer guards, forgery-protected tickets, exit-code routing, and relaunch choreography. Each guard is individually justified, but together they make the approval moment the plugin's largest edge-case surface (frozen-payload approve, trailer-in-draft 400, stale-draft 409, gate-timeout recovery routing, `--gate-batch`/`--allow-single`). plannotator demonstrates the opposite pole: approval as a near-stateless one-shot browser decision bound to the moment it matters. Separately, the click burden is a policy problem independent of mechanism: today every plan version wants a human sign-off at authoring time (v1 at `/plan`, every revision at `/sync`, every adopt batch), which BK finds too heavy.

## 2. Decisions locked (BK, 2026-07-18)

1. **Board role:** approval moves out of the board; the board keeps everything else (tracker, plan reading + diffs, results, reports, scorecards, timeline, sharing, and its other mutating routes: reopen, verdict, review requests, model profile).
2. **Mechanism:** a slim owned one-shot gate UI evolved from the existing gate machinery — not a plannotator dependency, not a native plan-mode hook.
3. **Policy:** sign at execution, not authoring. Drafts accumulate gate-free; the gate fires once per component at the point of consequence. `/sign` exists for optional early commitment.
4. **Post-execution revisions:** auto-recorded amendments with an honest non-approval trailer; no gate, no click. Re-execution gates the amended content into a new signed commitment.

## 3. Semantics — three rules

1. **`Signed off: <name>, <date>` appears iff a human clicked a gate.** The ticket/exit-code machinery keeps this mechanically unforgeable (signoff_gate.py forgery guard :245, check_ticket :60 — both unchanged).
2. **`Amendment recorded after execution, <date>` appears iff the system auto-finalized a post-execution revision.** It claims recording, never approval, so no human interaction is required and no honesty is lost. sync.md's doctrine survives verbatim: a recorded revision is an amendment; a silent deviation is a breach. What changes is only that recording no longer demands a retroactive signature — which was always a slightly dishonest gesture (you cannot retro-approve a deviation, only record it).
3. **Nothing executes ungated.** `/execute` targets the component's latest version. If that version is an unsigned draft or an amendment, the slim gate fires on its content first and mints the signature. A component whose latest version is already signed runs with zero clicks.

Trailer taxonomy after this change: `Signed off:` (human clicked: plan-time /sign, execute gate, adopt batch), `Amendment recorded after execution,` (auto-finalized by /sync or the execution loop's deviation remedy). No third form. Adopt keeps `Signed off:` because a human genuinely reviews and clicks there — rule 1 holds; the plan body's `Provenance: retrospective` already carries the retro honesty.

## 4. The slim gate (sign mode)

A new one-shot mode of board.py, following the existing pattern where `gate` and `batch` are payload keys (board.py:1077): payload key `sign`, same built template, App renders a dedicated **SignOffView** instead of the dashboard.

**Page content per pending draft:** rendered draft body (PlanBody), diff vs the last signed/amended version (DiffView), the draft's scorecard chips (ScorePanel — drafts are already scored at draft time per review.md step 1), the annotation layer for comment-anchored feedback, and two actions: **Approve** and **Request changes**. Batch payloads list all pending drafts with per-draft decisions (absorbs `--gate-batch`).

**Protocol — tickets for everything.** Approve re-reads the draft from disk, refuses on content-hash mismatch vs the served copy (same staleness rule as today, but the window is minutes in a one-shot page, not days in a persistent tab), then writes the same durable `.import-approved-<slug>-v<N>` ticket the batch route writes today. Request changes writes the feedback document (annotations + per-draft note). On completion (all drafts decided, or timeout, or Ctrl-C) the process exits; tickets persist, so a timeout loses nothing (the batch-mode exit contract at board.py:1511-1536 carries over: exit 0 with summary; the caller enumerates valid tickets on disk as the authoritative approved set, exactly as plan.md's batch-finalize rule already requires). The calling workflow writes each approved `v<N>.md` with the trailer; the PreToolUse hook validates the ticket as today.

**What sign mode does NOT have:** no persistent server life, no reload/second-tab reconciliation, no `/api/feedback` approve, no trailer-in-draft guard (drafts never carry trailers once the template placeholder is removed — §9), no relaunch choreography. Recovery from any interruption is: relaunch the slim gate (`/sign`), never the persistent board.

**The hook gate remains the backstop.** A direct `v<N>.md` write without a ticket still triggers signoff_gate.py's interactive blocking gate; that interactive fallback now serves the SignOffView (single-draft sign payload) instead of the full board, and keeps its existing exit-code protocol (it is mid-Write; exit 2 timeout, exit 0 authorize). Two protocols remain, as today — tickets for planned flows, exit code for the backstop — but both now share one UI.

## 5. Command flow changes

- **`/plan` (step 6 collapses).** Write the draft (no trailer), run the review scoring on it, stop. Message: "draft ready — it signs at `/execute`, or run `/sign` to commit it now." The post-finalize chain becomes a post-draft chain: offer execution now; accepting routes into `/execute`, where the gate fires — so the common case "plan it, run it" is still exactly one browser decision, now positioned at consequence. Opening the board to read/annotate the draft stays available and optional; it is review, not approval.
- **`/execute` (entry check becomes the gate site).** "Latest version" means the highest N across the component's `v<N>.md` files and `.draft-v<N>.md` (a well-formed pending draft always carries N = signed max + 1, per the existing numeric-newest rule). Per component, after resolving the row: latest version is a signed `v<N>.md` → proceed as today. Latest is a pending `.draft-v<N>.md` or an amendment `v<N>.md` → launch the slim gate on that content; Approve mints the ticket, the workflow writes the signed version (for an amendment, the ticket is hashed over the amendment's content and authorizes writing `v<N+1>.md` with the signature trailer — normalize_plan's trailer invariance (§7) makes this the same hash), then the standard execute prompt (execution-loop.md) runs unchanged. Request changes → revise the draft → gate relaunches within the flow. Gate timeout or undecided → that component is skipped with "re-run /execute or /sign"; other batch components proceed.
- **`/sync` (step 6 loses its board choreography).** Material deviation → build the revision draft exactly as today (Supersedes line, provenance marker, drafting-trail snapshots), score it, then **auto-finalize** it as `v<N+1>.md` with the amendment trailer. No board open, no click, tracker untouched. The finalize write passes the hook via the amendment path (§7).
- **`/adopt` (keeps its review moment, loses the wizard plumbing).** The batch review room becomes the slim gate in batch mode. `--gate-batch` and `--allow-single` disappear; any count of drafts is one sign session. Approved plans get `Signed off:` trailers as today; unapproved stay drafts (signable later via `/sign` — deferred adoption no longer needs a special resumed-batch dance).
- **`/sign` (new, small).** Scans components for pending drafts (optionally scoped to one component argument), launches the slim gate (single or batch), then writes approved versions from tickets and runs the scoring migration. This is the deferred/cross-session approval path replacing the in-board Approve button, and the early-commitment path (sign before sharing with a collaborator, or to preserve the pre-registration-style commit-before-execution flag — see §8).
- **`/board`.** Loses the approval role; everything else unchanged.

## 6. Board changes (dashboard side)

Delete: the Approve/Request-changes actions and their `/api/feedback` decision routing (board.py ~1280-1330), the trailer-in-draft 400 guard (:1316) and its batch twin (:1441), the stale-approve exit-4 relaunch path, and the approve→signoff-order→relaunch choreography in board.md. The persistent board keeps its other mutating routes untouched (reopen, verdict, review requests, model profile) and keeps annotation → collect feedback loops (review, not approval).

Add: trailer-derived plan badges — `signed ✓` vs `amended △` — surfaced in PlanReader header, Tracker, and Timeline where signed-state already shows; a pending draft shows "pending — signs at /execute or /sign" instead of an approval affordance. Both the Python payload side and the TS parse side must learn the amendment trailer (the payload/parse duplication rule applies: payload_files and allFiles/parse.ts change together).

## 7. Enforcement changes (signoff_gate.py)

- **normalize_plan (:38)** learns to strip a trailing amendment trailer exactly as it strips a trailing `Signed off:` line. Consequence: hashes are invariant across draft → amendment → signed forms of the same content, so existing check_ticket logic covers the amendment-to-signed re-commitment with no new hash machinery.
- **New allowed path — amendment writes.** A `Write` of `plans/execution/<slug>/v<N>.md` passes without a ticket iff ALL hold: (a) the file does not already exist (immutability of existing versions is untouched — vN.md is never edited); (b) `v<N-1>.md` exists (amendments are revisions of an executed plan, never a first version — v1 always goes through a gate); (c) the content's final trailer is the amendment form, and after normalize_plan strips that trailer the remaining text does not itself end in a `Signed off:` or amendment line — no trailer stacking, so an amendment write can never smuggle a signature line into trailer position. Forgery analysis: the only claim an amendment trailer makes is "this revision was recorded post-execution" — a claim the agent is the legitimate author of. It never claims human review; the board badges it `amended △`, never `signed ✓`; and executing it still requires a human gate. There is nothing to forge.
- **Signature writes:** unchanged in every respect (ticket validation, forgery guard on `.import-approved-*`, interactive backstop gate — which now opens the SignOffView).

## 8. Scoring and integrity flags

review.md's machinery already fits: drafts are scored at draft time (step 1 resolves drafts; step 4 always rescored), and the sign-off migration rewrites `planPath` draft→signed and skips rescoring. The trigger list "after a sign-off (by /plan, /sync, /adopt, or a board Approve)" becomes "after a sign-off (by /sign, the /execute gate, /adopt) or an amendment finalize (/sync)". Amendment versions get scored on finalize like signed ones.

The `uncommitted` integrity flag ("plan not committed before its governed work") keeps working: the execute prompt already commits the freshly signed plan before running (execution-loop.md, execute-prompt part 1), so the sign-at-execution flow satisfies it naturally. Note the flag becomes *easier* to satisfy than today, not harder: signing and committing now both sit immediately before execution. `unrecorded-deviation` also keeps working and gets sharper: with recording made free (no click), an unrecorded deviation is less excusable.

## 9. Template fix (rides along)

`templates/execution-plan.md` currently ends with a literal `---` + `Signed off: <researcher name>, <YYYY-MM-DD>` placeholder — the direct cause of the p2p trailer-in-draft failure. Remove it; the trailer is appended only by the workflows at version-write time. With drafts structurally trailer-free, the slim gate needs no trailer guard at all.

## 10. What this deletes (edge-case ledger)

Frozen-payload approve semantics and its 409 stale-draft dance; trailer-in-draft guards (both routes); `--gate-batch` + `--allow-single` and the resumed-batch special cases; gate-timeout recovery routing into the persistent board (the SCR-3/4 recovery story simplifies to "relaunch /sign"); the plan.md/sync.md board-approve choreography paragraphs; the in-board Approve surface and its rescoring trigger. The persistent board's remaining POST routes and their guards stay as-is.

## 11. Migration and compatibility

No data migration. Existing signed `v<N>.md` files remain valid and render as `signed ✓`. Existing pending drafts simply wait for `/sign` or `/execute`. Old amendment-free projects have no amendment trailers to parse (parser treats absence as today). Ships as one release: command prompt edits, board template rebuild (npm run build → committed template), signoff_gate.py change, new commands/sign.md, template trailer removal, docs (reference.md, board.md). Removing `--gate-batch` is a CLI-flag break with no known external consumers; project napkins that memorized the old flow (ai-network-survey pattern) get the same treatment as the v0.16 gate-explicitness release — update guidance after release.

## 12. Resolved design calls

- `/execute` runs the **latest** version, gating it if unsigned; it never silently falls back to an older signed version.
- Gate-then-execute-prompt ordering: the slim gate signs first, then the standard one-question execute prompt runs unchanged. Folding execute consent into the gate's Approve button (an "Approve & execute" variant) is a possible future slimming, deliberately out of scope — it would put a terminal-side consent (commit + model + report) into a browser button.
- Adopt keeps `Signed off:` (rule: trailer form records what actually happened — a click).
- Sign mode uses tickets for all planned flows; the hook backstop keeps its exit-code protocol. One UI, two transports, both pre-existing.

## 13. Non-goals

No plannotator plugin dependency; no ExitPlanMode/PermissionRequest hook; no changes to reopen/verdict/review/model-profile board routes; no changes to sharing/hosted flows; no per-project sign-off policy setting (one policy: sign at consequence); no durable seed-queue redesign.

## 14. Testing implications (sketch, for the plan)

signoff_gate: amendment-path unit tests (create-only, v1 refused, missing v<N-1> refused, signature-trailer-smuggling refused, normalize invariance across all three trailer forms). board.py: sign-mode payload shape, ticket write + hash-mismatch refusal, batch decisions, timeout-exits-0-with-tickets. Board TS: SignOffView render, badge derivation from trailers, pending-chip. Command-level: plan-ends-at-draft, execute-gates-pending-draft, sync-auto-amends, adopt-batch-via-sign-mode. Contract: template has no trailer; parse.ts recognizes both trailers.

## Revision history

- rev 1 (2026-07-18): initial spec from the brainstorm; decisions locked with BK (board role, slim gate, sign-at-execution, amendments). Grounded against board.py:1077/1280-1330/1356/1397/1511-1536, signoff_gate.py:38/60/245, plan.md step 6, sync.md step 6, execute.md step 1, execution-loop.md execute prompt, review.md steps 1/4, execution-plan.md template tail.
