# Board control surface 2/3 — React client (docked panel, click-sync, action clusters, reconnect) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the board UI into the control surface: feedback docked side-by-side with two-way click-sync, state-aware researcher-action clusters in Tracker/Plans/Results, and a reconnect state machine that survives the relaunch loop.

**Architecture:** Pure logic first (reconnect reducer, storage, action availability, nav targets) as tested `board/src/lib/*` modules; then a `FeedbackPanel` extraction and layout change; then view wiring. Server contracts consumed from plan 1/3 (boardToken, actionId/bootId/projectId responses, typed `action` body, 409s). Template rebuild (`npm run build`) at the end of each UI task keeps `assets/board-template.html` current.

**Tech Stack:** React 19, TypeScript 5.6, Tailwind v4 (CSS-first, default breakpoints), Vitest 3. NEW dev-deps (decided per spec §7/§9): `jsdom` + `@testing-library/react` for component tests, via per-file `// @vitest-environment jsdom` pragma (existing 8 lib test files stay in node env).

**Spec:** `docs/specs/2026-07-09-board-control-surface-design.md` §2–§4. Anchors at `0d01a90`.

## Global Constraints

- One annotate gesture everywhere: drag-select → Comment pill (AnnotationLayer). No new comment buttons.
- `canPost = data.mode === "live"` (`App.tsx:259`) stays the sole action gate; hosted/remote/static get NO action clusters.
- Review controls hidden in gate mode in EVERY view (uniform rule, replaces per-view `!data.gate` guards; also hides Results' in-gate button).
- Dark-mode variants required on every new element (`dark:` classes, v0.11 conventions).
- After any `board/src` change that alters rendering: `cd board && npm run build` to refresh `skills/managing-research-plans/assets/board-template.html`, and commit the template with the source.
- Suites green before and after every task: `npm --prefix board test` (95 at baseline) and `python3 -m pytest tests/ -q` (179 + plan-1 additions).

---

### Task 1: Reconnect reducer (pure lib)

**Files:**
- Create: `board/src/lib/reconnect.ts`
- Test: `board/src/lib/reconnect.test.ts` (node env, like the existing 8)

**Interfaces (produced — App wiring in Task 6 consumes exactly these):**

```ts
export type ConnPhase =
  | { kind: "online" }
  | { kind: "submitting" }
  | { kind: "accepted"; actionId: string; bootId: string; projectId: string; at: number }
  | { kind: "applying"; actionId: string; bootId: string; projectId: string; since: number }
  | { kind: "sleeping" }
  | { kind: "stalled"; actionId: string; since: number };

export type ConnEvent =
  | { type: "submit" }
  | { type: "post-accepted"; actionId: string; bootId: string; projectId: string; now: number }
  | { type: "post-failed" }
  | { type: "health"; bootId: string; projectId: string; now: number }
  | { type: "health-miss"; now: number }
  | { type: "reset" };

export const POLL_MS = 3000;
export const SLEEP_AFTER_MISSES = 4;   // consecutive misses while online
export const STALL_AFTER_MS = 120_000; // applying this long -> stalled (info only)

export interface ConnState { phase: ConnPhase; misses: number; }
export const initialConn: ConnState;
export function reduceConn(s: ConnState, e: ConnEvent): ConnState;
// True when the health identity proves a fresh server for the same project:
export function isNewServer(phase: ConnPhase, bootId: string, projectId: string): boolean;
```

Semantics (each is a test): `submit` → submitting. `post-accepted` → accepted (baseline bootId comes from the POST response, never a pre-poll — spec §4). `post-failed` → online (copy-fallback allowed only here). From accepted/applying, `health` with SAME projectId and DIFFERENT bootId → caller reloads (`isNewServer` true); same bootId → applying (server still old); different projectId → ignored (foreign board on the port). From online, `health-miss` increments misses; misses ≥ SLEEP_AFTER_MISSES → sleeping. From applying, `health-miss` does NOT sleep (server gap is expected); when `now - since >= STALL_AFTER_MS` → stalled (UI shows "still applying — reviewer runs can take many minutes; run /board if this session ended"). `reset` → initial.

- [ ] **Step 1: Write the failing tests** — `board/src/lib/reconnect.test.ts`, one `it` per semantic above, e.g.:

```ts
import { describe, it, expect } from "vitest";
import { initialConn, reduceConn, isNewServer, SLEEP_AFTER_MISSES, STALL_AFTER_MS } from "./reconnect";

const accepted = () =>
  reduceConn(reduceConn(initialConn, { type: "submit" }),
    { type: "post-accepted", actionId: "a1", bootId: "b1", projectId: "p1", now: 1000 });

describe("reconnect reducer", () => {
  it("accepts from the POST response, not a pre-poll", () => {
    const s = accepted();
    expect(s.phase).toMatchObject({ kind: "accepted", bootId: "b1" });
  });
  it("new bootId + same project means reload", () => {
    const s = accepted();
    expect(isNewServer(s.phase, "b2", "p1")).toBe(true);
    expect(isNewServer(s.phase, "b1", "p1")).toBe(false);
    expect(isNewServer(s.phase, "b2", "OTHER")).toBe(false);
  });
  it("misses while applying never sleep", () => {
    let s = accepted();
    for (let i = 0; i < SLEEP_AFTER_MISSES + 2; i++)
      s = reduceConn(s, { type: "health-miss", now: 2000 + i });
    expect(s.phase.kind).not.toBe("sleeping");
  });
  it("online misses sleep after threshold", () => {
    let s = initialConn;
    for (let i = 0; i < SLEEP_AFTER_MISSES; i++)
      s = reduceConn(s, { type: "health-miss", now: i });
    expect(s.phase.kind).toBe("sleeping");
  });
  it("applying stalls after STALL_AFTER_MS", () => {
    let s = accepted();
    s = reduceConn(s, { type: "health", bootId: "b1", projectId: "p1", now: 2000 });
    s = reduceConn(s, { type: "health-miss", now: 2000 + STALL_AFTER_MS + 1 });
    expect(s.phase.kind).toBe("stalled");
  });
  it("post-failed returns online (copy fallback allowed)", () => {
    const s = reduceConn(reduceConn(initialConn, { type: "submit" }), { type: "post-failed" });
    expect(s.phase.kind).toBe("online");
  });
});
```

- [ ] **Step 2: Run** `cd board && npx vitest run src/lib/reconnect.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement `reconnect.ts`** — a single `reduceConn` switch implementing exactly the semantics table; `accepted` transitions to `applying` on the first `health`/`health-miss` after acceptance (carry `since: now`).
- [ ] **Step 4: Run** the file test, then `npm --prefix board test` — Expected: all pass.
- [ ] **Step 5: Commit** `git add board/src/lib/reconnect.ts board/src/lib/reconnect.test.ts && git commit -m "feat(board-ui): reconnect reducer — accepted/applying/sleeping/stalled state machine"`

---

### Task 2: Project-keyed draft storage + submitted-id clearing (pure lib)

**Files:**
- Create: `board/src/lib/drafts.ts`; Test: `board/src/lib/drafts.test.ts` (node env; fake `Storage` via a Map wrapper)
- Modify (consume): `board/src/App.tsx:263-268` (`storageKey`), `:287` (init read), `:411-418` (persist), `:582/:625/:720` (clears)

**Interfaces:**

```ts
export function liveDraftKey(project: string): string;           // `rp-board:${project}:live`
export function legacyDraftKey(project: string, payloadHash: string): string; // old scheme
export function loadDrafts(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
                           project: string, payloadHash: string): Annotation[];
// merges legacy key into live key once, removes legacy
export function clearSubmitted(storage: ..., project: string, submittedIds: string[]): void;
// removes ONLY the submitted ids from the stored array; keeps the rest
```

Hosted keys (`webKey` `App.tsx:267`) are untouched. `:reviewer` / `:seeded` suffix keys migrate with the same helper (suffix param).

- [ ] **Step 1: Failing tests** — cases: fresh load empty; legacy-key migration merges and deletes old; `clearSubmitted` removes only given ids; reload after partial submit keeps unsubmitted drafts.
- [ ] **Step 2: Run** `npx vitest run src/lib/drafts.test.ts` — FAIL.
- [ ] **Step 3: Implement** `drafts.ts`; then wire App.tsx: replace `storageKey` (:263) with `liveDraftKey(data.project.name)` for live/remote, keep hosted `pendingKey` logic (:268); init read (:287) → `loadDrafts(...)`; the three full-key `removeItem` clears (:582, :625, :720) → `clearSubmitted(storage, project, annotations.map(a => a.id))` for exactly the annotations included in that POST.
- [ ] **Step 4: Run** `npm --prefix board test` + `npm run build` — pass, template rebuilt.
- [ ] **Step 5: Commit** `git add board/src/lib/drafts.ts board/src/lib/drafts.test.ts board/src/App.tsx skills/managing-research-plans/assets/board-template.html && git commit -m "feat(board-ui): project-keyed draft storage, clear only submitted ids"`

---

### Task 3: jsdom harness + FeedbackPanel extraction + docked layout

**Files:**
- Modify: `board/package.json` (devDeps), `board/vite.config.ts` (test block), `board/src/App.tsx` (:805-913 header/root, :915 main, :1013-1193 drawer)
- Create: `board/src/components/FeedbackPanel.tsx`; Test: `board/src/components/FeedbackPanel.test.tsx` (jsdom)

**Interfaces:**
- `FeedbackPanel` props — lifted verbatim from the current drawer's data needs: `{ annotations, serverLive, serverStale, hosted, remote, gate, canPost, submitState, pendingVerdict, reviewerName, onReviewerName, onRemove, onSaveHosted, savingIds, onClose, onSubmit, onGateApprove, onGateDeny, onDownload, onCopyFallback, onCardClick }` — copy the exact types from the drawer block's current usages (`App.tsx:1013-1191`); `onCardClick(a: Annotation)` is new (Task 4 consumes).
- Layout contract: root stays a block column (header outside — spec §2); BELOW the header, a wrapper `<div className="mx-auto flex w-full max-w-[1440px] gap-0">` holds `<main className="min-w-0 flex-1 px-5 py-6">` and, when open ≥`lg`, `<FeedbackPanel className="hidden lg:flex w-[380px] shrink-0 sticky top-[57px] h-[calc(100vh-57px)] flex-col border-l border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">`. Below `lg` the panel renders in today's overlay form (`fixed right-0 top-0 z-40 h-full w-80 …`) PLUS a scrim `<div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose}>`. The old `max-w-5xl` on `<main>` (:915) moves to an inner content div so prose width is preserved while the row flexes. Header inner bar (:808) widens to `max-w-[1440px]` to align.

- [ ] **Step 1: Add dev-deps + vitest env plumbing**

```bash
cd board && npm install -D jsdom @testing-library/react
```

In `vite.config.ts` add `test: { environment: "node" }` top-level; component tests opt in per-file with `// @vitest-environment jsdom` as the first line. Run `npm --prefix board test` — 95+prior still green.

