# Board control surface: docked feedback, always-on actions, persistent serving

Date: 2026-07-09
Status: sections A–D approved by BK; pending cross-model (codex) review
Target release: v0.15 (tentative — v0.14 is reserved by the models work in `2026-07-09-updates-sharing-models-design.md`; BK owns the release train)
Implementation timing: after v0.13 sub-plans 3–4 land (see §7)

## 1. Motivation

Three researcher complaints about the live board, from use at v0.11.0:

1. **Feedback is an overlay, not a workspace.** The feedback drawer is a fixed 320px panel pinned to the right edge (`App.tsx:739`). The main content is a centered 1024px column that never moves (`App.tsx:640`), so on any window narrower than ~1664px the drawer covers content. Drawer cards and their inline highlights have no linkage in either direction. BK: "feedback should be placed side by side."
2. **Researcher actions appear and disappear.** "Review with ▾" is hidden in Tracker and Plan views whenever the board opens in sign-off-gate mode (`!data.gate` guards at `Tracker.tsx:300`, `PlanReader.tsx:301`) but not in Results (`Results.tsx:344`) — the inconsistency BK noticed as "sometimes there, sometimes not" and "gate … doesn't have this review button." The Tracker has no approve/pass action at all: plan approval exists only in the gate drawer (`App.tsx:866-888`) and the batch wizard (`BatchGate.tsx:196-224`), which are separate launch modes. Results verdict buttons vanish once a verdict exists (`Results.tsx:424`).
3. **The board dies under you.** The server is one-shot by design: the first successful action POST sets the done event and shuts the server down (`board.py:597-611`), the UI swaps to a "return to Claude" terminal screen (`App.tsx:545-563`), an idle hour also kills it (`board.py:1144`, default `--timeout 3600`), and a foreground launch dies at the Bash tool's ~600s ceiling (`board.md:17`). There is no keep-alive or reconnect anywhere in the client; later clicks surface "Could not reach the board server" (`App.tsx:857-865`). BK: buttons should always work, the whole interaction should be doable from the board, and the board should be reachable at a persistent link.

All line references in this spec are at commit `aa5ab97` (v0.11.0 on main).

**Relationship to v0.13 (in flight).** v0.13 already answers the *collaborator* persistent-link ask: a password-gated Vercel-hosted snapshot that is comment-only, with researcher actions (verdict/review/report) deliberately stripped at three layers. Nothing in v0.13 changes the local live board's lifetime. This spec is the *researcher-side* counterpart: it changes only the live board and leaves v0.13's hosted/remote security model untouched.

## 2. Design A — docked feedback panel

**Layout.** The app root becomes a flex row: `<main>` (flexible, `min-w-0`) plus the feedback panel as a real 380px column (`shrink-0`, left border) — the same sidebar pattern PlanReader/Results/Scorecard already use internally (`flex gap-5` + `w-56 shrink-0` aside, e.g. `PlanReader.tsx:213`). Content reflows when the panel opens and is never covered. Panel closed → the column unmounts and content gets full width back. The panel is sticky and full-height with its own scrolling list and a pinned footer, preserving the current internal structure (`App.tsx:751` list, `:856` footer).

**Open triggers unchanged:** the header "Feedback (N)" button, adding any comment, and gate mode's default-open (`App.tsx:169-171`).

