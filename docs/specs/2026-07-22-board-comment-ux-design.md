# Board comment UX — design

Date: 2026-07-22
Status: design (awaiting review)
Scope: two small board features on the plan reader's comment/annotation surface.

## Context

The board lets a reviewer read an execution plan and leave comments. Today the
only way to comment on a plan is **highlight-then-comment** (select text → a
bubble → a composer). Two gaps:

1. **No way to leave a whole-plan comment** without selecting text. A
   `GeneralCommentBox` exists but is wired only into the Tracker/Timeline/Archive
   views, and it produces a *view-scoped* comment with no link to which plan was
   being read.
2. **Saved comments can't be edited.** Only create + delete exist, and delete
   only for local (unsent) comments.

`#3` (inline highlights persisting) and click-to-jump were fixed separately
(memoizing `Markdown`). `#5` (a sign-off button on the board) was dropped — the
terminal-only sign gate is intentional.

## Feature 1 — "Global comment" on the current plan

An unanchored comment attributed to the plan currently open in the reader.

### UI
- A **"Global comment"** button in the plan reader's **top-right toolbar**
  (`PlanReader.tsx` header row, the `ml-auto` cluster), next to the "review with"
  `ReviewMenu` and the Diff toggle.
- Shown only when the doc is **annotatable** (`canAnnotate` and not a read-only
  draft snapshot) — the same gate the highlight flow uses.
- Clicking toggles an **inline composer** (a textarea + Save/Cancel) that appears
  just **below the header row, above the plan body**. Save is disabled on empty
  text. Escape / Cancel closes it; Save adds the comment and closes it.

### Data
- Reuses the **existing** `onAddPlanComment` handler — no new App wiring.
- Produces a `PlanCommentAnnotation` with:
  - `anchored: false`, `quote: ""`, `prefix: ""`, `suffix: ""`,
    `sectionHeading: ""`, `scope: ""`, `occurrenceIndex: 0`
  - `planPath`, `component`, `version`, `isDraft` from the current doc
  - `comment`: the entered text

### CRITICAL — guard the paint pass against empty quotes
An empty-quote comment DOES reach the paint pass: `docAnnotations` filters by
`planPath` only (`PlanReader.tsx:299`) and passes the comment into
`AnnotationLayer`, which forwards `quote: ""` to `paintHighlights`
(`AnnotationLayer.tsx:65`). In `paintOne`, `norm.indexOf("", idx + 1)` never
returns `-1`, so the occurrence loop **spins forever and freezes the tab**
(`anchor.ts:201`). Two guards (belt and suspenders):
- **Primary:** in `paintHighlights` (`anchor.ts`), `continue` for any anchor with
  an empty/blank `quote` — a defensive fix that protects every caller.
- **Also:** in `PlanReader` `docAnnotations`, filter out `!a.quote.trim()` so
  unanchored comments never enter the paint layer.
The existing `onPaintResult` `painted.size === 0` guard is unrelated — it does not
prevent the loop.

### Composer lifecycle
- **Close the composer on `doc.path` change** — otherwise Save would attach to a
  newly-selected version/component. Reset composer open-state + text when the
  displayed doc changes.
- **Hidden while `diffOn`** — the diff branch renders `DiffView` instead of
  `AnnotationLayer` (`PlanReader.tsx:494`), so commenting isn't active there. The
  button follows suit (shown only in the normal reading view).
- **"Empty" means `!text.trim()`**, matching the existing save flow
  (`AnnotationLayer.tsx:121`). Save disabled on blank.

### Rendering (two touch-ups so an empty quote reads cleanly)
- **Feedback panel** (`FeedbackPanel.tsx`): `AnnotationCard` already renders an
  "unanchored" badge for `!a.anchored` plan-comments (line ~68). Change the quote
  block (line ~145) to render only when `a.quote` is non-empty, so a blank
  `"…"` box is not shown.
- **Feedback markdown** (`feedback.ts`, plan-comment case ~117): emit
  `Feedback on: "…"` **only** when `a.quote` is non-empty — mirroring the
  result-comment case (line ~130). An unanchored plan comment then renders as
  `## N. [01-remote-work-panel v1]` followed by the comment body.

## Feature 2 — Edit unsent comments (inline, in place)