- [ ] **Step 2: Failing component test** — `FeedbackPanel.test.tsx` (jsdom pragma): renders cards for given annotations; shows gate footer when `gate` set; shows Send when `canPost && !gate`; calls `onCardClick(a)` when a card body is clicked; delete button calls `onRemove(id)`. Use `@testing-library/react`'s `render`/`screen`/`fireEvent`; assert by visible copy (e.g. `screen.getByText("Send to Claude")` — exact strings from `App.tsx:1144`, `:1104-1117`).
- [ ] **Step 3: Run** — FAIL (component missing).
- [ ] **Step 4: Extract + relayout** — Move `App.tsx:1013-1191` into `FeedbackPanel.tsx` mostly verbatim (cards keep `AnnotationCard` import), parameterized by the props above; implement the two render forms (docked / overlay+scrim) selected purely by CSS classes (`hidden lg:flex` vs `lg:hidden`) so no JS viewport detection is added. Rewire App per the layout contract. Preserve every existing string and dark: class.
- [ ] **Step 5: Run** `npm --prefix board test && npm run build` — pass; then a MANUAL VISUAL CHECK (spec §9): `python3 skills/managing-research-plans/scripts/board.py --export` in a walkthrough project (`scripts/new-walkthrough.py` spins one up) or any repo with plans/, open the export, verify at 1024/1280/1665px: docked panel reflows (no overlap, no horizontal scroll with the Tracker table), overlay+scrim below lg, dark mode both forms.
- [ ] **Step 6: Commit** `git add board/package.json board/package-lock.json board/vite.config.ts board/src/components/FeedbackPanel.tsx board/src/components/FeedbackPanel.test.tsx board/src/App.tsx skills/managing-research-plans/assets/board-template.html && git commit -m "feat(board-ui): docked FeedbackPanel column with overlay fallback + jsdom harness"`

