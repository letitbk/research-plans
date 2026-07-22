# Board comment UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Global comment" button (an unanchored comment on the current plan) to the board's plan reader, and let reviewers edit their unsent comments in place — safely, without freezing the tab on an empty quote.

**Architecture:** All changes are in the board's React app (`board/src`). Feature 1 reuses the existing `onAddPlanComment` handler to create a `PlanCommentAnnotation` with `anchored:false` and an empty quote; a defensive guard in the paint pass prevents the empty quote from hanging the highlighter. Feature 2 lifts a small edit-state into `FeedbackPanel` so an open, uncommitted edit can't be submitted stale.

**Tech Stack:** React 19 + TypeScript, Tailwind, Vitest + @testing-library/react (jsdom). Board bundles to a single HTML via `npm run build`.

## Global Constraints

- Work on branch `add-features` (never `main`).
- No new dependencies. Match existing file/style/Tailwind conventions.
- Every task is TDD: failing test first, minimal impl, green, commit.
- Run tests from `board/`: `npx vitest run <path>`. DOM tests need `// @vitest-environment jsdom` at file top.
- Commit messages: NO `Co-Authored-By` trailer.
- "Empty" text always means `!text.trim()`.
- Do NOT touch: the sign gate, hosted-mode posting, or how real (non-empty) quotes anchor.

---

### Task 1: Guard the paint pass against empty quotes (the hang fix)

An empty-quote anchor reaches `paintOne`, where `norm.indexOf("", idx+1)` never returns `-1` → infinite loop → frozen tab. Guard it before any UI can create such a comment.

**Files:**
- Modify: `board/src/lib/anchor.ts` (function `paintHighlights`, ~line 135)
- Test: `board/src/lib/anchor.test.ts` (create)

**Interfaces:**
- Produces: `paintHighlights(container, anchors)` unchanged signature; now skips anchors whose `quote` is empty/blank (never paints them, never loops).

- [ ] **Step 1: Write the failing test**

Create `board/src/lib/anchor.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { paintHighlights } from "./anchor";

describe("paintHighlights empty-quote guard", () => {
  it("skips an empty-quote anchor without painting or hanging", () => {
    const el = document.createElement("div");
    el.innerHTML = "<p>Some plan text to anchor against.</p>";
    const outcome = paintHighlights(el, [{ id: "g1", quote: "", occurrenceIndex: 0 }]);
    expect(outcome.painted.size).toBe(0);
    expect(el.querySelector("mark[data-annotation]")).toBeNull();
  });

  it("skips a whitespace-only quote too", () => {
    const el = document.createElement("div");
    el.innerHTML = "<p>Some plan text.</p>";
    const outcome = paintHighlights(el, [{ id: "g1", quote: "   ", occurrenceIndex: 0 }]);
    expect(outcome.painted.size).toBe(0);
  });

  it("still paints a real quote alongside an empty one", () => {
    const el = document.createElement("div");
    el.innerHTML = "<p>Some plan text to anchor against.</p>";
    const outcome = paintHighlights(el, [
      { id: "g1", quote: "", occurrenceIndex: 0 },
      { id: "r1", quote: "plan text", occurrenceIndex: 0 },
    ]);
    expect(outcome.painted.has("r1")).toBe(true);
    expect(outcome.painted.has("g1")).toBe(false);
    expect(el.querySelector('mark[data-annotation="r1"]')?.textContent).toBe("plan text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd board && npx vitest run src/lib/anchor.test.ts`
Expected: the first test HANGS then fails on Vitest's test timeout (proving the infinite loop).

- [ ] **Step 3: Add the guard**

In `board/src/lib/anchor.ts`, inside `paintHighlights`'s `for (const a of anchors) {` loop, make the empty-quote skip the very first statement:

```ts
  for (const a of anchors) {
    if (!a.quote.trim()) continue; // unanchored (e.g. a global plan comment) — nothing to paint
    if (a.scope) {
```