### UI
- On each **local pending** card (the cards in `p.annotations` that already get
  the ✕ delete), add an **"Edit"** control next to ✕. Clicking replaces the
  comment body text with a textarea (+ Save/Cancel). Save commits; Cancel/Escape
  reverts. Save disabled on `!text.trim()`.
- **Sent** server comments (`serverLive` / `serverStale`) get **no** Edit — they
  remain immutable, matching the existing "Comments can't be edited once sent"
  rule.

### Editing state lives in `FeedbackPanel`, not the card
So the panel can prevent shipping a stale/uncommitted edit:
- `FeedbackPanel` owns `editingId: string | null` and the draft text. Only one
  card edits at a time. `AnnotationCard` receives `editing`, `onEditStart`,
  `onEditChange`, `onEditSave`, `onEditCancel`.
- **While `editingId !== null`, disable Send / Download / copy / hosted per-card
  Save** (the submit paths at `FeedbackPanel.tsx:283, 326, 227`) so an open,
  uncommitted edit can't be submitted as stale text.
- **Event isolation:** the Edit button, the textarea, Save, and Cancel all
  `stopPropagation` (the card is clickable via `onOpen`, `FeedbackPanel.tsx:44`),
  and the textarea's `Enter`/`Escape` must not bubble to the card's `onKeyDown`
  Enter handler (`FeedbackPanel.tsx:47`). ⌘/Ctrl+Enter saves; Escape cancels.

### Data
- New `editAnnotation(id, text)` in `App.tsx`:
  `setAnnotations(prev => prev.map(a => a.id === id ? { ...a, comment: text } : a))`
  (a stable `useCallback`, like the other handlers).
- Threaded through `FeedbackPanel` as an `onEdit` prop; the panel calls it on
  Save. Passed only for the local-pending list.
- Only the `comment` **text** is editable — never the anchor/quote/target.
- Edits auto-persist to `localStorage` via the existing annotations effect
  (`App.tsx` ~358), so they survive reload.

## Out of scope
- Editing or deleting **sent** comments (deliberate immutability).
- Any change to the highlight/anchor machinery **beyond** the defensive
  empty-quote guard in `paintHighlights` — no change to how real quotes anchor,
  the sign gate, or hosted-mode comment posting.
- Re-anchoring a global comment to a text selection later (it stays unanchored).

## Testing
- **#1**
  - **Regression (the hang):** `paintHighlights` with an empty-quote anchor
    returns without painting and **does not loop** — a direct `anchor.ts` unit
    test guards the freeze. And an empty-quote comment on the current plan does
    not reach the paint layer via `docAnnotations`.
  - Clicking "Global comment" + saving adds one `PlanCommentAnnotation` with
    `anchored: false`, empty `quote`, and the current doc's
    `planPath/component/version/isDraft`.
  - Button is absent on a draft-snapshot doc, when `!canAnnotate`, and while
    `diffOn`.
  - The open composer closes when the displayed `doc.path` changes.
  - `buildFeedbackMarkdown` omits the `Feedback on:` line for an empty quote and
    keeps the `[component vN]` head + body.
  - `AnnotationCard` renders no empty quote block for a blank quote (keeps the
    "unanchored" badge).
- **#2**
  - Editing a local card updates that annotation's `comment` in state and leaves
    others untouched.
  - Save disabled on `!text.trim()`; Cancel reverts without mutating state.
  - Sent (`serverLive`) cards expose no Edit affordance.
  - Send/Download/copy are disabled while a card edit is open.

## Files touched
- `board/src/lib/anchor.ts` — skip empty-quote anchors in `paintHighlights` (#1, the hang guard).
- `board/src/views/PlanReader.tsx` — "Global comment" button + composer; filter
  empty-quote out of `docAnnotations`; hide button in diff mode; close composer
  on doc change (#1).
- `board/src/components/FeedbackPanel.tsx` — panel-owned edit state + inline
  editor with event isolation; disable submit while editing; skip empty-quote
  block (#1, #2).
- `board/src/App.tsx` — `editAnnotation` handler + thread `onEdit` (#2).
- `board/src/lib/feedback.ts` — omit `Feedback on:` for empty quote (#1).
- Tests alongside the above.