---

### Task 4: Click-sync — nav targets, lifted view selection, highlight wiring

**Files:**
- Create: `board/src/lib/navTarget.ts`; Test: `board/src/lib/navTarget.test.ts` (node)
- Modify: `board/src/App.tsx` (view props :916-1010, new lifted state), `board/src/views/PlanReader.tsx:145-148` (docIdx), `board/src/views/Results.tsx:173-194` (idx/openScript), `board/src/views/Archive.tsx:54-55` (idx), `board/src/views/Scorecard.tsx:37,48` (idx), `board/src/views/Timeline.tsx:56-64` (filter/query), `board/src/components/ScriptViewer.tsx` (saved-annotation line targets), `board/src/index.css` (flash ring)

**Interfaces:**

```ts
// navTarget.ts
export interface NavTarget {
  tab: "tracker" | "plans" | "results" | "timeline" | "reviews" | "archive";
  component?: string;          // "NN-slug"
  planPath?: string;           // -> PlanReader docIdx lookup
  resultsVersion?: number;     // -> Results idx lookup
  scriptPath?: string;         // -> Results openScript
  archivePath?: string;        // -> Archive idx lookup
  reviewPath?: string;         // -> Scorecard idx lookup
  clearTimelineFilter?: boolean;
  annotationId: string;
  anchored: boolean;           // false -> navigate only, no scroll, show notice
}
export function navTargetFor(a: Annotation, data: BoardData): NavTarget;
```

