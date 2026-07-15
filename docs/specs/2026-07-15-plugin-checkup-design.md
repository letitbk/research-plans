# Plugin checkup — comprehensive audit design

**Date:** 2026-07-15 · **Plugin version:** v0.18.0 (main @ 60eaede) · **Status:** design, pre-plan

A comprehensive audit of the research-plans plugin across five dimensions — token efficiency, prompt coherence, UX/UI, security, and random-user portability. This document scopes the audit; it does not perform it and ships no fixes. A separate execution plan (`docs/plans/2026-07-15-plugin-checkup-plan.md`) will phase the work; the prioritized findings and the fix batches are its output.

## 1. Motivation

The plugin has grown to eighteen releases through iterative fix-as-you-use development. That process is good at adding coherent features one at a time and bad at catching drift that only shows up across the whole surface: prompts written months apart that now restate the same rule three ways, instruction text that has accreted past what a session needs to load, terminology that shifted under a feature without the older prompts following. Three specific worries prompted this checkup:

1. **Token efficiency.** Every command carries dense, deliberately-redundant instruction text. Some of that redundancy is load-bearing (restated invariants keep an agent honest); some is pure cost paid every session. Nobody has measured which is which.
2. **Prompt coherence.** Ten command files, a skill, three agent templates, and a rubric all reference each other and restate shared rules. Prompts authored across eighteen releases may no longer agree with each other or with the code they describe.
3. **Random-user portability.** The author's local environment (a global `CLAUDE.md`, the superpowers/napkin skills, `codex`/`agy` CLIs, `/journal-figures` and `/journal-tables` skills, a tuned permission allowlist) may mask how the plugin behaves for a fresh user who has none of that. The plugin's own experience is not evidence of a stranger's experience.

Security and UX/UI round out the five dimensions because a comprehensive checkup should not skip the surfaces that hurt most when they fail.

## 2. The five dimensions

Each dimension is a lens with a precise question. Every finding filed during the audit is tagged with one or more dimensions.

| Dimension | The question it asks | Primary surfaces |
|---|---|---|
| **Token efficiency** | What does each surface cost, how often is it paid, and how much of that cost is load-bearing vs. removable? | 10 command bodies, SKILL.md, agent-dispatch payloads, frontmatter descriptions, the auto-chains (`/plan`→review→board) |
| **Prompt coherence** | Do the prompts agree with each other and with the code? Is every shared rule stated once and referenced, or restated (and drifting)? Is terminology consistent? | All prompt surfaces + the scripts they describe |
| **UX / UI** | Where does a real session or a real board interaction stall, confuse, or dead-end? Is the board's interaction model consistent across views? | The command flows end-to-end; the live board (all views) |
| **Security** | Can untrusted input (collaborator comments, artifacts, hosted-board data) cross a trust boundary? Are the local and hosted mutation surfaces actually guarded? | board.py, signoff_gate.py, results.py, the web-template, the artifact/ingest/hosted paths |
| **Portability** | What does a user with none of the author's local setup actually experience — dead-ends, permission walls, missing-tool degradation, tone shifts? | The whole loop, run in a clean environment |

## 3. Locked decisions (from the 2026-07-15 scoping)

These five forks were decided with the researcher before this design was written; the plan inherits them.

1. **Fix policy — audit-first, then batched fixes.** Complete the audit, produce one prioritized findings document, then the researcher chooses fix batches. Each batch is its own worktree branch and PR, cross-model reviewed (`/codex`) and regression-checked against the walkthrough harness before merge. No fixes ship during the audit.
2. **Clean-room depth — scripted clean-env loop + author-env diff.** A headless full loop on a synthetic project under a fresh `CLAUDE_CONFIG_DIR` with none of the author's config, then the identical script under the normal environment for a side-by-side diff. Not the full model/OS matrix.
3. **Token remediation — measure, then decide per finding.** Build the full token accounting (static + empirical) first; every proposed reduction carries a behavior-risk note; the researcher approves reductions individually. No hard numeric budget imposed up front.
4. **Sequencing — checkup first.** Audit v0.18.0 as shipped. The board-sidebar Outline+Files branch (`worktree-board-sidebar-outline`, built and pushed, unmerged) and the codex-agents-on-the-board idea both stay parked until the checkup lands.
5. **Audit structure — Instrument → Sweep → Probe → Synthesize.** Mechanical baselines first, one integrated read of every surface second, targeted empirical probes third, prioritized synthesis last. Each file is read once; expensive lenses (adversarial security, live UX, clean-room) are spent only where static reading cannot answer the question.

