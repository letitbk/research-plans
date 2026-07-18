Verdict: feasible, but not execution ready. I found no P0 issue and six P1 issues. The baseline tests passed, with 76 relevant tests green in the [test log](/Users/bk/github/research-plans/logs/2026-07-17_121500_v021-plan-baseline-tests.log:1).

## 1. Factual errors

1. Task 4 will not type check as written. `ParsedExecutionPlan` is defined in [types.ts:329](/Users/bk/github/research-plans/board/src/lib/types.ts:329), but Task 4 omits that file. `PlanReader` also does not import that type. The sample uses `React.Fragment`, while the file imports only the named `Fragment` value. Use `Fragment` plus an imported `ReactNode` type, or import the React namespace. [PlanReader.tsx:1](/Users/bk/github/research-plans/board/src/views/PlanReader.tsx:1), [plan:229](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:229), [plan:269](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:269)

2. The "fields all null leaves the preamble unchanged" test contradicts the implementation. `stripMetadata={Boolean(parsed?.ok)}` strips the H1 for any plan with one recognized section, even when every metadata field is null. Parser success depends on recognized sections, not valid metadata. Also, parse failure does not select `LegacyPlanBody`; only a `## Part 2` heading does. [plan:240](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:240), [plan:259](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:259), [parse.ts:318](/Users/bk/github/research-plans/board/src/lib/parse.ts:318), [PlanReader.tsx:704](/Users/bk/github/research-plans/board/src/views/PlanReader.tsx:704)

3. The annotation claims are too strong. `AnnotationLayer` passes only quote, occurrence index, and scope to the painter. The stored prefix, suffix, and section heading are not used for repainting. The painter counts every text node in the container. Removing preamble text or adding "Step N of M" text can therefore change which repeated occurrence receives a mark. [AnnotationLayer.tsx:65](/Users/bk/github/research-plans/board/src/components/AnnotationLayer.tsx:65), [anchor.ts:167](/Users/bk/github/research-plans/board/src/lib/anchor.ts:167), [anchor.ts:200](/Users/bk/github/research-plans/board/src/lib/anchor.ts:200), [plan:335](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:335)

4. Task 6 describes `useScrollSpy` as returning `string | null`, but its proposed signature returns `Element | null`. The implementation direction is clear, but the interface statement is wrong. [plan:396](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:396), [plan:416](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:416)

Confirmed claims:

- The actual template does put Component, Master plan, and Date on one line. The proposed `Component:.*` rule removes that entire line, and the master-plan regex extracts `[master-plan.md](../../master-plan.md)` correctly. This suspected regex bug is not real. [execution-plan.md:3](/Users/bk/github/research-plans/skills/managing-research-plans/templates/execution-plan.md:3), [probe log](/Users/bk/github/research-plans/logs/2026-07-17_122000_metadata-regex-probe.log:1)
- `{ Marked }` is importable, and the installed Marked 15 instance exposes `lexer`. [Markdown.tsx:1](/Users/bk/github/research-plans/board/src/components/Markdown.tsx:1), [marked.d.ts:611](/Users/bk/github/research-plans/board/node_modules/marked/lib/marked.d.ts:611)
- Task 1’s force-open, clipping, and mounted-content invariants match current behavior. [PlanReader.tsx:640](/Users/bk/github/research-plans/board/src/views/PlanReader.tsx:640), [PlanReader.tsx:669](/Users/bk/github/research-plans/board/src/views/PlanReader.tsx:669)

## 2. Design and feasibility issues

### P0

None.

### P1

1. Metadata handling loses information and does not meet the stated legacy fallback.

   The H1 is the only rendered human-readable plan title. Stripping it leaves only the component slug and version. The Release 3 spec names the metadata labels for the card, not the title. Keep the H1.

   The card also renders `masterPlan` as a plain string, so users will see literal Markdown link syntax. Current Markdown rendering would at least reduce a relative link to its label. Finally, the existing provenance badge is not removed, so provenance will still render twice. [PlanReader.tsx:438](/Users/bk/github/research-plans/board/src/views/PlanReader.tsx:438), [PlanReader.tsx:704](/Users/bk/github/research-plans/board/src/views/PlanReader.tsx:704), [Markdown.tsx:46](/Users/bk/github/research-plans/board/src/components/Markdown.tsx:46), [plan:269](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:269)