Mapping rules per annotation type (`types.ts:303-421`): plan-comment → tab plans + planPath; result-comment → tab results + component + resultsVersion (+ scriptPath when `target.surfaceScope` starts with `provenance-script`); script-comment → results + openScript = script path; doc-comment → its `view` (:365) (+ archivePath/reviewPath from docKey conventions — `archive:<path>` `Archive.tsx:66`, review.path `Scorecard.tsx:53`; timeline targets set `clearTimelineFilter`); general → its view. Lifted state in App: `planDocPath: string | null`, `resultsFocus: {component, version} | null`, `openScript: string | null`, `archivePath: string | null`, `reviewPath: string | null`, `timelineFilterReset: number` (bump to force "all") — each view keeps its `useState` as the uncontrolled default but accepts an optional controlled prop + change callback (pattern: `const idx = props.idx ?? localIdx`), so existing behavior is unchanged when props are absent. Scroll: after nav, `requestAnimationFrame` twice, then `document.querySelector('mark[data-annotation="<id>"]')` → `scrollIntoView({block: "center"})` + add class `annot-flash` (CSS: 2s ring via `outline: 2px solid` amber + fade, plus `dark:` variant) to ALL matching marks (multi-mark). Reverse direction: `mark[data-annotation]` gets a delegated click listener in `AnnotationLayer`'s container that calls `onHighlightClick(id)` → App opens panel + scrolls card (`data-card-id` attr on panel cards) + flash. ScriptViewer: render saved script-comment line ranges as `data-annotation`-attributed row highlights so script comments have a target (extend its props with `saved: ScriptCommentAnnotation[]`).

- [ ] **Step 1: Failing tests** — `navTarget.test.ts`: one case per annotation type asserting the full NavTarget (build minimal `BoardData` fixtures inline, mirroring `parse.test.ts` style); unanchored plan-comment → `anchored: false`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `navTarget.ts` (pure), then the App/view wiring above. `FeedbackPanel.onCardClick` → `navigateTo(navTargetFor(a, data))`. Keyboard: cards are `<button>`s already; marks get `tabIndex=0` + Enter handling in the delegated listener.
- [ ] **Step 4: Run** `npm --prefix board test && npm run build`; manual visual check: click card → view switches, highlight flashes; click highlight → panel opens to card; timeline-filtered target un-filters; unanchored card shows "no highlight in this document" toast (a small transient div, same styling family as the saveError banner `App.tsx:897-901`).
- [ ] **Step 5: Commit** `git add board/src/lib/navTarget.ts board/src/lib/navTarget.test.ts board/src/App.tsx board/src/views/*.tsx board/src/components/ScriptViewer.tsx board/src/components/AnnotationLayer.tsx board/src/components/FeedbackPanel.tsx board/src/index.css skills/managing-research-plans/assets/board-template.html && git commit -m "feat(board-ui): two-way click-sync via typed nav targets + lifted view selection"`

---

### Task 5: Action clusters, SIGNOFF emitters, reopen, uniform gate rule

