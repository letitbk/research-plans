# Plugin Checkup — Audit Execution Plan

> **For agentic workers:** This is an **audit** plan, not a feature build. Tasks that produce tooling (Task 2 token-accounting script, Task 7 clean-room harness) follow test-first cycles; investigative tasks (sweep, probes, synthesis) carry concrete methods, exact commands, artifact schemas, and an **Acceptance** bar that stands in for a test. Steps use checkbox (`- [ ]`) syntax. Execute task-by-task; commit at each task boundary. The controller re-verifies any subagent-produced finding against real files before it is filed (see Global Constraints).

**Goal:** Produce a verified, priority-ranked findings document for the research-plans plugin across eight dimensions (token, coherence, workflow-correctness, UX/UI, accessibility, security, privacy, portability/install), with a proposed fix-batch plan — changing no shipped plugin behavior.

**Architecture:** A workflow-invariant *scenario matrix* is the spine. Four phases serve it: **Instrument** (baselines + matrix + threat model + token tooling), **Sweep** (one primary read per surface, filing findings against matrix rows), **Probe** (clean-room, live-board UX/a11y, adversarial security/privacy, transcript mining — closing rows with reproducers), **Synthesize** (impact-scored severity, adversarial verification, findings doc + fix batches). Each surface is read once primary, with targeted rereads where a scenario row needs cross-file tracing.

**Tech stack:** python3 (stdlib) for the accounting script and harness; `claude -p --output-format json` for the clean-room loop; Playwright MCP over HTTP for the live board; `codex` for adversarial verification; git for evidence. All audit artifacts are markdown + one python script.

**Spec:** `docs/specs/2026-07-15-plugin-checkup-design.md` (revision 2). **Cross-model review:** `docs/specs/2026-07-15-codex-review-plugin-checkup.md`.

## Global Constraints

- **Audit target is the immutable snapshot `60eaede` (v0.18.0).** Every read, measurement, and probe runs against that commit — never a moving `main`. Task 1 pins it. If `main` has moved, check out `60eaede` (or a worktree on it) for all reading; probes that need the *installed* plugin install that exact version.
- **No shipped plugin behavior changes.** Writes are confined to `docs/evaluation/checkup/` (baselines, the one script, threat model, findings) and `docs/evaluation/friction-log.md`. Nothing under `commands/`, `skills/`, `scripts/`, `board/`, `hooks/`, `.claude-plugin/` is touched. Fixes are separate, later, researcher-authorized PRs.
- **Verify before filing.** No runtime/behavioral claim is filed from a read alone or from a subagent summary. It is marked `to-verify` in the sweep and closed by a probe or a direct code check with a stated oracle. The controller re-confirms every fix-driving finding against the real file.
- **Measure, then decide** (token). The accounting is descriptive; no reduction is recommended without a tokens-saved × frequency figure and a behavior-risk note. The researcher approves reductions per item — the plan proposes, it does not cut.
- **Transcript-mining governance.** Only the author's own research repos. Only aggregate token counts leave a transcript — no prompt text, tool output, or project data is copied into `docs/evaluation/`, and no transcript is committed.
- **Finding-record schema** (every finding, in `findings-raw.md` then `findings.md`):
  `id` · `dimension(s)` · `surface:location` · `scenario-row` (Sxx or `—`) · `provisional-severity` (P0/P1/P2, a triage tag; final priority derived in Task 11) · `evidence` (file:line, measurement, or repro) · `proposed-direction` · `effort` (S/M/L) · `risk-note`.
- **Commit prose unwrapped** (one line per paragraph; the repo/author convention). No `Co-Authored-By` in commit messages.

## File structure (audit artifacts — all created, none modify shipped code)

- `docs/evaluation/checkup/scenario-matrix.md` — the spine (Task 3).
- `docs/evaluation/checkup/threat-model.md` — assets/actors/boundaries (Task 4).
- `docs/evaluation/checkup/token_report.py` — the accounting script (Task 2).
- `docs/evaluation/checkup/token-report.md` — its generated output (Task 2).
- `docs/evaluation/checkup/contract-map.md`, `xref-map.md`, `dependency-map.md` — coherence/portability baselines (Task 5).
- `docs/evaluation/checkup/baseline.md` — verification baseline: suites green, versions, isolation mechanics (Task 1).
- `docs/evaluation/checkup/findings-raw.md` — sweep + probe output (Tasks 6–10).
- `docs/evaluation/checkup/findings.md` — the primary deliverable (Task 12).
- `docs/evaluation/friction-log.md` — extended with Run 2/Run 3 (Task 7).
- `docs/evaluation/checkup/clean-room/` — harness scripts + captured JSON/transcripts (gitignored where they carry session content; Task 7).

