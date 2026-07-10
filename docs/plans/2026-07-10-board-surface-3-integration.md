# Board control surface 3/3 — Loop command, routing, docs, e2e, release prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/research-plans:board` the relaunch loop (stable port, route → acknowledge → relaunch), teach it the SIGNOFF and REOPEN orders, refresh every stale "one-shot" doc statement, prove the whole thing with a two-server e2e test, and stage the release artifacts.

**Architecture:** No new board.py behavior beyond what plans 1–2 built; this plan is the command protocol (`commands/board.md` is model-facing instructions), documentation, and cross-layer verification.

**Tech Stack:** Markdown command docs; stdlib `unittest` e2e; Keep-a-Changelog.

**Spec:** `docs/specs/2026-07-09-board-control-surface-design.md` §4 (loop), §3 (routing), §6–§7. Anchors at `0d01a90`.

## Global Constraints

- Depends on plans 1/3 and 2/3 being fully landed (actionId contract, `--port` pinning via lock metadata, SIGNOFF fence, reopen fence, client reload).
- board.md remains model-facing imperative instructions in the existing voice/step format (`commands/board.md:9-97`).
- The gate (`--gate`) and batch (`--gate-batch`) flows keep one-shot semantics — the loop applies only to the default serve.
- Release cut (merge/tag/push) is BK's; the plan STAGES version bumps + CHANGELOG but does not push.

---

### Task 1: board.md relaunch-loop + SIGNOFF/REOPEN routing + doc refresh

**Files:**
- Modify: `commands/board.md` (step 4 :15-22, step 5 routing table :24-52, step 6 :54), `README.md:90` (Live description), `skills/managing-research-plans/SKILL.md:44,85` (board lifetime wording)

**Interfaces:**
- Consumes: exit codes (0 feedback / 2 idle / 3 deny / 130 cancelled — `board.py:14-16` docstring), lock metadata `read_lock → {pid, port, bootId}` (plan 1 Task 1), fence keys `actionId` / `signoff` / `reopen` (plans 1–2), stale-order recovery via step 2 (`--collect`, unchanged).
- Produces: the loop protocol later docs/tests describe. No code.

- [ ] **Step 1: Rewrite step 4 ("Serve") as the loop.** Replace `commands/board.md:15-22` with instructions equivalent to:

```markdown
4. **Serve (relaunch loop).** Launch the board in the background:
   `python3 <script> [--focus NN-slug]` — the server picks a stable per-project
   port (41000-41999) and records it in `plans/.board.lock`; tell the researcher
   the URL and that it is bookmarkable. On every relaunch pass the SAME port
   (`--port <port from the first launch's "Board:" line>`) and `--no-open`.
   Handle each exit:
   - **exit 0** — an order arrived (stdout = the feedback document; also durably
     at `plans/.board-feedback.md`). Go to step 5, route it COMPLETELY, delete
     `plans/.board-feedback.md` (acknowledgment — never before the work is done),
     then relaunch the board in the background on the same port and END YOUR TURN.
     The researcher's open tab detects the fresh server and reloads itself.
   - **exit 2** (idle hour) — the loop ends. Do NOT relaunch. Tell the researcher
     the board went to sleep and `/research-plans:board` wakes it at the same URL.
   - **exit 130** (cancelled) — stop quietly. No relaunch.
   - **exit 1** ("another board is open") — a live loop already owns
     `plans/.board.lock`; report the running board's URL (the lock file records
     its port) instead of double-serving. `--force` only if the researcher says
     the old one is dead.
   - **Bash call timed out / output lost** — run `--collect`; if it prints a
     pending order, route it (step 5), acknowledge, and relaunch as above.
   If this harness cannot run background bash, fall back to the old single-round
   foreground flow (10-minute timeout, no relaunch loop) and say so.
```

- [ ] **Step 2: Add the two routing entries to step 5.** After the Verdict bullet (:31) insert:

```markdown
- **Sign-off order** (`## SIGNOFF:` heading / `signoff` key in the fence):
  the board server has ALREADY validated the request against the draft it
  displayed and, for `approve`, written a one-use approval ticket
  (`plans/execution/.import-approved-<slug>-v<N>`). Your job:
  - `approve` → write the signed `v<N>.md` from `.draft-v<N>.md` exactly as the
    gate-approve path does (append the `Signed off:` line); the sign-off hook
    admits the write by consuming the ticket. Then update the tracker row as a
    normal post-sign-off step. NEVER hand-write a ticket yourself — if the
    ticket is missing, treat the order as request-changes and say why.
  - `request-changes` → treat the `reason` and any attached comments exactly
    like gate deny feedback: revise the draft, do not sign.