(Leave the rest of the loop body unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd board && npx vitest run src/lib/anchor.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add board/src/lib/anchor.ts board/src/lib/anchor.test.ts
git commit -m "fix(board): skip empty-quote anchors in paintHighlights (hang guard)"
```

---

### Task 2: Empty-quote rendering touch-ups

An unanchored comment has an empty quote; render it cleanly (no blank `""` box, no `Feedback on: ""`).

**Files:**
- Modify: `board/src/lib/feedback.ts` (`buildFeedbackMarkdown`, plan-comment case ~line 117)
- Modify: `board/src/components/FeedbackPanel.tsx` (`AnnotationCard` quote block ~line 145)
- Test: `board/src/lib/feedback.test.ts` (add), `board/src/components/FeedbackPanel.test.tsx` (add)

**Interfaces:**
- Produces: `buildFeedbackMarkdown` omits the `Feedback on:` line when a plan-comment's `quote` is empty; `AnnotationCard` renders no quote block when `quote` is empty.

- [ ] **Step 1: Write the failing markdown test**

Add to `board/src/lib/feedback.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildFeedbackMarkdown } from "./feedback";
import type { PlanCommentAnnotation } from "./types";

function planComment(quote: string): PlanCommentAnnotation {
  return {
    id: "a1", type: "plan-comment", planPath: "plans/execution/01-x/v1.md",
    component: "01-x", version: 1, isDraft: false, quote, prefix: "", suffix: "",
    sectionHeading: "", occurrenceIndex: 0, anchored: quote !== "", comment: "whole-plan note",
  };
}