---

## Phase 0 · Instrument

### Task 1: Pin the snapshot, record the verification baseline, resolve isolation mechanics

**Files:**
- Create: `docs/evaluation/checkup/baseline.md`
- Read: the repo at `60eaede`; `tests/`, `board/package.json`

**Acceptance:** `baseline.md` records the exact audit commit, the three suites passing (with counts), a clean board build + typecheck, the installed-plugin version story, and the confirmed clean-room isolation mechanism — every claim backed by a command and its output.

- [ ] **Step 1: Confirm the audit commit and its cleanliness.**
  Run: `git -C /Users/bk/github/research-plans log -1 --format='%H %s' 60eaede` and `git status --short`. Record the SHA and note any untracked files (the two sidebar docs, `docs/plan-rubric-v0.4.md`) as pre-existing, not audit output.

- [ ] **Step 2: Run the Python suites against the snapshot.**
  Run: `cd /Users/bk/github/research-plans && python3 -m pytest tests/ -q 2>&1 | tail -5`. Record pass count. Expected: all green (the napkin records 360 py at v0.18.0).

- [ ] **Step 3: Build + typecheck + test the board.**
  Run: `cd board && ./node_modules/.bin/vitest run 2>&1 | tail -5`, then `npx tsc --noEmit 2>&1 | tail -5`, then `npm run build 2>&1 | tail -3`. Record results (napkin: 276 board vitest green, tsc clean at v0.18.0). Use the local vitest binary, never bare `npx vitest` (napkin gotcha).

- [ ] **Step 4: Record the installed-plugin baseline.**
  Read `~/.claude/plugins/installed_plugins.json` for the installed research-plans version, and note whether it matches `60eaede`. This tells us what a real session currently loads.

- [ ] **Step 5: Resolve clean-room isolation mechanics (do not assume).**
  Dispatch a `claude-code-guide` agent (or read current docs) to answer: does `CLAUDE_CONFIG_DIR` fully isolate global `CLAUDE.md`, user skills, plugins, and permission settings for a `claude -p` run? What is the minimal set of env vars/flags for a true clean environment, and how is a plugin installed into an isolated config from a local marketplace? Record the confirmed procedure in `baseline.md` (Task 7 depends on it).

- [ ] **Step 6: Write `baseline.md` and commit.**
  Sections: Audit commit · Python suites · Board build/typecheck/tests · Installed version · Clean-room isolation procedure. Then:
  ```bash
  git add docs/evaluation/checkup/baseline.md
  git commit -m "checkup: verification baseline + pinned snapshot + isolation mechanics"
  ```

### Task 2: Token-accounting script and report (real tooling — test-first)

**Files:**
- Create: `docs/evaluation/checkup/token_report.py`
- Create: `docs/evaluation/checkup/token-report.md` (generated)
- Test: inline via a `--selftest` flag (stdlib `assert`; no pytest dependency in the checkup dir)

**Interfaces:**
- Produces: `token-report.md` with four tables — per-surface static size; per-stratum totals; per-flow **peak single-context** vs **cumulative** input; and the always-on floor. Consumed by Tasks 6, 11, 12.

**Concrete model:** A *surface* has `{path, stratum, separate_context: bool}`. A *flow* is a list of *contexts*; each context is a list of surfaces loaded into it. `peak_single_context(flow) = max over contexts of sum(char_tokens(s) for s in context)`; `cumulative(flow) = sum over all contexts`. `char_tokens(s) = ceil(bytes/4)` (documented proxy; the empirical refinement comes from Task 7/10 JSON, noted in the report). Subagent-dispatched agent templates + their rubric/plan payload are their **own** context (`separate_context: True`), never added to the main context's peak.

- [ ] **Step 1: Write the failing self-test.**
  ```python
  # token_report.py  (top-level, guarded by --selftest)
  def _selftest():
      # peak != cumulative when a flow spans two contexts
      flow = [["A"], ["B", "C"]]                      # ctx0: A; ctx1: B+C
      sizes = {"A": 100, "B": 40, "C": 40}
      assert peak_single_context(flow, sizes) == 80  # max(100, 80)  -> 100? see note
      assert cumulative(flow, sizes) == 180
  ```
  Note: fix the expected `peak` to `100` (ctx0 = 100 > ctx1 = 80) when writing — the assert above is intentionally wrong to force a first failure; correct it in Step 3.