**Files:**
- Create: `board/src/lib/actions.ts`; Test: `board/src/lib/actions.test.ts` (node)
- Modify: `board/src/lib/feedback.ts` (:13-25 meta, :38-48 fence, :57-153 emitters), `board/src/lib/types.ts` (SignoffRequest), `board/src/views/Tracker.tsx` (:300-304 guard, :371-470 rows), `board/src/views/PlanReader.tsx` (:282-326 strip), `board/src/views/Results.tsx` (:344-371 strip, :377-460 verdict banner), `board/src/App.tsx` (submit plumbing)
- Test additions: `board/src/lib/feedback.test.ts` (fence), `board/src/lib/hostedFeedbackFixture.test.ts` untouched (already poisons `signoff`)

**Interfaces:**

```ts
// types.ts
export interface SignoffRequest {
  component: string; version: number;
  decision: "approve" | "request-changes"; reason?: string;
}
// feedback.ts — FeedbackMeta gains signoff?: SignoffRequest (:13-25)
// buildFeedbackMarkdown emits, when meta.signoff present, FIRST section:
//   ## SIGNOFF: <component> v<N> — <decision>\n\n> <reason lines>
// actions.ts
export interface PlanActionState {
  kind: "approve" | "signedOff" | "none";
  version?: number; signedOffLine?: string;
  blockedByComments: boolean;   // target-scoped pending comments exist
}
export function planActionState(data: BoardData, componentNum: string,
                                pendingAnnotations: Annotation[]): PlanActionState;
export function reviewVisible(data: BoardData): boolean; // canPost && !data.gate — the ONE rule
```

`planActionState` rules (each a test): draft `.draft-vN.md` in payload + no signed `vN` → approve(N); signed current version (`parseExecutionPlan(...).signedOff` non-null, `parse.ts:299-300`) → signedOff + line; archived/pre-renewal or no draft → none; `blockedByComments` = any pending plan-comment whose `planPath` targets this component's draft (`PlanReader.tsx:186-193` filter logic, extracted). POST body for actions: App's new `submitAction(signoff: SignoffRequest)` posts to `/api/feedback` with `{...usual, boardToken: data.boardToken, action: {kind: "signoff", ...signoff}}` and includes ONLY the target-scoped pending annotations (unrelated drafts stay pending — spec §3). Reopen (Results, decided bundles): button `Reopen — request changes` → posts a normal feedback body (no `action`) whose markdown leads with `## REOPEN REQUEST: <component> r<N>\n\n> <required reason>` and meta gains `reopen: {component, resultsVersion, reason}`; fence key `reopen` is comment-tier (NOT in the Python action-strip list — it never authorizes anything; board.md routes it as a change request, plan 3/3). UI: verdict banner (Results.tsx:377-460) keeps the badge when `bundle.verdict` exists and adds the Reopen affordance with a required-reason `<input>` (disabled Send until non-empty). Gate rule: replace `canPost && !data.gate && onRequestReview` (`Tracker.tsx:300`, `PlanReader.tsx:301`) and `canPost && (onRequestReview || onRequestReport)` (`Results.tsx:344`) with `reviewVisible(data) && onRequestReview...` — one helper, three sites, Results now hides in gate mode. Cluster placement: Tracker Plan cell (:425-440) gains a compact cluster `[Approve v2] [Request changes] [Review ▾]` (dense, always visible — BK preference, spec §9); PlanReader version strip (:282-326) the same cluster next to the diff toggle; buttons disabled while `submitState === "sending"`; Approve disabled with tooltip when `blockedByComments`; Request-changes opens a one-field reason input inline (required when no target comments — new rule, spec §3).

- [ ] **Step 1: Failing tests** — `actions.test.ts` (the 5 `planActionState` rules + `reviewVisible` in/out of gate); `feedback.test.ts` addition: meta with `signoff` emits the `## SIGNOFF:` section first and the fence key round-trips; meta with `reopen` emits `## REOPEN REQUEST:` and fence key.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** libs then view wiring per the interface block. Every new button: stone/amber styling family + `dark:` variants copied from the neighboring ReviewMenu button (`ReviewMenu.tsx:28` area).
- [ ] **Step 4: Run** `npm --prefix board test && npm run build`; manual visual check on the walkthrough project: clusters render in all three views, hidden in gate mode and in remote/hosted/static exports; approve on a signed plan shows the badge instead.
- [ ] **Step 5: Commit** `git add board/src/lib/actions.ts board/src/lib/actions.test.ts board/src/lib/feedback.ts board/src/lib/feedback.test.ts board/src/lib/types.ts board/src/views/Tracker.tsx board/src/views/PlanReader.tsx board/src/views/Results.tsx board/src/App.tsx skills/managing-research-plans/assets/board-template.html && git commit -m "feat(board-ui): always-on action clusters, SIGNOFF/reopen emitters, uniform gate-hide rule"`