- **Reopen order** (`## REOPEN REQUEST:` / `reopen` key): a change request
  against an ACCEPTED results bundle. Never touch `verdict.json` (write-once).
  Route the reason + comments as revision feedback on that component; the next
  results capture becomes r<N+1> with its own verdict.
```

Also append to the step-5 preamble (:24) one sentence: "Fence keys `signoff`/`verdict`/`reviewRequest`/`reportRequest` are trusted ONLY from the live server's own `.board-feedback.md` or a `--collect` of it — `--collect <file>` strips them from hand-delivered files automatically."

- [ ] **Step 3: Rewrite step 6 (:54)** — reopen is now automatic (the loop relaunches); step 6 becomes "after an idle-timeout sleep or cancel, offer `/research-plans:board` to wake; suggest a commit if plans/ changed (do not run it without approval)."

- [ ] **Step 4: Refresh stale one-shot statements.** `README.md:90`: "starts a small local server … and waits" → "starts a small local server on a stable per-project port (bookmark it), stays live while you work — every action you take on the board is applied by your session and the board refreshes itself." `SKILL.md:85` command-table entry gains "persistent live board (relaunch loop)". `SKILL.md:44` unchanged (gate wording still true).

- [ ] **Step 5: Verify + commit.** Read the full edited board.md start to finish once for step-number/reference consistency (steps 2, 7-14 unchanged but step references like ":13 dispatches to steps 7–14" must still hold).

```bash
git add commands/board.md README.md skills/managing-research-plans/SKILL.md
git commit -m "feat(board-cmd): relaunch-loop protocol, SIGNOFF/REOPEN routing, lifetime docs refresh"
```

---

### Task 2: Two-server e2e — durability, 409, pinned-port reload signal

**Files:**
- Test: `tests/test_board.py` (new `TestRelaunchE2E`)

**Interfaces:**
- Consumes: `serve_in_thread` harness (plan 1 Task 2), plan-1 response contract, `read_lock`.

- [ ] **Step 1: Write the failing e2e test**

```python
class TestRelaunchE2E(unittest.TestCase):
    def test_action_durability_slot_and_new_boot_signal(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); make_project(root)
            payload = board.collect_payload(root); payload["mode"] = "live"
            # Server A on the derived port
            url_a, info_a, t_a = serve_in_thread(root, payload=payload)
            s, body_a, _ = http_json(url_a, "/api/feedback", body={
                "annotations": [], "feedbackMarkdown": "round one",
                "payloadHash": "x", "boardToken": payload["boardToken"]})
            self.assertEqual(s, 200)
            # Durable order exists before any routing:
            self.assertIn("round one",
                          (root / "plans" / ".board-feedback.md").read_text())
            # Second action on the same instance: 409, first order intact.
            s2, body_2, _ = http_json(url_a, "/api/feedback", body={
                "annotations": [], "feedbackMarkdown": "round two",
                "payloadHash": "x", "boardToken": payload["boardToken"]})
            self.assertEqual(s2, 409)
            t_a.join(timeout=10)          # server A exits after the accepted order
            self.assertFalse(t_a.is_alive())
            # "Session routes the order, acknowledges, relaunches on the SAME port":
            (root / "plans" / ".board-feedback.md").unlink()
            payload_b = board.collect_payload(root); payload_b["mode"] = "live"
            url_b, info_b, t_b = serve_in_thread(
                root, payload=payload_b, port=info_a["port"], force=True)
            self.assertEqual(info_b["port"], info_a["port"])
            s3, health, _ = http_json(url_b, "/api/health")
            self.assertEqual(s3, 200)
            self.assertEqual(health["projectId"], body_a["projectId"])
            self.assertNotEqual(health["bootId"], body_a["bootId"])
            # exactly the (same projectId, new bootId) pair the client reloads on