## 4. Surface inventory (what the audit covers)

Measured sizes ground the token dimension and set reading order. Bytes are the shipped files; token figures are ≈ bytes/4.

**Prompt surfaces (session-loaded instruction text):**

| Surface | Bytes | ≈ tokens | Load trigger |
|---|---|---|---|
| commands/board.md | 34,825 | 8,700 | every `/board` |
| commands/results.md | 18,048 | 4,500 | every `/results` |
| SKILL.md | 16,293 | 4,100 | skill trigger (research-session start) |
| commands/init.md | 9,430 | 2,400 | every `/init` |
| commands/plan.md | 9,123 | 2,300 | every `/plan` |
| references/plan-rubric.md | 9,817 | 2,450 | every `/review` (+ dispatched to reviewer) |
| commands/sync.md | 8,360 | 2,100 | every `/sync` |
| commands/adopt.md | 7,278 | 1,820 | every `/adopt` |
| commands/report.md | 6,241 | 1,560 | every `/report` |
| commands/renew.md | 5,753 | 1,440 | every `/renew` |
| commands/review.md | 5,539 | 1,385 | every `/review` |
| execution-plan.md (template) | 5,386 | 1,350 | `/plan`, `/adopt` (authoring) |
| commands/models.md | 3,346 | 840 | every `/models` |
| rp-plan-reviewer.md (agent) | 4,537 | 1,130 | every dispatched plan review |
| rp-board-reviewer.md (agent) | 2,653 | 660 | every dispatched board review |
| rp-results-validator.md (agent) | 2,041 | 510 | every dispatched validation |
| 6 smaller templates + 2 references | ~17,700 | ~4,420 | context-dependent |
| command `description:` frontmatter (×10) | 1,491 | **372** | **every session, every project, always** |

**Code surfaces (security + behavior):** board.py (2,517 lines), results.py (480), signoff_gate.py (412), models.py (477), check_update.py (230), new-walkthrough.py (163); board React UI (~14,500 lines across `board/src`); the Vercel web-template (`assets/web-template/`, ~10 files).

**Docs (portability + accuracy):** README.md, QUICKSTART.md, docs/reference.md, docs/hosting-the-board.md, CHANGELOG.md, docs/RELEASING.md.

**Token strata** (the accounting groups every surface by how often its cost is paid — frequency is half the lever):

- **Always-on-everywhere** — the ~372 tokens of command descriptions, loaded in *every* session in *every* project, including repos that never use the workflow. The only truly unconditional cost, and therefore the highest-leverage per byte.
- **Research-session start** — SKILL.md (~4,100) when the skill triggers.
- **Per-invocation** — a command body when its command runs.
- **Per-dispatch** — an agent template plus the rubric/plan payload each time a reviewer or validator subagent is spawned.

## 5. Phase 0 · Instrument

Build four reusable baselines mechanically, before any judgment. These are scripts and data files, not prose, so the sweep in Phase 1 reads against ground truth instead of re-deriving it per file. Artifacts land under `docs/evaluation/checkup/`.