2. Existing annotation anchors are not fully preserved.

   Unique section quotes will normally repaint because matching is quote based, not absolute-offset based. Repeated quotes can move when preamble occurrences disappear. Existing annotations on the title or metadata become unanchored outright. Step labels can also steal occurrences such as "Step", "of", or a number. This conflicts with the plan’s hard annotation invariant. [anchor.ts:171](/Users/bk/github/research-plans/board/src/lib/anchor.ts:171), [plan:291](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:291), [plan:365](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:365)

3. `ListItem.text` loses valid Markdown state.

   Nested lists, loose paragraphs, soft wraps, tabs, fenced code, and indented agent-detail blocks work in the tested LF cases. Two material cases do not:

   - Reference-style links whose definition is outside the item become literal text when the item is reparsed alone. [reference-link probe](/Users/bk/github/research-plans/logs/2026-07-17_123500_marked-reference-link-probe.log:1)
   - GFM task state is stored in `task` and `checked`, then removed from `ListItem.text`. Step cards would silently drop Build-step checkboxes. [marked.esm.js:642](/Users/bk/github/research-plans/board/node_modules/marked/lib/marked.esm.js:642), [step probe](/Users/bk/github/research-plans/logs/2026-07-17_120000_marked-step-probe.log:163)

4. CRLF plans silently receive no step cards.

   Marked normalizes carriage returns before lexing, so `list.raw` contains LF while the original body contains CRLF. `body.indexOf(list.raw)` returns `-1`. Tabs and normal soft-wrapped items do not have this problem. There is no repository line-ending policy that rules CRLF out. [marked.esm.js:1125](/Users/bk/github/research-plans/board/node_modules/marked/lib/marked.esm.js:1125), [step probe](/Users/bk/github/research-plans/logs/2026-07-17_120000_marked-step-probe.log:129)

5. The PlanReader scroll spy observes headings that have no outline ID.

   PlanReader publishes only canonical section entries, effectively its H2 sections. The hook observes H1, H2, and H3, then maps each element’s text directly to an entry ID. A subsection H3 therefore clears the visible active state because no matching entry exists. If the H1 is retained, it has the same problem. Duplicate heading text is also ambiguous because IDs are text. [PlanReader.tsx:237](/Users/bk/github/research-plans/board/src/views/PlanReader.tsx:237), [plan:424](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:424), [plan:443](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:443)

   The hook also never resets `active` when its dependencies change. Switching documents or reports can temporarily highlight an entry from the previous document. Reports’ `h-${i}` mapping itself is stable because both paths use the same selector and DOM order. [outline.ts:12](/Users/bk/github/research-plans/board/src/lib/outline.ts:12), [plan:420](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:420)

6. The task-list CSS misses loose task lists.

   The proposed selectors require the checkbox to be a direct child of `li`. Marked puts the checkbox inside the first `p` for a loose list, so both bullet removal and checkbox spacing fail. [plan:133](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:133), [task-list probe](/Users/bk/github/research-plans/logs/2026-07-17_123000_marked-task-list-dom.log:7)

### P2

1. Step cards replace semantic `ol` and `li` elements with plain `div` elements. Keep an `ol` and styled `li` cards so assistive technology still announces an ordered list. Marked currently preserves those semantics. [marked.esm.js:1462](/Users/bk/github/research-plans/board/node_modules/marked/lib/marked.esm.js:1462), [plan:357](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:357)

2. The active outline entry gets visual styling and `data-active`, but no `aria-current`. [Sidebar.tsx:167](/Users/bk/github/research-plans/board/src/components/Sidebar.tsx:167), [plan:443](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:443)

3. Metadata values have no explicit light or dark text color. The card is outside `.prose-md`, so it does not inherit the prose body color rule. [plan:279](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:279), [index.css:12](/Users/bk/github/research-plans/board/src/index.css:12)

## 3. Missing steps and edge cases

1. Add `board/src/lib/types.ts` to Task 4 and import `ParsedExecutionPlan`. Fix the React import style.

2. Keep the H1. Strip metadata only when card-worthy metadata was parsed. Render the master-plan value as Markdown or extract its display label. Remove the old provenance badge.

3. Add annotation regressions for:

   - A repeated quote appearing in both the preamble and a section.
   - A body quote equal to part of "Step N of M".
   - An existing annotation on metadata, with an explicit compatibility ruling.

4. Expand step tests to cover reference links, fenced code, CRLF, task items, and more than one top-level ordered list. The spec explicitly requires links and code blocks, but Task 5’s listed tests do not. [spec:169](/Users/bk/github/research-plans/docs/specs/2026-07-16-flow-streamlining-design.md:169), [plan:312](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:312)

