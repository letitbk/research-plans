# Plugin Checkup — Fix Execution Plan

> Fixes the findings in `docs/evaluation/checkup/findings.md`, landed on **one branch** for a **single giant PR**. WT-1 (CSRF) already shipped separately as merged PR #20.

**Goal:** Apply the six fix batches (A–F) from the checkup, each a coherent set of commits on one branch, ending in one PR the researcher opens.

**Base:** current `origin/main` (`dd5cf9d` — includes the merged board-sidebar work PR #19 and the CSRF fix PR #20), plus the audit docs. Fixes are verified against this **post-sidebar** code, not the audited `60eaede`.

**Branch strategy:** one branch `fix-checkup-batches` off `main` (which now = origin/main + audit docs). The giant PR therefore carries the **audit docs + all fixes** together — the whole story in one PR. (If you'd rather the PR be fixes-only, say so and I'll branch from `origin/main` and push the audit docs separately.)

**Regression discipline:** run the relevant suite after each batch (py `pytest tests/`, board `./node_modules/.bin/vitest run` + `tsc --noEmit`, web-template `npm test`); **never** `npm run build` (it writes a shipped asset — the release cut owns that). Commit per fix or per coherent sub-group. One `/codex` pass on the whole diff before the PR.

## Global Constraints

- Post-sidebar board line numbers differ from the findings doc (audited `60eaede`). Each board fix re-confirms the exact line before editing.
- The new sidebar code (`board/src/components/Sidebar.tsx`, `lib/filesTree.ts`, `lib/outline.ts`) was **not** in the audit — Batch F includes a quick pass over it.
- No behavior change ships without a test that pins it (TDD for code; a suite run for prose/doc changes).
- Deferred this round (design calls, not mechanical): **COH-2/COH-3/COH-4** (dedup of the model-nudge ×3, init-gate ×8, provenance restatement) — they need a shared-snippet mechanism the command/template system doesn't have; weigh separately.

---

## Batch B — Hosted-comment robustness (do first: contains the P1)

**Files:** `skills/managing-research-plans/scripts/board.py`, `tests/test_board.py`.

- [ ] **SCR-1 (P1) · unlink the inbox after routing.** In `pull()` (board.py ~1608-1624), track each written inbox filename alongside its doc; after `inspect_feedback_document(root, doc)` in the normal loop, `unlink()` that file. The top-of-`pull()` recovery drain (1567-1571) then handles only genuine crash leftovers. **Test:** a `test_board` case that runs two pulls over the same comment set and asserts the second prints "No new remote comments." and re-routes nothing (today it re-offers the prior batch).
- [ ] **SCR-2 · atomic pulled-state write.** board.py:1622 — replace `_pulled_path(root).write_text(...)` with a tmp-file + `os.replace` (the pattern already at 1112-1114). **Test:** assert the write goes through a temp path (or that a simulated mid-write crash leaves the old file intact).
- [ ] **SCR-3 · guard an un-acked order at serve start.** In `serve()`/`accept_order`, when `.board-feedback.md` already exists un-acked, refuse-or-warn instead of unconditional `os.replace` (board.py:1114). **Test:** starting a server with a pending `.board-feedback.md` present surfaces the recovery path, doesn't silently overwrite.
- [ ] **SCR-4 · write the ticket before the durable order file.** Reorder board.py:1282-1293 so `write_ticket(...)` runs before `accept_order` writes `.board-feedback.md`, so "an approved order always has its ticket" holds across a crash. **Test:** the existing gate tests stay green; add one asserting the ticket exists whenever the order file does.
- [ ] Run `pytest tests/ -q`; commit `fix: hosted-comment robustness (pull re-offer, atomic state, order/ticket ordering)`.

## Batch A — Security hardening (WT-1 already merged)

**Files:** web-template `lib/blobstore.ts`, `api/comments.ts`, `lib/validate.ts`, `api/logout.ts`, `middleware.ts` + tests; `docs/reference.md` (HOOK-1 doc).

- [ ] **WT-2 · stop client-id comment overwrite.** In `putComment` (blobstore.ts:12) either server-assign the blob id (ignore client `id`) or set `allowOverwrite: false` and 409 on an existing id. Treat `author` as untrusted display text (document it). **Test:** re-POSTing an existing id does not overwrite (or is rejected).
- [ ] **WT-3 · trace + close the stored-XSS path.** First a code trace: does any hosted-comment field (`quote`/`comment`/`excerpt`) reach a `dangerouslySetInnerHTML` sink in the board bundle? If yes, sanitize/escape at render (reuse the `Markdown` safe-link policy) or server-side on ingest; if no, add a test pinning that comment fields render as text. **Test:** a comment containing `<img onerror>` / `javascript:` renders inert.
- [ ] **WT-4 · test the real middleware gate.** Add a test that drives `middleware.ts`'s default export directly (authed → `next()`, unauthed `/api/*` → 401 JSON, unauthed page → login HTML), plus a parity assertion that its inlined `isAuthed`/`verifyCookie` agree with `lib/auth.ts`. **Test:** the new middleware test file.
- [ ] **WT-5 · byte-accurate size cap.** validate.ts:29 — `Buffer.byteLength(serialized, "utf8")` instead of `.length`. **Test:** a multibyte payload just over 64 KB in bytes is rejected.
- [ ] **WT-6 · login rate-limit.** Keep the documented Vercel WAF step but make it non-optional in `board.md`/`hosting-the-board.md`; optionally add a small in-code per-IP backoff in `api/login.ts`. **Test:** doc assertion + (if coded) a backoff unit test.
- [ ] **WT-7 · login page cleanup.** Remove the dead `.err` CSS or wire an error message on failed login (`loginPage.ts:12`, `api/login.ts:16`); reconcile the two login-page copies (`middleware.ts:64` vs `loginPage.ts`). **Test:** the login-page test asserts the error affordance.
- [ ] **`/api/logout` method gap** (the WT-1 sibling): add a method guard to `api/logout.ts` if the UI invokes it via POST (verify first — if the UI uses a GET link, leave it and note why). **Test:** matches the UI's actual method.
- [ ] **HOOK-1 · document the gate boundary.** In `docs/reference.md` near the sign-off-gate section, state plainly that immutability is enforced against the Write/Edit tools and that a Bash-mediated write is outside the matcher (the workflow always uses Write). No code change. **Test:** none (doc).
- [ ] Run web-template `npm test` + `tsc --noEmit`; commit `fix: hosted-board hardening (overwrite, xss trace, middleware test, byte cap, login)`.

## Batch C — Token: externalize the mode runbooks (the big lever)

**Files:** `commands/board.md`, `commands/results.md`, new `skills/managing-research-plans/references/web-publishing.md` + `references/results-adopt.md`, the 4 wordiest command `description:` lines.

- [ ] **TOK-2/TOK-3 · board.md web-runbook → reference.** Move board.md steps 10–14 (the `--publish`/`--publish-web`/`--pull`/`--web-connect`/`--set-password` runbook, ~12.6 KB) into `references/web-publishing.md`. Keep board.md's mode dispatch (step 3) and a one-line "for web-publishing modes, follow `references/web-publishing.md`" pointer. The plain `/board` open and the `/plan` auto-chain then stop loading the runbook. **Verify:** re-run `token_report.py` and assert the bare-`/board` and `/plan`-chain peaks drop by ~the runbook size; a clean-room `--publish-web` smoke still routes correctly.
- [ ] **TOK-4 · results.md adopt/reconcile → reference.** Move results.md step 8 (adopt) + step 9 (reconcile) + the regeneration appendix (~4.9 KB, 26%) into `references/results-adopt.md`, leaving the single-capture path (steps 1–7) inline + a pointer. **Verify:** `token_report.py` shows the per-invocation `/results` drop; `--adopt`/reconcile still resolve.
- [ ] **TOK-1 · tighten the four wordiest descriptions.** Trim `renew` (217 B), `adopt` (211 B), `results` (209 B), `report` (195 B) `description:` lines to the essential — clarity kept, padding cut. **Verify:** `token_report.py` always-on floor drops; the descriptions still read clearly.
- [ ] Run the full suites (the template contract tests read the command files); commit `fix: externalize web-publishing + adopt runbooks to references; tighten descriptions`.

## Batch D — Portability

**Files:** `commands/init.md`; `commands/board.md` (codex/agy guard).

- [ ] **POR-2 (P1) · headless /init recovery message.** In init.md, when `AskUserQuestion` is unavailable and required answers are missing, instruct: create nothing, and print a clear "nothing was created — re-run non-interactively with the research questions/data/journal seeded in the command, e.g. `/research-plans:init <one-liner with RQs>`" message. **Verify:** a clean-room headless `/init` now emits the recovery message (re-run the Run-2 probe).
- [ ] **POR-1 · codex/agy availability guard.** In board.md's Review-with steps (44,46,47), add a `command -v codex` / `command -v agy` preflight mirroring report.md:24's pandoc guard, so a missing CLI yields a graceful "not available — pick another reviewer" instead of a raw shell failure. **Verify:** clean-room missing-tool probe (PATH without codex/agy) degrades gracefully.
- [ ] Commit `fix: headless /init recovery message + codex/agy availability guard`.

## Batch E — Coherence + small script fixes

**Files:** `docs/reference.md`, `board.py`, `results.py`, `check_update.py`, the agent template, `QUICKSTART.md`, board `lib/*` (parity tests).

- [ ] **COH-1 · board-lifecycle doc.** Rewrite `reference.md:50` to close-on-action + no-idle-timeout (board reopens at the same URL via `/research-plans:board`; an idle board never sleeps). Doc only.
- [ ] **COH-5 · stale `token_ok` docstring** (board.py:867-870): delete/correct — the token IS enforced. **Test:** none (comment).
- [ ] **DOC-1 · reference "what it creates" tree**: add `model-profile.md` row. **DOC-2 · QUICKSTART:72**: reword "saved review scorecards" → "each plan version's rubric score in its header."
- [ ] **SCR-6 · drift-detection except** (board.py:458-460): narrow the `except Exception` or log the swallowed OSError to stderr. **SCR-7 · finalize provenance except** (results.py:355-361): narrow / emit a stderr note when `load_profile` fails. **Tests:** each asserts the error surfaces rather than silently defaulting.
- [ ] **SCR-5 · pin the three Py/TS pairs.** Add cross-language parity tests for `fnv1a_hex`↔`hostedComments.hashContent`, `artifact_headers`↔`artifactDisplay.inlineSafe`, `payload_files`↔`parse.allFiles` (mirror the existing `is_substantive` pinned-vector approach). **Tests:** the new parity tests.
- [ ] **SCR-8 · check_update state**: drop the write-only fields (`lastSuccess`/`lastSeenRemoteVersion`/`installedVersionAtLastCheck`) or wire their intended consumer — confirm they aren't intentional diagnostics first.
- [ ] **SEC-1 · rp-plan-reviewer Bash**: document why the agent holds unscoped `Bash` (git evidence for integrity flags; platform can't scope `Bash(git:*)`); consider precomputing integrity flags in `/review` and dropping the agent's Bash. Decide + note in the plan; implement only if low-risk.
- [ ] Run all suites; commit `fix: coherence (board-lifecycle doc, stale comment, doc tree, parity tests, narrowed excepts)`.

## Batch F — Board UX + accessibility (re-verified post-sidebar)

**Files:** board `src/App.tsx`, `views/Tracker.tsx`, `views/Archive.tsx`, `views/Results.tsx`, `views/PlanReader.tsx`, `components/AnnotationLayer.tsx`, `components/ScriptViewer.tsx`, `components/ReviewMenu.tsx`, `components/Sidebar.tsx` (new).

- [ ] **Pre-step: re-confirm each UI finding's line on post-sidebar code** (line numbers shifted; UI-6 already shrank to Results.tsx only). Drop any the sidebar resolved.
- [ ] **UI-1 · native dialogs → in-DOM.** App.tsx copy-fallback (was 752-754): replace `alert()`/`window.prompt()` with an in-DOM selectable textarea (reuse the panel) — honors the codebase's own "no native prompt dialogs" rule. **Test:** the copy-fallback renders a textarea, calls no native dialog.
- [ ] **UI-2 · drop dead `canPost` prop** from Tracker/PlanReader/Results signatures + App call sites (verified still unused). **Test:** tsc clean; no behavior change.
- [ ] **UI-6 · Results.tsx sidebar** (now the only remaining `w-56`): stack below a breakpoint OR fold into the new global `Sidebar.tsx` if that's where it belongs post-consolidation. **Test:** component renders at narrow width.
- [ ] **UI-7 · wrap Tracker/Archive tables in `overflow-x-auto`** (match Models/SafeTable). **UI-8 · dark-mode contrast** (PlanReader.tsx:413): add `dark:bg-red-900/*` or drop the `dark:` text override. **UI-3/UI-4 · keyboard paths** for the annotation composer (`AnnotationLayer` onMouseUp) and line-comment ranges (`ScriptViewer`). **UI-9 · ReviewMenu** outside-click + Escape dismissal. **Tests:** component tests where feasible; the responsive/contrast ones verified in a live-board pass.
- [ ] **New: quick a11y pass over `Sidebar.tsx`** (keyboard nav, focus, aria) — it was not in the audit. File + fix anything obvious.
- [ ] Run board `vitest` + `tsc`; a live-board pass at 200% zoom / narrow viewport; commit `fix: board UX + accessibility (native dialogs, dead prop, responsive, keyboard, dark-mode)`.

---

## Self-review

- **Coverage:** every P1 (SCR-1 Batch B, POR-2 Batch D, TOK-1/2/3 Batch C; WT-1 already merged) and every P2 in `findings.md` maps to a batch. COH-2/3/4 explicitly deferred with reason. ✓
- **Post-sidebar accuracy:** Batch F re-verifies lines; UI-6 already adjusted; new sidebar code added to scope. Non-board findings unaffected (web-template/scripts/commands/docs untouched by the sidebar). ✓
- **No placeholders:** each fix names the file, the change, the test, and its regression check. The two judgment items (WT-3 XSS trace, SEC-1 agent Bash) are framed as trace-then-decide, not hand-waved. ✓
- **Ordering:** B (the P1) → A (security) → C (biggest token lever) → D → E → F. Independent file areas, safe on one branch.

## Execution handoff

On approval I create `fix-checkup-batches` off `main`, work the batches in order with a suite run + commit per batch, run one `/codex` on the full diff, and hand you a branch ready to open as the single giant PR. Two things to confirm: **(1)** giant PR = audit docs + fixes together (my default) or fixes-only; **(2)** any batch you want dropped or resequenced.