- [ ] **Step 2: Run the self-test, watch it fail.**
  Run: `python3 docs/evaluation/checkup/token_report.py --selftest`
  Expected: FAIL (`peak_single_context` undefined, then the wrong-expectation assert).

- [ ] **Step 3: Implement `char_tokens`, `peak_single_context`, `cumulative`, and the surface/flow tables.**
  Implement the three functions. Encode the surface inventory (from spec §5, sizes measured live via `os.path.getsize`, not hard-coded) with strata `always-on` / `session-start` / `per-invocation` / `per-dispatch` and `separate_context` True for the three `rp-*` agent templates. Encode canonical flows as data: `/plan` (main: SKILL+plan+rubric-inline path; dispatch: rp-plan-reviewer+rubric+plan payload; then board.md main), `/sync`→`/results`→`/board`, a bare `/board` open, a bare `/board --publish-web`. Correct the Step-1 assert to `== 100`. Emit `token-report.md`.

- [ ] **Step 4: Run the self-test + generate the report.**
  Run: `python3 docs/evaluation/checkup/token_report.py --selftest && python3 docs/evaluation/checkup/token_report.py --out docs/evaluation/checkup/token-report.md`
  Expected: selftest PASS; report written. Sanity-check: always-on floor ≈ 523 tokens; board.md ≈ 8,700; the bare-`/board` peak excludes the web runbook only if a mode-split is modeled (it is not yet — the report shows the full board.md as the candidate).

- [ ] **Step 5: Eyeball the report for the two headline numbers.**
  Confirm the report distinguishes peak vs cumulative for `/plan` (they must differ — the reviewer is a separate context) and names the always-on floor. If peak == cumulative for every flow, the separate-context modeling is wrong — fix before committing.

- [ ] **Step 6: Commit.**
  ```bash
  git add docs/evaluation/checkup/token_report.py docs/evaluation/checkup/token-report.md
  git commit -m "checkup: token-accounting script (peak vs cumulative, always-on floor)"
  ```

### Task 3: Author the scenario matrix (the spine)

**Files:**
- Create: `docs/evaluation/checkup/scenario-matrix.md`
- Read: SKILL.md, all commands, board.py, results.py, signoff_gate.py, models.py, the web-template

**Acceptance:** ≥ 15 rows, each with all columns filled through *static evidence* and *required probe* (the *result/confidence/finding-id* columns are filled later by the probes). Every row names a real invariant with a checkable observable and a concrete probe+fixture. The 11 seed rows from spec §4 are present and extended.

- [ ] **Step 1: Transcribe the 11 seed rows (S1–S11) from spec §4** into the matrix with columns: `# · scenario/invariant · owning surfaces (file:region) · expected observable · static evidence · required probe + fixture · pass/fail oracle · environment · result · confidence · finding-id`.

- [ ] **Step 2: Extend with rows the sweep will need**, at minimum: `/init` update-mode vs minimal-mode artifact creation; `/renew` archive→fresh-plan→carry-over (immutability of the archived plan); `/adopt` batch-gate ticket lifecycle; drift detection (`results.py changed`) → sync versioning; the `late:`/`retrofit` provenance stamping honesty; the report null-result gate across all three entry paths; the board frozen-boot payload reconciliation (mutation route → client patch, not reload). Each gets a checkable observable.

- [ ] **Step 3: For each row, fill `static evidence`** by locating the owning code/prose (file:line) — this is a read, not a probe. Where two surfaces must agree (S8 substantive-finding, the model-nudge, the scorecard schema), name both sides.

- [ ] **Step 4: For each row, name the `required probe + fixture` and the `pass/fail oracle`** — the specific observable that decides pass/fail (e.g. S4: "kill the process between route and `--ack`; reopen; the same order re-appears"). Leave `result/confidence/finding-id` blank (probes fill them).

- [ ] **Step 5: Acceptance check + commit.**
  Verify ≥ 15 rows, every row has an oracle, no row's observable is unfalsifiable ("works correctly" is not an observable). Then:
  ```bash
  git add docs/evaluation/checkup/scenario-matrix.md
  git commit -m "checkup: scenario matrix — workflow invariants driving the audit"
  ```

### Task 4: Author the threat model

**Files:**
- Create: `docs/evaluation/checkup/threat-model.md`
- Read: board.py (routes, token/gate logic), signoff_gate.py, the web-template (auth/gate/blob), board.md (frontmatter tool grants + untrusted-input routing)