**Two-way click-sync.** Highlights painted by `paintHighlights` gain a `data-annotation-id` attribute (today `<mark data-annotation>` has `cursor:pointer` but no handler, `anchor.ts:121-155`, `index.css:110-115`). Clicking a panel card scrolls its highlight into view and flashes a ring; clicking a highlight opens the panel, scrolls to the card, and flashes it. Unanchored comments keep their existing pill (`App.tsx:775-779`) and show a "no highlight in this document" tooltip on click instead of scrolling. Cards whose target document is not currently displayed switch to the right tab/document first (the drawer already knows each card's component/version/view).

**Narrow windows.** First real breakpoint in the app (audit found only `md:grid-cols-2` used 3×): at `lg` and up the panel docks as a column; below `lg` it falls back to today's overlay, gaining a scrim and click-outside-to-close (no scrim exists today).

**Unchanged.** Drag-select → Comment pill → popover composer (AnnotationLayer) stays the one annotate gesture everywhere; no new comment buttons. Script line-comments and GeneralCommentBox unchanged. Full dark-mode variants per the v0.11 sweep conventions.

## 3. Design B — always-available researcher actions

**Placement (live board only — `canPost`).**

- Tracker rows and the Plan view version strip get an action cluster: `[Approve vN] [Request changes] [Review with ▾]`.
- Results keeps `[Accept] [Request changes] [Review with ▾] [Generate report]` and verdicts become re-openable: once a verdict exists the banner shows the verdict badge plus a "Reopen" affordance that flips the bundle to changes-requested (comment required).
- The `!data.gate` guards at `Tracker.tsx:300` and `PlanReader.tsx:301` are removed, matching Results — "Review with ▾" no longer vanishes in gate mode.

**State-aware, not always-clickable.** A plan whose current version is already signed off shows a "✓ Signed off vN" badge instead of Approve. "Request changes" with zero pending comments prompts for a free-text comment (mirroring batch reject, `BatchGate.tsx:182-187`). Buttons disable while a submission is in flight.

**Delivery — no new trust surface.** Every new action rides the existing `POST /api/feedback` work-order channel, exactly like review/report requests today (`feedback.ts:64-98`):

- New `## SIGNOFF: <component> v<N> — approve | request-changes` work-order for Tracker/Plan actions. On approve, the session applies the sign-off exactly as the gate-approve path does today (board.md step 5 routing). On request-changes, the order carries the pending comments (comment required when none pending, §above) and the session routes them as a change request — the gate's `/api/deny` endpoint is NOT reused, since no gate context exists.
- Verdict and verdict-reopen ride the existing `## VERDICT:` order with its `results.py verdict --component … --status …` apply hint (`feedback.ts:91-98`); reopen is the same order with `--status changes_requested` and the required comment.
- No new server endpoints. The machine-readable `json board-feedback` fence gains the `signoff` key for the new order; per the repo rule that payload/fence schema changes must update Python and TypeScript together (`payload_files`/`allFiles` duplication), `feedback.ts`, `parse_fence`/`inspect_feedback_document`, and the fence tests on both sides are extended in the same change.

**Gates keep their job.** `--gate` and `--gate-batch` remain modal, synchronous launch modes for moments when a Claude flow blocks on a decision (plan sign-off enforcement). They reuse the same button components but keep one-shot semantics. Hosted/remote/static boards are untouched: comment-only, researcher-action keys stripped, per the v0.13 security model.

## 4. Design C — persistent board: relaunch loop on a stable port

**Stable port (bookmarkable).** `/board` serves on a deterministic per-project port: `41000 + (sha256(project_root) % 1000)`; if busy, probe the next 9; `--port` still overrides. Same project → same `http://127.0.0.1:<port>` across sessions, so a browser bookmark stays valid. (The 41xxx range sits outside the macOS ephemeral range 49152–65535.)

**Loop protocol (board.md step 4–6 rewrite).** The one-shot server core is unchanged; persistence lives in the command loop:

1. Launch `board.py` serving in the background on the stable port.
2. Researcher clicks an action → server writes the feedback document, exits 0 → the session is re-invoked.
3. Session executes the work-order(s): route comments, apply sign-off/verdict, run the requested reviewer or report.
4. Session relaunches the board on the same port — the payload is regenerated from disk, so the board reflects what just happened (and any work done outside the board).
5. Session ends its turn; repeat from 2.

Exit code 2 (idle hour) or SIGTERM → the loop ends, no relaunch — no infinite churn. The session stays conversable between actions; actions serialize naturally (one server, one submission at a time).

**Client reconnect.** `/api/health` (`board.py:569-572`, currently unused by the UI) gains `{bootId, generation}`: `bootId` is random per server process; `generation` is the payload hash. The client polls health every ~3s:

- After a successful action POST: show an "Applying… the board will refresh itself" state (replacing today's terminal "return to Claude" screen), poll until a server responds with a **different `bootId`**, then reload the page. Keying on `bootId` rather than `generation` matters: an action that changes no payload bytes (e.g. a routed comment) would never produce a new generation. Unsent drafts already survive reload via localStorage (`App.tsx:363-366`).
- If health stops answering while idle: banner "board sleeping — run /board to wake" and all action buttons disable, so there are no dead clicks into a gone server.
- If no new server appears within 120s of an action: fall back to the existing copy-feedback-as-markdown affordance (`App.tsx:859-863`).

**Sleep rules.** The board lives as long as the session loop runs; an idle hour puts it to sleep; the bookmark revives on the next `/board`. Gate and batch launches do not loop (modal flows, §3).

## 5. What this does NOT do

- No researcher actions on hosted/remote/static boards — v0.13 strips them by design and this spec keeps that boundary.
- No detached daemon mode (board surviving with no session attending). Considered and deferred; the loop design leaves room to layer it on later (durable `.board-feedback.md` capture plus `--collect` recovery already exist).
- No web-template changes, no new server endpoints, no change to the one-shot request core, no change to remote-mode download/email flow.

## 6. Touched surfaces and tests

- `board/src`: App.tsx (flex layout, panel column, click-sync, health poll + reload, "Applying…" state), a `FeedbackPanel` component extracted from the ~200-line drawer block (`App.tsx:738-948`), action clusters in Tracker/PlanReader/Results, `feedback.ts` (SIGNOFF order, verdict reopen), `anchor.ts` (`data-annotation-id`), template rebuild.
- `board.py`: stable-port derivation, `/api/health` bootId/generation, loop-relevant exit codes documented — request core unchanged.
- `commands/board.md`: loop protocol, routing for SIGNOFF and verdict-reopen orders, sleep/wake reporting.
- Tests: vitest for panel layout/sync/button states and the reconnect state machine (mocked fetch/health); pytest for port derivation, health payload, exit codes; the Python↔TS golden feedback fixture extended for `signoff`.

## 7. Sequencing against v0.13 (why build-after)

v0.13 sub-plan 3 (hosted React UI) rewrites the exact seams this spec touches — the mode/capability flags (`App.tsx:122-125`), the drawer footer, `types.ts` mode union — and sub-plan 4 rewrites `commands/board.md` routing and `board.py` argument dispatch. Building now would mean merging against a moving branch and re-doing their work by hand.

Decision (BK, 2026-07-09): finish this spec and its codex review now; write the implementation plan and build in a worktree branched from `v0.13-sharing` after sub-plans 3–4 land. Truly independent pieces (e.g. `data-annotation-id` in `anchor.ts`) may ship earlier if they turn out clean. The implementation plan is deliberately deferred so it can bind to v0.13's final code rather than to plan documents.

## 8. Open questions

- Port collision policy when two projects hash to the same port and both boards are up: current design probes upward, which sacrifices bookmark stability for the second project; acceptable for now.
- Whether the Tracker action cluster lives on every row always or appears on hover/focus — decide at implementation with a quick visual check (BK prefers first-class visibility; default to always-visible, dense styling).
- Whether "Reopen" on an accepted verdict should require a fresh review round before re-accepting. Out of scope; note for the workflow docs.

## Revision history

- 2026-07-09 — Initial draft from the approved brainstorm (sections A–D approved by BK via question rounds: docked panel; full control surface; relaunch loop on stable port; design-now-build-after-v0.13).
