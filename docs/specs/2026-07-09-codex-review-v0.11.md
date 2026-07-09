Overall: feasible, but the spec needs a few implementation corrections before it is safe to build.

**1. Feasibility Issues**
1. Provenance diagram comments will not route if it replaces the current details block in place. The existing provenance block is outside the `AnnotationLayer`, while selectable results content is wrapped later. See [Results.tsx](/Users/bk/github/research-plans/board/src/views/Results.tsx:451) and [Results.tsx](/Users/bk/github/research-plans/board/src/views/Results.tsx:682). Move the provenance section inside the layer or wrap it separately.

2. Reusing `data-annot-scope="artifact:<id>"` on diagram nodes creates duplicate artifact scopes. Existing cards already use that stamp at [ArtifactCard.tsx](/Users/bk/github/research-plans/board/src/components/ArtifactCard.tsx:67), and `paintHighlights` paints the first matching scope where the quote resolves at [anchor.ts](/Users/bk/github/research-plans/board/src/lib/anchor.ts:129). It also breaks the proposed `querySelector` scroll-to-card path because the diagram node may be selected instead of the real card.

3. The header toggle will miss batch and terminal screens unless App is restructured. `BatchGate` returns before the normal App header at [App.tsx](/Users/bk/github/research-plans/board/src/App.tsx:115), and sent/approved/denied screens also return before the header at [App.tsx](/Users/bk/github/research-plans/board/src/App.tsx:519). The normal header exists only at [App.tsx](/Users/bk/github/research-plans/board/src/App.tsx:559).

4. `buildProvenanceGraph(manifest, scripts)` is under-specified for thumbnails. Asset URLs live on `ResultsBundle.assets` at [types.ts](/Users/bk/github/research-plans/board/src/lib/types.ts:65), and current rendering resolves them by basename in [artifactDisplay.ts](/Users/bk/github/research-plans/board/src/lib/artifactDisplay.ts:27). The builder needs `assets` or should reuse `artifactDisplay`.

5. Script snapshot resolution must match existing behavior. `producedBy.script` is not the full payload path; current cards find snapshots with suffix matching at [ArtifactCard.tsx](/Users/bk/github/research-plans/board/src/components/ArtifactCard.tsx:24), while `openScript` later requires exact `BoardFile.path` at [Results.tsx](/Users/bk/github/research-plans/board/src/views/Results.tsx:704). Centralize this resolver.

6. “Apply before first paint” is not guaranteed if implemented only in `main.tsx`. CSS is imported by the module at [main.tsx](/Users/bk/github/research-plans/board/src/main.tsx:5), and Vite/singlefile is configured at [vite.config.ts](/Users/bk/github/research-plans/board/vite.config.ts:7). Use a tiny inline head bootstrap in `board/index.html` in addition to React state.

**2. Missing Steps / Edge Cases**
- Tailwind v4 syntax is OK for this setup. I verified installed Tailwind 4.3.2 accepts `@custom-variant dark (&:where(.dark, .dark *));`.
- Soft unwrap should run before `marked.parse`; `Markdown` currently uses `breaks: true` at [Markdown.tsx](/Users/bk/github/research-plans/board/src/components/Markdown.tsx:16).
- Add explicit guards for `Label:` / `RQ1:` lines, indented code blocks, explicit two-space breaks, and GFM tables without a leading `|`.
- Old anchors mostly survive because anchors normalize whitespace at [anchor.ts](/Users/bk/github/research-plans/board/src/lib/anchor.ts:9), and saved comments persist by payload hash at [App.tsx](/Users/bk/github/research-plans/board/src/App.tsx:125). Edge case: comments spanning retained `<br>` breaks remain brittle because painting walks text nodes only.
- Absolute-positioned diagram text should work if inside `AnnotationLayer`, but the SVG layer must use `pointer-events: none`.
- Dark mode needs specific ScriptViewer selected/hover states; current selected lines are light-only at [ScriptViewer.tsx](/Users/bk/github/research-plans/board/src/components/ScriptViewer.tsx:70).

**3. Risks And Tradeoffs**
- Dark mode is a broad visual sweep, not a small isolated change.
- The diagram improves provenance readability but introduces duplicate-surface annotation ambiguity.
- The soft unwrap heuristic will improve hard-wrapped prose but can never perfectly infer author intent.
- Edge measurement can drift after annotations, font load, details toggles, or thumbnail load unless `ResizeObserver` is used.

**4. Suggested Improvements**
- Add a small theme bootstrap script before the Vite module, then keep React state in a reusable `ThemeToggle`.
- Move provenance into the same `AnnotationLayer` as the bundle body.
- Add `data-artifact-card-id` for scroll targets; do not rely on duplicate `data-annot-scope`.
- Pass the whole `ResultsBundle` to provenance graph building or reuse `artifactDisplay`.
- Extract `resolveScriptSnapshot(artifact, bundle.scripts)` and use it in both card and diagram.
- Add focused Vitest coverage for theme resolution, unwrap contracts, graph building, and path resolution.

**5. Open Questions**
- Should diagram comments be stored as artifact comments only, or should feedback distinguish `artifact-card` vs `artifact-diagram`?
- Should OS theme changes update live boards when no explicit override is stored?
- Should wrapped label values ever unwrap, or are all `Label:` lines hard line-oriented?