describe("buildFeedbackMarkdown unanchored plan comment", () => {
  it("omits the Feedback-on line when the quote is empty", () => {
    const md = buildFeedbackMarkdown([planComment("")]);
    expect(md).toContain("[01-x v1]");
    expect(md).toContain("whole-plan note");
    expect(md).not.toContain('Feedback on: ""');
    expect(md).not.toContain("Feedback on:");
  });

  it("keeps the Feedback-on line for a real quote", () => {
    const md = buildFeedbackMarkdown([planComment("some quoted text")]);
    expect(md).toContain('Feedback on: "some quoted text"');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd board && npx vitest run src/lib/feedback.test.ts`
Expected: FAIL — the first test finds `Feedback on: ""`.

- [ ] **Step 3: Fix the markdown builder**

In `board/src/lib/feedback.ts`, plan-comment case, change:

```ts
        lines.push(`Feedback on: "${a.quote}"`);
```

to:

```ts
        if (a.quote) lines.push(`Feedback on: "${a.quote}"`);
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd board && npx vitest run src/lib/feedback.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing card test**

Add to `board/src/components/FeedbackPanel.test.tsx` (reuse its existing imports; if it lacks a render helper for a single card, render the `AnnotationCard` export directly):

```ts
import { AnnotationCard } from "./FeedbackPanel";
import { render } from "@testing-library/react";
import type { PlanCommentAnnotation } from "../lib/types";

function unanchored(): PlanCommentAnnotation {
  return {
    id: "g1", type: "plan-comment", planPath: "p", component: "01-x", version: 1,
    isDraft: false, quote: "", prefix: "", suffix: "", sectionHeading: "",
    occurrenceIndex: 0, anchored: false, comment: "note on the whole plan",
  };
}

describe("AnnotationCard empty-quote", () => {
  it("shows the unanchored badge and no empty quote block", () => {
    const { container, getByText } = render(<AnnotationCard a={unanchored()} />);
    expect(getByText("unanchored")).toBeTruthy();
    // The amber quote block uses italic styling; with an empty quote it must not render.
    expect(container.querySelector(".italic")).toBeNull();
    expect(getByText("note on the whole plan")).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd board && npx vitest run src/components/FeedbackPanel.test.tsx`
Expected: FAIL — an empty italic quote block renders.

- [ ] **Step 7: Fix the card quote block**

In `board/src/components/FeedbackPanel.tsx`, change the plan/doc quote block condition:

```tsx
      {(a.type === "plan-comment" || a.type === "doc-comment") && (
```

to:

```tsx
      {(a.type === "plan-comment" || a.type === "doc-comment") && a.quote && (
```

- [ ] **Step 8: Run to verify it passes**

Run: `cd board && npx vitest run src/components/FeedbackPanel.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add board/src/lib/feedback.ts board/src/lib/feedback.test.ts board/src/components/FeedbackPanel.tsx board/src/components/FeedbackPanel.test.tsx
git commit -m "feat(board): render unanchored plan comments cleanly (no empty quote chrome)"
```

---

### Task 3: Feature 1 — "Global comment" on the current plan

A toolbar button that opens an inline composer and creates an unanchored plan comment.

**Files:**
- Modify: `board/src/views/PlanReader.tsx` (state + toolbar button + composer + `docAnnotations` filter)
- Test: `board/src/views/PlanReader.global-comment.test.tsx` (create)

**Interfaces:**
- Consumes: the existing `onAddPlanComment: (a: Omit<PlanCommentAnnotation, "id" | "type">) => void` prop.
- Produces: a "Global comment" button visible only when `annotatable && !diffOn`; Save calls `onAddPlanComment` with `anchored:false`, empty anchor fields, and the current doc's `planPath/component/version/isDraft`.

- [ ] **Step 1: Write the failing test**

Create `board/src/views/PlanReader.global-comment.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import PlanReader from "./PlanReader";
import type { BoardData } from "../lib/types";

afterEach(cleanup);

const PLAN_PATH = "plans/execution/01-x/v1.md";
const PLAN = ["# X — Execution Plan v1", "", "## Context", "Body text here.", "", "Signed off: BK, 2026-07-18"].join("\n");

function data(): BoardData {
  return {
    schemaVersion: 1, generatedAt: "t", mode: "static", focus: null, detailLevel: "standard",
    project: { name: "p" }, git: { available: false },
    files: {
      masterPlan: { path: "plans/master-plan.md", content: "# MP" },
      decisionLog: { path: "plans/decision-log.md", content: "# DL" },
      executionPlans: [{ component: "01-x", versions: [{ version: 1, path: PLAN_PATH, content: PLAN }] }],
      reviews: [],
    },
  } as unknown as BoardData;
}

function draw(canAnnotate = true, onAddPlanComment = vi.fn()) {
  render(
    <PlanReader data={data()} canAnnotate={canAnnotate} selectedComponent="01-x"
      annotations={[]} onAddPlanComment={onAddPlanComment} onPaintResult={vi.fn()} onOpenResults={vi.fn()} />,
  );
  return onAddPlanComment;
}

describe("PlanReader global comment", () => {
  it("adds an unanchored plan comment attributed to the current doc", () => {
    const onAdd = draw();
    fireEvent.click(screen.getByRole("button", { name: "Global comment" }));
    fireEvent.change(screen.getByPlaceholderText(/comment on this whole plan/i), {
      target: { value: "  a whole-plan note  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toMatchObject({
      anchored: false, quote: "", planPath: PLAN_PATH, component: "01-x", version: 1,
      isDraft: false, comment: "a whole-plan note",
    });
  });

  it("hides the button when the doc is not annotatable", () => {
    draw(false);
    expect(screen.queryByRole("button", { name: "Global comment" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd board && npx vitest run src/views/PlanReader.global-comment.test.tsx`
Expected: FAIL — no "Global comment" button.

- [ ] **Step 3: Add composer state + save handler**

In `board/src/views/PlanReader.tsx`, after the `annotatable` const (~line 336) and before `return (`, add:

```tsx
  const [globalOpen, setGlobalOpen] = useState(false);
  const [globalText, setGlobalText] = useState("");
  useEffect(() => {
    setGlobalOpen(false);
    setGlobalText("");
  }, [doc.path]);
  const saveGlobal = () => {
    if (!globalText.trim()) return;
    onAddPlanComment({
      quote: "", prefix: "", suffix: "", sectionHeading: "", scope: "",
      occurrenceIndex: 0, anchored: false,
      planPath: doc.path, component: group.component, version: doc.version, isDraft: doc.isDraft,
      comment: globalText.trim(),
    });
    setGlobalOpen(false);
    setGlobalText("");
  };
```

(`useState`/`useEffect` are already imported at the top of the file.)

- [ ] **Step 4: Add the toolbar button**

In the header's `ml-auto` cluster (~line 358, alongside `ReviewMenu` and the Diff toggle), add:

```tsx
            {annotatable && !diffOn && (
              <button
                className="rounded-full border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 hover:border-stone-500 dark:hover:border-stone-400"
                onClick={() => setGlobalOpen((o) => !o)}
              >
                Global comment
              </button>
            )}
```

- [ ] **Step 5: Add the composer box**

Immediately after the header `</div>` that closes the top toolbar row (~line 385), add:

```tsx
        {annotatable && globalOpen && !diffOn && (
          <div className="mb-3 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 p-2 shadow-sm">
            <textarea
              autoFocus
              value={globalText}
              onChange={(e) => setGlobalText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveGlobal();
                if (e.key === "Escape") { setGlobalOpen(false); setGlobalText(""); }
              }}
              placeholder="A comment on this whole plan… (⌘↵ to save)"
              className="h-20 w-full resize-none rounded border border-stone-200 dark:border-stone-800 p-2 text-sm outline-none focus:border-stone-400 dark:focus:border-stone-500"
            />
            <div className="mt-1 flex justify-end gap-2">
              <button
                className="rounded px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                onClick={() => { setGlobalOpen(false); setGlobalText(""); }}
              >
                Cancel
              </button>
              <button
                className="rounded bg-stone-900 dark:bg-stone-200 px-3 py-1 text-xs font-medium text-white dark:text-stone-900 hover:bg-stone-700 dark:hover:bg-stone-400 disabled:opacity-40"
                disabled={!globalText.trim()}
                onClick={saveGlobal}
              >
                Save comment
              </button>
            </div>
          </div>
        )}
```

- [ ] **Step 6: Filter empty-quote comments out of the paint set**

Change `docAnnotations` (~line 299) so unanchored comments never reach the paint layer:

```tsx
  const docAnnotations = useMemo(
    () =>
      annotations.filter(
        (a): a is PlanCommentAnnotation =>
          a.type === "plan-comment" && doc !== null && a.planPath === doc.path && a.quote.trim() !== "",
      ),
    [annotations, doc],
  );
```

- [ ] **Step 7: Run to verify it passes**

Run: `cd board && npx vitest run src/views/PlanReader.global-comment.test.tsx`
Expected: 2 passed.

- [ ] **Step 8: Run the highlight regression + full plan-reader tests (no breakage)**

Run: `cd board && npx vitest run src/views/PlanReader.highlight-persist.test.tsx src/views/PlanReader.metadata.test.tsx`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add board/src/views/PlanReader.tsx board/src/views/PlanReader.global-comment.test.tsx
git commit -m "feat(board): Global comment button — unanchored comment on the current plan"
```

---

### Task 4: Feature 2 — Edit unsent comments in place

Edit the text of a local (unsent) comment; block submitting a stale open edit.

**Files:**
- Modify: `board/src/App.tsx` (add `editAnnotation` ~line 436; add `onEdit: editAnnotation` to `panelProps` ~line 918)
- Modify: `board/src/components/FeedbackPanel.tsx` (panel-owned edit state; `AnnotationCard` edit UI; disable submit while editing; `onEdit` in props)
- Test: `board/src/components/FeedbackPanel.edit.test.tsx` (create)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `editAnnotation(id: string, text: string): void` in App; `FeedbackPanelProps.onEdit: (id: string, text: string) => void`; `AnnotationCard` gains optional `editing`, `draft`, `onEditStart`, `onEditChange`, `onEditSave`, `onEditCancel` props.

- [ ] **Step 1: Write the failing test**

Create `board/src/components/FeedbackPanel.edit.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import FeedbackPanel, { type FeedbackPanelProps } from "./FeedbackPanel";
import type { PlanCommentAnnotation } from "../lib/types";

afterEach(cleanup);

function comment(id: string, text: string): PlanCommentAnnotation {
  return {
    id, type: "plan-comment", planPath: "p", component: "01-x", version: 1, isDraft: false,
    quote: "q", prefix: "", suffix: "", sectionHeading: "", occurrenceIndex: 0, anchored: true, comment: text,
  };
}

function props(over: Partial<FeedbackPanelProps> = {}): FeedbackPanelProps {
  return {
    variant: "overlay", annotations: [comment("a1", "first")], serverLive: [], serverStale: [],
    hosted: false, canPost: true, submitState: "idle", reviewer: "", savingIds: new Set(),
    onReviewerChange: vi.fn(), onRemove: vi.fn(), onSaveHosted: vi.fn(), onEdit: vi.fn(),
    onClose: vi.fn(), onSubmit: vi.fn(), onDownload: vi.fn(), onCopyFallback: vi.fn(),
    ...over,
  };
}

describe("FeedbackPanel edit unsent comments", () => {
  it("edits a local comment's text via onEdit", () => {
    const onEdit = vi.fn();
    render(<FeedbackPanel {...props({ onEdit })} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue("first"), { target: { value: "edited text" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEdit).toHaveBeenCalledWith("a1", "edited text");
  });

  it("disables Send while an edit is open", () => {
    render(<FeedbackPanel {...props()} />);
    const send = screen.getByRole("button", { name: /Send to Claude/ });
    expect(send).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: /Send to Claude/ })).toBeDisabled();
  });

  it("shows no Edit button on sent (serverLive) comments", () => {
    render(
      <FeedbackPanel
        {...props({
          annotations: [], hosted: true,
          serverLive: [{ id: "s1", annotation: comment("s1", "sent"), author: "BK", receivedAt: "" } as never],
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd board && npx vitest run src/components/FeedbackPanel.edit.test.tsx`
Expected: FAIL — `onEdit` not a prop / no Edit button.

- [ ] **Step 3: Add `onEdit` to props + panel edit state**

In `board/src/components/FeedbackPanel.tsx`:

Add to `FeedbackPanelProps` (after `onSaveHosted`):

```tsx
  onEdit: (id: string, text: string) => void;
```

Add near the top of `export default function FeedbackPanel(p)`:

```tsx
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
```

Add `useState` to the React import at the top of the file:

```tsx
import { useState } from "react";
```

- [ ] **Step 4: Wire edit props into the local card list**

In the `p.annotations.map((a) => (` block, add these props to `<AnnotationCard>`:

```tsx
            editing={editingId === a.id}
            draft={editingId === a.id ? draft : undefined}
            onEditStart={() => { setEditingId(a.id); setDraft(a.comment); }}
            onEditChange={setDraft}
            onEditSave={() => { if (draft.trim()) { p.onEdit(a.id, draft.trim()); setEditingId(null); } }}
            onEditCancel={() => setEditingId(null)}
```

- [ ] **Step 5: Disable submit paths while editing**

Send button `disabled` (~line 285) — add `|| editingId !== null`:

```tsx
              disabled={
                p.annotations.length === 0 ||
                p.submitState === "sending" ||
                editingId !== null
              }
```

Download button `disabled` (~line 328):

```tsx
              disabled={p.annotations.length === 0 || editingId !== null}
```

Hosted per-card Save `disabled` (~line 224) — add `|| editingId !== null`:

```tsx
                    disabled={!p.reviewer.trim() || p.savingIds.has(a.id) || editingId !== null}
```

- [ ] **Step 6: Add edit props + UI to `AnnotationCard`**

Extend `AnnotationCard`'s prop type (after `onOpen?`):

```tsx
  editing?: boolean;
  draft?: string;
  onEditStart?: () => void;
  onEditChange?: (t: string) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
```

Replace the delete-button block (`{onDelete && (...)}`, ~line 132) with a combined actions cluster:

```tsx
        {(onEditStart || onDelete) && (
          <span className="ml-auto flex items-center gap-2">
            {onEditStart && !editing && (
              <button
                className="text-stone-400 dark:text-stone-500 hover:text-stone-700"
                onClick={(e) => { e.stopPropagation(); onEditStart(); }}
                title="Edit"
              >
                Edit
              </button>
            )}
            {onDelete && (
              <button
                className="text-stone-400 dark:text-stone-500 hover:text-red-600"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                title="Delete"
              >
                ✕
              </button>
            )}
          </span>
        )}
```

Replace the comment body (`<div className="text-stone-700 dark:text-stone-300">{a.comment}</div>`, ~line 160) with:

```tsx
      {editing ? (
        <div onClick={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            value={draft ?? ""}
            onChange={(e) => onEditChange?.(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onEditSave?.();
              if (e.key === "Escape") onEditCancel?.();
            }}
            className="h-16 w-full resize-none rounded border border-stone-200 dark:border-stone-800 p-1.5 text-xs outline-none focus:border-stone-400 dark:focus:border-stone-500"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              className="rounded px-2 py-0.5 text-[11px] text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              onClick={(e) => { e.stopPropagation(); onEditCancel?.(); }}
            >
              Cancel
            </button>
            <button
              className="rounded bg-stone-900 dark:bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-white dark:text-stone-900 disabled:opacity-40"
              disabled={!(draft ?? "").trim()}
              onClick={(e) => { e.stopPropagation(); onEditSave?.(); }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="text-stone-700 dark:text-stone-300">{a.comment}</div>
      )}
```

- [ ] **Step 7: Add the App handler + wire it**

In `board/src/App.tsx`, after `removeAnnotation` (~line 438), add:

```tsx
  const editAnnotation = useCallback((id: string, text: string) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, comment: text } : a)));
  }, []);
```

Add to `panelProps` (~line 928, next to `onRemove`):

```tsx
    onEdit: editAnnotation,
```

- [ ] **Step 8: Run to verify it passes**

Run: `cd board && npx vitest run src/components/FeedbackPanel.edit.test.tsx`
Expected: 3 passed.

- [ ] **Step 9: Full suite + rebuild the served board**

Run: `cd board && npx vitest run`
Expected: all green (previously 457+ tests).

Then rebuild the committed board bundle so `./rp-board` serves the new UI:

Run: `cd board && npm run build`
Expected: writes `dist/index.html` and copies it to `../skills/managing-research-plans/assets/board-template.html`.

- [ ] **Step 10: Commit**

```bash
git add board/src/App.tsx board/src/components/FeedbackPanel.tsx board/src/components/FeedbackPanel.edit.test.tsx skills/managing-research-plans/assets/board-template.html
git commit -m "feat(board): edit unsent comments in place; block submitting an open edit"
```

---

## Self-Review

- **Spec coverage:** #1 global comment (Task 3) · empty-quote hang guard (Task 1) · empty-quote rendering in panel + markdown (Task 2) · diff-mode hide + doc-change reset (Task 3) · #2 edit local unsent (Task 4) · event isolation + submit-gating + panel-owned state (Task 4) · no edit on sent (Task 4). All spec sections map to a task.
- **Placeholders:** none — every code and test step is complete.
- **Type consistency:** `editAnnotation(id, text)` / `onEdit(id, text)` used identically in App, props, and card; `AnnotationCard` edit props match between the panel wiring (Task 4 Step 4) and the card definition (Task 4 Step 6); the unanchored comment object matches `Omit<PlanCommentAnnotation,"id"|"type">` (Task 3).