1. **Token accounting** (`token-report.md` + the script that makes it). Per-file byte and token counts; per-stratum totals (the four strata above); per-flow totals — what a real `/plan` actually loads end to end (plan.md + its model-nudge + the rubric + rp-plan-reviewer on dispatch + board.md on the auto-open), what `/sync`→`/results`→`/board` chains to. The per-flow number is the one that matters, because commands auto-chain and the true cost is the chain, not the file.
2. **Contract inventory** (`contract-map.md`). Every rule, schema, or invariant stated in two or more places, listed with its locations and an agree/drift verdict. Seeds: the model-nudge paragraph (plan.md, sync.md, SKILL.md — near-verbatim), the "requires an initialized project" gate (7 commands), the substantive-finding rule (results.py + report.md + SKILL.md + board's findings.ts — the napkin flags the Python/TS pair as a hand-kept duplicate), the scorecard schema (rubric + rp-plan-reviewer + review-scorecard template + review.md), the sign-off/ticket rules (SKILL.md + plan.md + board.md + signoff_gate.py), the provenance rules (SKILL.md + results.md + report.md). Each is a candidate for "state once, reference elsewhere."
3. **Cross-reference graph** (`xref-map.md`). Every "see X step N" / "as in /command step N" / "board steps 4–5" reference, verified to resolve to the claimed target. These are fragile: renumbering a step in one file silently breaks a pointer in another. Confirmed instances already: review.md-step-4 cited from sync/adopt/board; /plan-step-5 cited from board/sync/adopt; /init-step-1 and -step-6 cited from renew. The graph tells us which files are safe to restructure and which have inbound references that must move with them.
4. **Dependency / bleed inventory** (`dependency-map.md`). Every reference in a shipped surface that assumes something outside a bare Claude Code install, each classified **hard dependency** / **graceful fallback** / **cosmetic mention**. Known entries to classify: `pandoc` (report.md — has a `command -v` guard), `codex`/`agy` CLIs (board.md review-with paths — no `command -v` guard seen), `/journal-figures` and `/journal-tables` (claude-md-section + results.md — guarded "if available"), Node.js/Vercel (board web publishing — documented as optional), `gh` (publish paths), the `AskUserQuestion` tool's headless fallback (friction-log 1.1), model aliases like `fable`/`opus` (models). This is the static half of the portability dimension; the clean-room probe is the empirical half.

## 6. Phase 1 · Sweep

One deep read per surface, in dependency order (SKILL.md → commands → templates/agents → scripts → board UI → docs), each read informed by the Phase-0 maps so nothing is re-derived. Every observation becomes a finding record:

```
id · dimension(s) · surface:location · severity(P0/P1/P2) · evidence · proposed direction · effort · risk-note
```

Findings accumulate in `docs/evaluation/checkup/findings-raw.md`. The sweep does not fix anything and does not rank — it files. Reading each file exactly once (against ground-truth maps rather than re-reading neighbors to check consistency) is the efficiency win of this structure over a dimension-parallel audit that would read the same 170 KB five times.

Where a finding needs a claim about runtime behavior (does this path actually crash? is this token actually enforced?), the sweep marks it **to-verify** rather than asserting it, and the probe phase or a direct code check resolves it. This is the discipline that catches the "looks like a bug, isn't" case — e.g. the stale `token_ok` docstring in §9 below.

## 7. Phase 2 · Probes

Four empirical investigations, for the questions static reading cannot answer. These are where the expensive lenses go.

**7.1 Clean-room loop + author-env diff.** The portability dimension's core. First verify the isolation mechanics against current Claude Code docs (claude-code-guide) rather than assuming them: a fresh `CLAUDE_CONFIG_DIR` (or equivalent) with no global `CLAUDE.md`, no superpowers/napkin/plain-writing skills, default permissions, and the plugin installed from the local repo marketplace. Then run a headless scripted loop on a synthetic analysis project (reusing `scripts/new-walkthrough.py` and the friction-log harness): init → plan → execute → sync → results → report → board --export. Capture per-stage transcripts and token usage (`claude -p --output-format json`); log every dead-end, permission prompt, and missing-tool degradation (no pandoc, no codex/agy, no node). Run the identical script under the normal environment and diff. Findings land as friction-log Run 2 (clean) and Run 3 (author-env), with the diff called out. This is what surfaces the interview dead-ends, permission walls, tool-absence fallbacks, and any tone or verbosity the author's `CLAUDE.md` was silently shaping.

**7.2 Live board UX walkthrough.** Drive the live board over HTTP with Playwright on a synthetic project (the proven board-screenshot technique — re-resize after each navigate, per the napkin gotcha), exercising every view: Tracker, PlanReader with the score panel, Results, Reports, Timeline, Models, Archive, and the annotation flow. Look for interaction-model inconsistencies (the author's stated preference is one gesture everywhere — drag-select → comment; flag any click-to-act or native-dialog affordance that violates it), dead controls, views whose empty states read as broken, and the score-panel / detail-level behaviors shipped in v0.18.0. UX findings only; the board's React internals get correctness attention only where a UX defect traces into them.

**7.3 Security adversarial pass.** Read board.py, signoff_gate.py, results.py, and the web-template as an adversary, producing a short threat-model document (`threat-model.md`) with the trust boundaries drawn explicitly. Re-verify — do not assume from the napkin — the invariants the plugin depends on: the collaborator-feedback confused-deputy channel (fence parsing, field neutralization, action-key stripping on hand-delivered ingress), the artifact-serving MIME/CSP hardening, the Markdown link-scheme allowlist, the sign-off ticket forgery guard, the local mutation surface (127.0.0.1 bind + `local_request_ok` + per-boot `board_token` — confirmed enforced at board.py:1216, contrary to a stale docstring), and the hosted web-template's auth/gate/private-blob path. Each invariant gets a current-state verdict: holds / regressed / never-covered. The output feeds P0 findings if any boundary is actually crossable.

**7.4 Transcript mining.** The empirical half of the token dimension. Parse real session transcripts from the author's research repos (where the plugin has run for real) to measure what `/plan`, `/sync`, and `/board` actually consumed in practice — instruction tokens vs. data tokens vs. model output — and compare against the Phase-0 static accounting. This catches the gap between what a file weighs and what a flow actually pulls in (re-reads, dispatch payloads, chained opens). If real transcripts are too sparse, the clean-room JSON output (7.1) is the fallback source.

## 8. Phase 3 · Synthesize

**8.1 Prioritized findings document** (`docs/evaluation/checkup/findings.md`) — the primary deliverable. Every raw finding promoted, deduped, and ranked:

- **P0** — broken or a real security boundary crossing. Fix before anything else.
- **P1** — material token cost paid frequently, or real user friction (a dead-end, a portability wall).
- **P2** — coherence drift, polish, cosmetic inconsistency.

Each finding carries: dimension(s), evidence (file:line, a measurement, or a repro), proposed fix, effort estimate, and — for every token reduction — a behavior-risk note (does cutting this restatement remove a load-bearing guardrail?). Findings are cross-tabulated dimension × severity so the shape of the problem is visible at a glance.

**8.2 Adversarial verification of the top findings.** Before any P0 or high-impact P1 is claimed, verify it independently (the panel pattern that has repeatedly caught false positives in this repo — and that would have caught the stale-docstring trap). A finding that does not survive a skeptical second look is downgraded or dropped. No finding reaches the document as fact without evidence that it reproduces.

**8.3 Proposed fix batches.** Group surviving findings into coherent branches the researcher can approve one at a time. Cross-cutting fixes (e.g. splitting board.md's web-publishing runbook into a reference file — a token *and* coherence *and* maintainability win at once) are named as single batches so a fix touches a file once. Each batch names its walkthrough-regression check. The researcher picks; nothing ships from this design.

## 9. Preliminary observations (hypotheses to verify, not conclusions)

These surfaced during scoping and are recorded so the sweep starts warm. Each is a *candidate*, grounded in a direct measurement or read; none is a confirmed finding until the audit verifies it.

- **[token, P1?]** `board.md` is 8.7k tokens and roughly half of it (steps 10–14) is the Vercel web-publishing runbook, relevant only when `--publish-web`/`--pull`/`--web-connect` is the argument. A plain `/board` open pays the whole cost. Candidate: move the web runbook to a reference file loaded only on those modes. `results.md` (adopt/reconcile modes) and the `/plan` chain are similar shapes.
- **[token, P1?]** The always-on cost is *only* the ~372 tokens of command `description:` lines — but they load in every session everywhere, including non-research repos. Tightening the three wordiest (adopt 211 B, renew 217 B, report 195 B, results 209 B) is the highest-frequency lever in the plugin.
- **[coherence, P2]** The model-nudge paragraph appears near-verbatim in plan.md, sync.md, and SKILL.md; the "requires an initialized project" gate in seven commands; the substantive-finding rule is a hand-kept Python/TypeScript duplicate. Candidates for state-once-reference, but each must be checked for whether the restatement is load-bearing in its local context.
- **[coherence, P2]** Fragile cross-file step references ("review.md step 4", "/plan step 5", "board steps 4–5") couple files by line/step position. The xref graph will enumerate them; some may already be stale.
- **[coherence, P2 — verified example, not a bug]** `token_ok`'s docstring (board.py:868–870) says the per-boot token is "NOT yet enforced in do_POST"; do_POST at line 1216 *does* enforce it. The code is correct; the comment is stale drift. This is the template for how the sweep should treat every "looks wrong" — verify against the code before filing.
- **[portability, P1?]** Headless `/init` interviews into the void when `AskUserQuestion` falls back to text (friction-log 1.1, still "pending ruling"). The clean-room loop will confirm whether this still bites and how a fresh user recovers.
- **[portability, P2?]** board.md's review-with-`codex`/`gemini` paths shell out to `codex`/`agy` with no `command -v` guard seen; a user without those CLIs may hit a raw failure rather than a graceful "not available." To confirm in the dependency inventory.
- **[housekeeping]** Two untracked design/plan docs for the parked sidebar work sit on main (`docs/plans/2026-07-14-board-sidebar-outline-files-{design,plan}.md`); `docs/plan-rubric-v0.4.md` is tracked but is a share artifact. Note for the researcher; not an audit finding.

## 10. Deliverables

1. `docs/evaluation/checkup/token-report.md` — the static accounting + the script that regenerates it.
2. `docs/evaluation/checkup/contract-map.md`, `xref-map.md`, `dependency-map.md` — the three coherence/portability baselines.
3. `docs/evaluation/checkup/threat-model.md` — trust boundaries + per-invariant verdicts.
4. `docs/evaluation/friction-log.md` — extended with Run 2 (clean-room) and Run 3 (author-env), diff called out.
5. `docs/evaluation/checkup/findings.md` — **the primary deliverable**: prioritized, verified, dimension×severity, with proposed fix batches.

No plugin behavior changes. Fixes are separate, later, batched work the researcher authorizes.

## 11. Out of scope / boundaries

- **No fixes in this audit.** The output is findings + a batch proposal. Every fix is a later PR (decision 1).
- **The sidebar branch and the codex-agents idea stay parked** (decision 4). The UX pass cross-references the sidebar design doc where the board's per-view asides come up, but does not audit or merge that branch.
- **Not re-litigating shipped design decisions.** The audit measures whether the plugin does what it intends coherently, efficiently, safely, and portably — not whether a landed feature was the right feature. A finding may say "this rule is stated three ways"; it does not say "this rule is wrong" unless the rule contradicts itself or the code.
- **The board React codebase gets a UX pass, not a full code review.** Correctness attention only where a UX or security defect traces into it. A general `board/src` code review is its own future effort.
- **No model/OS matrix** (decision 2). One clean-env run and one author-env run; not sonnet-vs-fable, not a Linux container. Those are a documented possible extension, not this audit.
- **Leave alone:** all shipped behavior, all committed history, the parked branch. The audit reads and measures; its only writes are its own evaluation artifacts — everything under `docs/evaluation/checkup/` (the baselines, their regeneration scripts, the threat model, the findings doc) plus the friction-log entries. No shipped file under `commands/`, `skills/`, `scripts/`, `board/`, or `hooks/` is touched.

## 12. Risks and mitigations

- **Over-claiming a finding.** The repeated lesson in this repo is that a plausible-looking defect is often not one (the stale docstring; the sidebar design doc's six wrong claims). Mitigation: every runtime claim is marked to-verify in the sweep and independently verified in 8.2 before it reaches the findings doc.
- **Cutting load-bearing redundancy.** These prompts are dense on purpose; restated invariants ("never edit vN", "tickets are forgeries", "ack after the work") protect real guarantees. Mitigation: token remediation is measure-then-decide (decision 3), every reduction carries a risk note, and fixes are regression-checked against the walkthrough harness before merge.
- **Subagent-summary error.** If any phase is parallelized across agents, their summaries can bake in wrong facts (a repeated napkin lesson). Mitigation: findings that will drive fixes are re-confirmed against real files by the controller, not trusted from a summary.
- **The audit's own token cost.** A five-dimension checkup is not cheap. Mitigation: the Instrument→Sweep→Probe structure exists precisely to read each surface once and spend the expensive lenses only where they pay; the alternative dimension-parallel structure was rejected for re-reading the whole surface five times.

## 13. Open question for the researcher

The clean-room probe (7.1) needs the isolation mechanism confirmed against current Claude Code behavior before it runs — whether `CLAUDE_CONFIG_DIR` alone fully isolates global config, skills, and permissions, or whether more is needed. The plan will resolve this via claude-code-guide in Phase 0 rather than assume it. No decision is needed now; flagged so it is not a surprise.