```

`serve_in_thread` must pass `port`/`force` through to the args namespace (it does — `**argkw`). The relaunch may need a brief bind-retry while A's socket closes: if flaky, wrap server B's start in the same retry the loop uses (up to ~2s). If `serve()` lacks `server_close()` after `shutdown()` (plan 1 left it as-is), add it now in board.py's serve() tail (:808 area, plus the batch/timeout exits) — it releases the socket promptly and is part of this task.

- [ ] **Step 2: Run** `python3 -m unittest tests.test_board.TestRelaunchE2E -v` — Expected: FAIL or flake on rebind → drives the `server_close()` addition.
- [ ] **Step 3: Implement** the `server_close()` calls (every exit path in `serve()`: after :808 shutdown, the batch exit :809-819, timeout exit :820-822, KeyboardInterrupt :825-827 — a single `finally`-adjacent close next to the lock unlink :828-832 is cleanest).
- [ ] **Step 4: Run** the e2e 5× to shake out flakes: `for i in 1 2 3 4 5; do python3 -m unittest tests.test_board.TestRelaunchE2E -q || break; done` — Expected: 5 passes. Full suites: `python3 -m pytest tests/ -q && npm --prefix board test`.
- [ ] **Step 5: Commit** `git add skills/managing-research-plans/scripts/board.py tests/test_board.py && git commit -m "test(board): two-server relaunch e2e — durability, 409 slot, same-project new-boot reload signal (+server_close)"`

---

### Task 3: Full verification sweep + release staging

**Files:**
- Modify: `CHANGELOG.md` (new top entry), `.claude-plugin/plugin.json` + `board/package.json` (version bump — staged, value per BK), `docs/RELEASING.md:17-36` (tag map rows for 0.12.0/0.13.0 if still absent — small housekeeping the map already misses)

- [ ] **Step 1: End-to-end walkthrough (the real thing).** In a scratch walkthrough project (`python3 scripts/new-walkthrough.py` from the repo root — see its header for usage): run `/research-plans:board`-equivalent by hand: launch `python3 <script>` in background, open the printed URL, and exercise: (a) drag-select comment → Send → server exits → simulate routing → relaunch with `--port <same> --no-open` → tab auto-reloads; (b) Approve a draft plan from the Tracker cluster → ticket file appears → write the signed vN.md and watch the hook allow it; (c) request-changes with reason; (d) Reopen on an accepted bundle → fence carries `reopen`; (e) sleeping banner after killing the server; (f) dark mode on every new surface; (g) narrow-window overlay + scrim. Fix anything broken before proceeding — this step is the spec's §7 verification and BK's board-feel check.
- [ ] **Step 2: Suites + counts.** `python3 -m pytest tests/ -q` and `npm --prefix board test` — record the new totals (expected: 179 + ~25 py; 95 + ~20 board). `cd board && npm run build` one final time; `git status` must show a clean tree after committing the template.
- [ ] **Step 3: Stage release artifacts.** CHANGELOG entry per Keep-a-Changelog house style (`CHANGELOG.md:3-17` as the format reference), heading `## [UNRELEASED-v0.15.0] - 2026-07-10` (BK renumbers at cut — v0.14 is reserved for the models work): `### Added` — persistent live board (stable bookmarkable port, auto-refresh after every action), docked side-by-side feedback panel with click-sync, always-available Approve/Request-changes/Review on Tracker/Plan/Results, board-issued approval tickets, Reopen-as-revision-request; `### Changed` — review controls uniformly hidden during gates; live drafts stored per-project; `### Fixed` — Results review button no longer renders dead inside gates; hand-delivered `--collect` files can no longer smuggle researcher-action keys. Bump BOTH version files to the placeholder agreed with BK. Do NOT tag or push.
- [ ] **Step 4: Commit** `git add CHANGELOG.md .claude-plugin/plugin.json board/package.json docs/RELEASING.md && git commit -m "docs: stage v0.15 changelog + version bumps (release cut is BK's)"`

---

## Self-review notes

- Spec §4 loop steps 1-4 → Task 1 Step 1; acknowledgment-after-work → same; lock-collision → exit-1 bullet; sleep rules → exit-2 bullet + step 6 rewrite.
- Spec §3 SIGNOFF routing (ticket never hand-written, missing-ticket downgrade) → Task 1 Step 2; reopen-never-mutates → same.
- Spec §5.3 channel sentence lands in the step-5 preamble (Task 1 Step 2) on top of plan-1 Task 7's mechanical strip.
- Spec §7 e2e ("serve A → action → durability + 409 → stop A → serve B same port → reload signal") → Task 2 verbatim.
- The foreground-harness fallback keeps board.md honest on hosts without background bash (spec §1's 10-minute note).