---

### Task 6: Reconnect wiring — poll, applying screen, sleeping banner, reload

**Files:**
- Modify: `board/src/App.tsx` (submitState surfaces :759-803 terminals, :1087-1095 failed banner; new `useConn` hook usage), `board/src/lib/types.ts` (BoardData gains `boardToken?: string`)
- Test: `board/src/lib/reconnect.test.ts` already covers logic; add `board/src/components/ConnBanner.test.tsx` (jsdom) for the three surfaces

**Interfaces:**
- New `useConn(data: BoardData)` hook in App.tsx: `setInterval(POLL_MS)` fetching `/api/health` (only when `data.mode === "live"`); dispatches `health`/`health-miss` with `Date.now()`; when `isNewServer(phase, bootId, projectId)` → `location.reload()`. POST helpers (`submit` :565, `requestReview` :594, `requestReport` :689, `submitAction` from Task 5, `gateApprove` :651, `gateDeny` :666) dispatch `submit` before fetch, `post-accepted` with the response's `{actionId, bootId, projectId}` on 200, `post-failed` on network error, and surface `409 already-accepted` as a distinct "already applying your earlier action" note (no fallback), `409 stale-draft` as "the plan changed on disk — the board will refresh" (then poll reloads).
- UI surfaces replacing the one-shot terminals for LIVE mode only (`:784-803` "Feedback sent" and `:759-782` approved/denied screens stay for gate/batch/remote flows): phase `accepted|applying` → full-width bar (same position as mode banners `:868-912`): "Applying… the board will refresh itself when Claude is done. Reviewer runs can take many minutes."; `stalled` → same bar + "still applying — if this session ended, run /board to reconnect."; `sleeping` → banner "Board sleeping — run /board in your session to wake it." + ALL action/submit buttons disabled (pass `disabled` down via a `connBlocked` prop; drag-select commenting stays enabled — drafts persist). Copy-fallback button (`:1090`) renders ONLY in `post-failed` (never after accepted — spec §4).

- [ ] **Step 1: Failing test** — `ConnBanner.test.tsx`: renders the right copy per phase (`applying`, `stalled`, `sleeping`); sleeping disables a passed button.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `ConnBanner` + `useConn` + POST plumbing per interface block.
- [ ] **Step 4: Run** `npm --prefix board test && npm run build`. Manual check with a REAL live board (`python3 skills/managing-research-plans/scripts/board.py` in the walkthrough project): submit a comment → Applying bar appears; kill the server (Ctrl-C) → after ~4 misses in online phase the sleeping banner appears and buttons disable; relaunch → the tab reloads itself (new bootId, same projectId).
- [ ] **Step 5: Commit** `git add board/src/App.tsx board/src/components/ConnBanner.tsx board/src/components/ConnBanner.test.tsx board/src/lib/types.ts skills/managing-research-plans/assets/board-template.html && git commit -m "feat(board-ui): live reconnect loop — applying/sleeping/stalled surfaces, bootId reload, no fallback after accept"`

---

## Self-review notes

- Spec §2 draft-persistence promise: Task 2 (saved cards survive; composer text not promised — nothing added for it).
- Spec §2 breakpoint: `lg` chosen as the starting point; Task 3 Step 5's visual check at 1024/1280 is the spec's required verification, adjust to `xl` there if the Tracker table overflows.
- Spec §3 "unrelated comments neither block nor ride along": Task 5's `submitAction` includes only target-scoped annotations; `clearSubmitted` (Task 2) removes only those.
- Spec §4 client rules all land in Tasks 1+6; the POST-response baseline rule is enforced by the reducer's shape (no event carries a baseline except `post-accepted`).
- Batch wizard: gains `boardToken` in its three POSTs (`BatchGate.tsx:55,61,83`) — fold into Task 6's plumbing commit.