5. Make PlanReader observe only section H2 elements, preferably through stable `data-outline-id` attributes. Reset active state whenever the document, report, or diff mode changes. Add tests for H3 content, duplicate text, reverse scrolling, and document switches.

6. Update the checkbox selectors for both tight and loose task items.

7. Task 7 omits italics from the `plan.md` edit even though R3 requires both the template and `plan.md` to prescribe rationale italics. [spec:172](/Users/bk/github/research-plans/docs/specs/2026-07-16-flow-streamlining-design.md:172), [plan:460](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:460)

8. Add visual checks for BatchGate, Tracker, Timeline, ViewerModal Markdown, and SafeTable. The shared `.prose-md` change intentionally reaches all of them. [Markdown.tsx:88](/Users/bk/github/research-plans/board/src/components/Markdown.tsx:88), [BatchGate.tsx:271](/Users/bk/github/research-plans/board/src/views/BatchGate.tsx:271), [SafeTable.tsx:55](/Users/bk/github/research-plans/board/src/components/SafeTable.tsx:55)

9. Add an exported `file://` smoke. Snapshots are a documented first-class board mode, but Task 8 does not specify whether its browser smoke uses the live board or exported HTML. [reference.md:57](/Users/bk/github/research-plans/docs/reference.md:57), [plan:474](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:474)

No dev-data rewrite is required. Its preambles already use the actual combined format. `PlanReader.outline.test.tsx` only asserts section entries, so stripping the fixture’s Component line does not change its current assertion. The template rebuild is already included correctly in Task 8. [dev-data.ts:64](/Users/bk/github/research-plans/board/src/dev-data.ts:64), [PlanReader.outline.test.tsx:34](/Users/bk/github/research-plans/board/src/views/PlanReader.outline.test.tsx:34), [plan:473](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:473)

## 4. Risks

1. The CSS scope is intentional. The spec says all prose surfaces should change. The risk is visual regression from larger heading margins and changed table rules in constrained surfaces, not accidental scope. [spec:150](/Users/bk/github/research-plans/docs/specs/2026-07-16-flow-streamlining-design.md:150)

2. The custom-property dark override is sound. `html.dark` is more specific than `:root`, and Tailwind’s custom dark variant does not interfere. The uncertain browser feature is `:has()`. The project declares `esnext` but no explicit minimum browser contract. [index.css:3](/Users/bk/github/research-plans/board/src/index.css:3), [vite.config.ts:14](/Users/bk/github/research-plans/board/vite.config.ts:14)

3. Default-root IntersectionObserver is appropriate because Plans and Reports scroll with the window. The reading container is a normal-flow div, not an inner scroller. If IntersectionObserver is unavailable, the proposed hook safely leaves the outline navigable but inactive. [App.tsx:1256](/Users/bk/github/research-plans/board/src/App.tsx:1256), [plan:423](/Users/bk/github/research-plans/docs/plans/2026-07-17-v0.21-readability.md:423)

4. The 52rem cap is safe. PlanReader’s card currently fills a `flex-1` column, so the cap matters with a collapsed sidebar. It does not change section DOM, annotation containment, or outline generation. DiffView remains uncapped because it is the other render branch. Reports’ section cap is likewise isolated. [App.tsx:1256](/Users/bk/github/research-plans/board/src/App.tsx:1256), [PlanReader.tsx:482](/Users/bk/github/research-plans/board/src/views/PlanReader.tsx:482), [Reports.tsx:167](/Users/bk/github/research-plans/board/src/views/Reports.tsx:167)

5. Reduced motion is not addressed. The release does not introduce a new scrolling command, but it continues to use smooth `scrollIntoView` and has no reduced-motion branch or heading scroll margin for the sticky header. [PlanReader.tsx:221](/Users/bk/github/research-plans/board/src/views/PlanReader.tsx:221), [outline.ts:19](/Users/bk/github/research-plans/board/src/lib/outline.ts:19)

## 5. Open questions

1. Should the plan H1 remain above the metadata card? Recommendation: yes.

2. Should metadata remain annotatable? If not, the release should explicitly accept that existing metadata comments become unanchored.

3. Should PlanReader’s active TOC track only canonical H2 sections, or should nested H3 headings be added to its outline? Recommendation: track H2 only for this release.

4. Must Build steps preserve task checkboxes and reference-style links? Recommendation: yes, because both are valid GFM and R1 explicitly improves task lists.

5. What is the minimum supported browser for exported and collaborator boards? That decision determines whether `:has()` and IntersectionObserver may be assumed or need fallback behavior.