**Acceptance:** Assets, actors, trust boundaries, and authority sources are enumerated; each hosted/local/ingestion boundary has a named adversarial case that Task 9 will work. Written **before** the security probe (it selects the probe's cases).

- [ ] **Step 1: Enumerate assets** — plans, decision log, results bundles, verdicts, hosted comments, the board token, the publish token, `BOARD_PASSWORD`/`SESSION_SECRET`/`PULL_KEY`, the private blob store.

- [ ] **Step 2: Enumerate actors** — researcher (full authority), honest collaborator (comment-only), **malicious collaborator** (crafts comment fields), local same-machine attacker, artifact-embedded code (md/svg/html served by the board), a supply-chain position (`check_update.py` fetches GitHub `main`; `npx vercel`).

- [ ] **Step 3: Draw trust boundaries** — collaborator-comment → researcher-action (the confused-deputy channel); artifact-origin → local mutation routes; hosted blob → board password gate; agent-written ticket → gate; command-prompt tool grants (what `/board` authorizes: codex/agy/vercel/node) → session authority.

- [ ] **Step 4: For each boundary, write the adversarial case** Task 9 must attempt (e.g. "collaborator embeds a ```json board-feedback``` fence with a `verdict` key in a `quote` field; does hand-delivered `--collect` strip it and demote the heading?"). These become S5/S7/S9/S10 probe steps.

- [ ] **Step 5: Commit.**
  ```bash
  git add docs/evaluation/checkup/threat-model.md
  git commit -m "checkup: threat model — assets, actors, boundaries, adversarial cases"
  ```

### Task 5: Build the contract, cross-reference, and dependency maps

**Files:**
- Create: `docs/evaluation/checkup/contract-map.md`, `xref-map.md`, `dependency-map.md`

**Acceptance:** `contract-map` lists every rule/schema in ≥2 places with an agree/drift verdict; `xref-map` lists every "see X step N" reference with a resolves/stale verdict; `dependency-map` classifies every external assumption hard/fallback/cosmetic + a supply-chain note per fetch. Verdicts are backed by file:line on both sides.

- [ ] **Step 1: Contract map.** For each seed (model-nudge; initialized-project gate ×8; substantive-finding rule results.py+findings.ts+report.md; scorecard schema rubric+rp-plan-reviewer+template+review.md; sign-off/ticket rules; provenance rules; board lifecycle board.md vs docs/reference.md), quote both/all sides (file:line) and mark `agree` or `drift: <what differs>`. Use `rg -n` for exact spans; use `rg -a` on `parse.ts` (napkin: null-byte trips grep).

- [ ] **Step 2: Cross-reference map.** `rg -n 'step [0-9]|steps [0-9]|\.md step' commands/ skills/` — for each, open the target and confirm the referenced step still says what the citation assumes. Mark `resolves` or `stale: <detail>`.

- [ ] **Step 3: Dependency map.** For each external assumption (pandoc, codex, agy, journal-figures/tables, node/vercel, gh, AskUserQuestion headless fallback, model aliases, check_update→GitHub main, npx vercel), classify hard/fallback/cosmetic, cite the guard (or its absence, e.g. no `command -v codex` in board.md), and add a one-line supply-chain/trust note where a runtime fetch is involved.

- [ ] **Step 4: Acceptance check + commit.**
  Verify each map's verdicts are all evidence-backed (no bare assertions). Then:
  ```bash
  git add docs/evaluation/checkup/contract-map.md docs/evaluation/checkup/xref-map.md docs/evaluation/checkup/dependency-map.md
  git commit -m "checkup: contract, cross-reference, and dependency baselines"
  ```

---

## Phase 1 · Sweep

### Task 6: One primary read per surface, filing findings against the matrix

**Files:**
- Create: `docs/evaluation/checkup/findings-raw.md`
- Read (one primary pass each, dependency order): SKILL.md → the 10 commands → templates/agents → board.py/results.py/signoff_gate.py/models.py/check_update.py → board/src → web-template → docs.

**Acceptance:** Every surface has been read once and its observations filed as finding records (Global Constraints schema). Every finding is tagged with a scenario row where one applies, or `—`. Runtime/behavioral claims are tagged `to-verify` (not asserted). The read is filed against the Phase-0 maps — a contract-map drift becomes a coherence finding; a dependency-map hard-dep-without-guard becomes a portability finding.

**Method note:** Surfaces may be swept by parallel subagents (one per surface-group) to save wall-clock, BUT — per the napkin's repeated lesson — a subagent's finding is a *draft*; the controller re-reads the cited file:line and confirms it before the finding is kept. Give each subagent the Phase-0 maps + the finding schema + "cite file:line for every claim; mark anything about runtime behavior as to-verify."

- [ ] **Step 1: Sweep SKILL.md + the 10 command bodies.** For each, file: duplication against `contract-map`, dead/fragile xrefs against `xref-map`, token-weight observations against `token-report.md`, and any workflow-step that a scenario row covers (tag it Sxx, mark behavioral claims to-verify). One finding record per distinct observation.

- [ ] **Step 2: Sweep the templates + the three agent files.** Check the scorecard schema agreement (rubric ↔ rp-plan-reviewer ↔ review-scorecard template), the `{{MODEL}}/{{EFFORT}}/{{CHECKSUM}}` substitution contract, and the tools grants (least-privilege lens: does rp-plan-reviewer need `Bash`?).

- [ ] **Step 3: Sweep the scripts** (board.py, results.py, signoff_gate.py, models.py, check_update.py). File coherence (stale comments like `token_ok`), workflow-invariant observations against S1–S11 (tag + to-verify), and any Python/TypeScript duplication (S8) needing a paired test. Do not adversarially probe here — that is Task 9; just file what the read surfaces.

- [ ] **Step 4: Sweep `board/src`** for UX/coherence observations that a read can surface (dead props, inconsistent affordances, the frozen-boot reconcile pattern), tagging live-behavior claims to-verify (Task 8 closes them). Sweep the web-template similarly, tagging security claims for Task 9.

- [ ] **Step 5: Sweep the docs** (README, QUICKSTART, reference, hosting-the-board, RELEASING) against the code — file every doc-vs-code drift (the board-lifecycle drift is the confirmed seed) as a coherence finding.

- [ ] **Step 6: Controller verification pass.** For every finding filed by a subagent, re-open the cited file:line and confirm the claim. Drop or correct any that do not hold. Mark each verified finding `read-confirmed`; leave behavioral ones `to-verify` for the probes.

- [ ] **Step 7: Commit.**
  ```bash
  git add docs/evaluation/checkup/findings-raw.md
  git commit -m "checkup: Phase 1 sweep — findings filed against the scenario matrix"
  ```

---

## Phase 2 · Probe

### Task 7: Clean-room — install/upgrade, scripted loop, interactive sessions, author diff

**Files:**
- Create: `docs/evaluation/checkup/clean-room/` (harness + captured JSON; add a `.gitignore` there for `*.jsonl`/transcripts carrying session content — commit only derived aggregate notes)
- Modify: `docs/evaluation/friction-log.md` (append Run 2 + Run 3)
- Append: findings to `findings-raw.md`

**Acceptance:** The real install path is exercised in an isolated config; the scripted loop completes (or its dead-ends are documented) with per-stage token JSON captured; 2–3 interactive clean-env sessions probe interview burden/permission walls/recovery; the author-env scripted run is diffed; every clean-vs-author difference is filed as a *candidate needing paired confirmation*, never asserted as environment-caused. Claim scope stamped "fresh config, this CC version + macOS."

- [ ] **Step 1: Stand up the isolated environment** per Task 1 Step 5's confirmed procedure (fresh `CLAUDE_CONFIG_DIR`, no global CLAUDE.md/skills, default permissions). Verify isolation: launch `claude -p "what skills and CLAUDE.md rules are active?"` and confirm none of the author's setup bleeds in. Record the exact env in `clean-room/env.md`.

- [ ] **Step 2: Install the plugin the real way** — marketplace add → install `research-plans@research-plans` pinned to the audit version → restart. Log every step, prompt, and restart requirement (this is the install/upgrade dimension). File findings for any friction (unclear step, silent failure).

- [ ] **Step 3: Scripted headless loop** on a synthetic analysis project (reuse `scripts/new-walkthrough.py` to scaffold, or a fresh minimal project): `/init` → `/plan` → execute → `/sync` → `/results` → `/report` → `/board --export`, each stage `claude -p --output-format json` with answers seeded. Capture the JSON (token usage per stage) into `clean-room/`. Log every dead-end, permission prompt, missing-tool degradation (run once each with pandoc/node absent if feasible). This becomes friction-log **Run 2**.

- [ ] **Step 4: 2–3 interactive clean-env sessions** driven as a novice, answers NOT pre-seeded: a cold `/init` (does it dead-end per friction-log 1.1?), a `/plan` (interview burden), and one `/board` pass (permission walls, first-hook-trust). These probe what scripting masks. Record the experience narratively in the friction log.

- [ ] **Step 5: Author-env scripted run + diff.** Run the identical Step-3 script under the normal environment. Diff token usage and behavior/tone against Run 2. File differences as candidates (paired-confirmation needed). This is friction-log **Run 3**.

- [ ] **Step 6: Write friction-log Run 2 + Run 3, file findings, commit.**
  Use the friction-log entry template (disposition per finding). Then:
  ```bash
  git add docs/evaluation/friction-log.md docs/evaluation/checkup/findings-raw.md docs/evaluation/checkup/clean-room/env.md docs/evaluation/checkup/clean-room/.gitignore
  git commit -m "checkup: clean-room probe — install, scripted loop, interactive sessions, author diff"
  ```

### Task 8: Live board — UX walkthrough + accessibility/viewport

**Files:**
- Append: findings to `findings-raw.md`; fill `result/confidence` on the board-related matrix rows (S6 live half, board UX rows)

**Acceptance:** Every board view is exercised live; the annotation gesture is checked against the one-gesture-everywhere preference; a bounded a11y/viewport pass (keyboard, 200% zoom, narrow screen) is run; touch-commenting is noted as a known deferred gap, not filed as new.

- [ ] **Step 1: Serve a synthetic project's board** (a demo `plans/` tree, per the napkin board-screenshot technique) via `board.py --port N --no-open --timeout 3600` in the background; drive with Playwright MCP over HTTP. Re-`browser_resize` after every navigate (napkin gotcha).

- [ ] **Step 2: Walk every view** — Tracker, PlanReader (+ score panel), Results, Reports, Timeline, Models, Archive — plus the annotation flow (drag-select → comment). File any click-to-act / native-dialog affordance that violates the one-gesture preference; any dead control; any empty state that reads as broken.

- [ ] **Step 3: Accessibility/viewport pass (bounded).** Keyboard-only: can the primary actions (approve, request-changes, comment, review-with) be reached without a mouse? The annotation composer starts from `onMouseUp` — is there any keyboard path? 200% zoom: does the header (single flex row of tabs+actions) or the `w-56` sidebars break? Narrow viewport (<1024px): overlay/scrim behavior. File each as a UX/a11y finding with the recorded interaction as evidence.

- [ ] **Step 4: Close the board matrix rows + commit.**
  Fill `result/confidence/finding-id` on the board rows. Then:
  ```bash
  git add docs/evaluation/checkup/findings-raw.md docs/evaluation/checkup/scenario-matrix.md
  git commit -m "checkup: live board UX + accessibility/viewport probe"
  ```

### Task 9: Adversarial security + privacy pass (threat-model-driven)

**Files:**
- Append: findings to `findings-raw.md`; fill `result/confidence` on S5/S7/S9/S10 and privacy rows; annotate `threat-model.md` with per-boundary verdicts

**Acceptance:** Each threat-model boundary has a verdict (holds / regressed / never-covered) backed by a concrete attempt or a code trace; the confused-deputy, artifact-serving, ticket-forgery, local-mutation, and hosted-auth invariants are re-verified (not assumed); the privacy/retention/least-privilege questions are judged.

**Method note:** Use a small adversarial panel (parallel subagents with distinct lenses — injection, auth/authz, data-exfil) over the threat-model cases, but the controller confirms every claimed vulnerability against the real code before filing it P0. A refuted case is filed as "boundary holds."

- [ ] **Step 1: Confused-deputy (S9).** Craft a collaborator feedback doc with an embedded ```json board-feedback``` fence carrying `verdict`/`reviewRequest`/`reopen` keys inside a `quote` field; run it through `--collect <file>`; confirm the keys are stripped and headings demoted (the hand-delivered path). Trace `FENCE_RE`/`parse_fence` for the last-fence + multi-fence rules. Verdict → S9.

- [ ] **Step 2: Local mutation surface (S10).** Confirm board.py binds 127.0.0.1, that `local_request_ok` + per-boot `board_token` gate every `/api/*` POST (board.py:1216), and that an artifact served under the board origin cannot reach a mutation route (check the artifact CSP/MIME headers). Verdict → S10.

- [ ] **Step 3: Artifact serving + Markdown link scheme.** Verify md/svg/html artifacts are served `text/plain` or attachment (never active under the origin) and that the Markdown renderer blocks `javascript:` links. Attempt a `javascript:` link in rendered markdown. File any regression.

- [ ] **Step 4: Ticket forgery (S2) + hosted auth (S7).** Confirm an agent-written `.import-approved-*` ticket is denied as forgery (signoff_gate.py); confirm the hosted gate rejects unauth `/api`, that the private blob is not URL-readable, and the cookie-after-secret-rotation behavior (read the web-template auth/gate/blobstore + their tests). Verdicts → S2, S7.

- [ ] **Step 5: The secret-in-Bash-invocation candidate + least-privilege.** Assess `printf '<secret>' | npx vercel env add` (secret in the Bash tool invocation → possibly the transcript) — threat-model treatment, propose a mitigation direction, do not overstate. Review each command's frontmatter tool grant for least privilege (does `/board` need `node`? does rp-plan-reviewer need `Bash`?).

- [ ] **Step 6: Privacy/retention.** Judge: full-board-always publishing (data minimization), collaborator offboarding (revocation = password/secret rotation only), comment persistence until `--web-clear`, 30-day cookies. File as privacy findings with a proposed-direction each.

- [ ] **Step 7: Annotate the threat model with verdicts, file findings, commit.**
  ```bash
  git add docs/evaluation/checkup/findings-raw.md docs/evaluation/checkup/threat-model.md docs/evaluation/checkup/scenario-matrix.md
  git commit -m "checkup: adversarial security + privacy pass with per-boundary verdicts"
  ```

### Task 10: Transcript mining (governed) — empirical token profile

**Files:**
- Append: an aggregate section to `token-report.md`; findings to `findings-raw.md`

**Acceptance:** Real per-flow token usage for `/plan`, `/sync`, `/board` is measured from the author's own transcripts and compared to the Task-2 static model; only aggregate counts are recorded; no transcript content is copied or committed.

- [ ] **Step 1: Locate the author's real research-repo transcripts** (`~/.claude/projects/<repo>/…`) where the plugin has run. If too sparse, fall back to the Task-7 clean-room JSON (note the substitution).

- [ ] **Step 2: Extract per-flow aggregate token usage** (input/output/cache totals per command invocation) with a throwaway script that writes ONLY numbers — no prompt/data content — into a temp file. Compare peak/cumulative against Task-2's static model; note where reality diverges (re-reads, dispatch payloads, chained opens).

- [ ] **Step 3: Write the aggregate comparison into `token-report.md`, file any divergence findings, delete the throwaway extract, commit.**
  ```bash
  git add docs/evaluation/checkup/token-report.md docs/evaluation/checkup/findings-raw.md
  git commit -m "checkup: empirical token profile from real transcripts (aggregates only)"
  ```

---

## Phase 3 · Synthesize

### Task 11: Score severity and adversarially verify the top findings

**Files:**
- Modify: `findings-raw.md` (add severity scores + verification verdicts)

**Acceptance:** Every finding carries an impact/likelihood/reach/confidence score and a derived priority; every P0 and high-impact P1 has an independent verification verdict with a stated oracle; unverified-and-unverifiable claims are downgraded or dropped.

- [ ] **Step 1: Score each finding on four axes** — impact (data-loss / wrong-state / security-privacy / recurring-cost / friction / cosmetic), likelihood, reach, confidence — and derive priority (P0 = high-impact × plausible × confirmed; P1 = material recurring cost/friction or a real defect in a rarer path; P2 = drift/polish/low-reach). Replace the provisional tags.

- [ ] **Step 2: Adversarially verify the P0s and high-impact P1s.** For each, state the oracle by type (static drift → file:line + conflicting texts; workflow → matrix reproducer + expected/actual; token → the measurement + which metric; UX/a11y → recorded interaction). Verify independently — a fresh subagent/context re-runs the reproducer, or a distinct lens re-reads. Use the panel pattern for the load-bearing ones. Record `CONFIRMED` / `downgraded` / `dropped` with evidence.

- [ ] **Step 3: Commit.**
  ```bash
  git add docs/evaluation/checkup/findings-raw.md
  git commit -m "checkup: severity scoring + adversarial verification of top findings"
  ```

### Task 12: Findings document + fix-batch proposal (primary deliverable)

**Files:**
- Create: `docs/evaluation/checkup/findings.md`

**Acceptance:** All verified findings, deduped, ranked by derived priority, cross-tabulated dimension × severity, each with evidence/proposed-fix/effort/risk-note; grouped into coherent fix batches (each naming its walkthrough-regression check); a one-screen executive summary at top. Nothing recommends itself for auto-merge — the researcher picks.

- [ ] **Step 1: Promote every `CONFIRMED`/`P2` finding** from `findings-raw.md` into `findings.md`, deduped (same anchor + same point merged), sorted by priority. Drop `dropped` ones (keep a short "considered and refuted" appendix so they are not re-discovered).

- [ ] **Step 2: Cross-tabulate** dimension × severity (a table); write the executive summary (the shape of the problem in one screen: where the tokens are, where the coherence drift concentrates, which invariants hold, the portability verdict).

- [ ] **Step 3: Propose fix batches.** Group findings into branches the researcher approves one at a time; cross-cutting fixes (e.g. board.md web-runbook → load-on-demand reference) are single batches touching a file once. Each batch: its findings, its net token/coherence/safety win, its effort, and its walkthrough-regression check.

- [ ] **Step 4: Acceptance check + commit.**
  Verify: every finding traceable to evidence; every P0/high-P1 has a verification verdict; the fix batches cover all P0/P1; the token reductions each carry a risk note; no shipped file was modified (`git status` shows only `docs/evaluation/` writes). Then:
  ```bash
  git add docs/evaluation/checkup/findings.md
  git commit -m "checkup: findings document + fix-batch proposal (primary deliverable)"
  ```

---

## Self-Review

**Spec coverage** (each spec §, mapped to a task):
- §2 dimensions (8) → Task 6 tags all; token Task 2/10; coherence Task 5/6; workflow Task 3/9; UX/a11y Task 8; security/privacy Task 4/9; portability/install Task 7. ✓
- §4 scenario spine → Task 3 builds it; Tasks 7–9 close rows. ✓
- §5 surfaces (incl. manifests, hooks.json, test suites) → Task 1 baseline (suites), Task 6 sweep (manifests, hooks.json read). ✓
- §6 Instrument (matrix, threat model, verification baseline, token 3-metric, contract/xref/dependency) → Tasks 1–5. ✓
- §7 Sweep + Probe (clean-room scripted+interactive+install, board UX+a11y, security incl. prompts + threat-driven, transcript governance) → Tasks 6–10. ✓
- §8 Synthesize (impact severity, oracles, adversarial verify, fix batches) → Tasks 11–12. ✓
- §9 preliminary observations → seeded into Tasks 2/5/6 (not re-derived). ✓
- §10 deliverables (6) → scenario-matrix T3, threat-model T4, token-report T2/T10, three maps T5, friction-log T7, findings T12. ✓
- §11 boundaries → Global Constraints (pinned snapshot, docs-only writes, no fixes). ✓
- §13 open questions → T1 (isolation env), T2 (token primary metric surfaces in the report), T7 (interactive count = 2–3). ✓

**Placeholder scan:** Investigative tasks specify method + exact commands + acceptance, not fabricated findings (findings are the output, correctly not pre-written). The one code task (Task 2) has real test/impl code. No "TBD"/"handle edge cases"/"similar to Task N". ✓

**Type/naming consistency:** `findings-raw.md` (Tasks 6–11) → `findings.md` (Task 12); `scenario-matrix.md` rows Sxx referenced consistently in Tasks 3,7,8,9,11; `token-report.md` produced T2, appended T10, consumed T11/12; `peak_single_context`/`cumulative`/`char_tokens` consistent within Task 2. ✓

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-07-15-plugin-checkup-plan.md`.** It is phased so it can run across sessions (Phase 0 → 1 → 2 → 3), each task committing an artifact. Before execution, the natural next step in your flow is a `/codex` pass on this plan.

Two execution options when you are ready:

1. **Inline, phase-by-phase (recommended for an audit)** — I run the tasks in-session, dispatching subagents for the parallelizable sweep and the adversarial verification panel, and re-verifying their findings myself. Checkpoints at each phase boundary so you see the baselines, then the raw findings, then the synthesized doc. This keeps you in the loop at the three points that matter (matrix, findings-raw, findings).

2. **Subagent-driven, task-by-task** — a fresh subagent per task with review between; better isolation, more overhead, and weaker for tasks whose value is cross-surface synthesis (the sweep and synthesis want one mind holding the whole surface).

My recommendation is option 1: an audit's quality comes from one context holding the whole picture, with subagents used surgically for fan-out (sweep) and adversarial checks (verification), not for the synthesis. Want me to run `/codex` on the plan first, then start Phase 0?
