Verdict: do not implement the spec unchanged. It has three blockers: unsafe live handling of active files, unsafe Markdown links, and a missing `assets` contract for Markdown rendering.

## 1. Wrong claims about existing code

- **High:** `Markdown` is not an “escape-all” renderer. It escapes raw HTML tokens, but then inserts Marked’s generated HTML through `dangerouslySetInnerHTML`. It does not override or validate links. [spec:51](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:51), [Markdown.tsx:24](/Users/bk/github/research-plans/board/src/components/Markdown.tsx:24), [Markdown.tsx:64](/Users/bk/github/research-plans/board/src/components/Markdown.tsx:64), [Markdown.tsx:69](/Users/bk/github/research-plans/board/src/components/Markdown.tsx:69)

- **Medium:** The two causes are not “both required.” The existing `download` attributes are sufficient to request a download for the repository’s same origin and `data:` URLs. MIME handling is a second influence after the attribute is removed. [spec:7](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:7), [ArtifactCard.tsx:57](/Users/bk/github/research-plans/board/src/components/ArtifactCard.tsx:57), [ArtifactCard.tsx:102](/Users/bk/github/research-plans/board/src/components/ArtifactCard.tsx:102)

- **Medium, INFERENCE:** “Chrome downloads all three” is an unsupported browser claim. The repository proves only that Python calls the platform dependent `mimetypes.guess_type()`. There is no browser test showing Chrome’s behavior for `text/markdown`, `text/csv`, or `application/octet-stream`. [spec:10](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:10), [board.py:909](/Users/bk/github/research-plans/skills/managing-research-plans/scripts/board.py:909)

- **Low:** `Results.tsx` has two `ArtifactCard` call sites, not three. [spec:43](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:43), [Results.tsx:624](/Users/bk/github/research-plans/board/src/views/Results.tsx:624), [Results.tsx:669](/Users/bk/github/research-plans/board/src/views/Results.tsx:669)

## 2. Security holes

- **High, blocker:** Removing `download` from every nonviewable live artifact creates a same origin active-content path. Results discovery admits `.html` and `.svg`. An `other` artifact falls through to card mode, and the live server preserves `text/html` or `image/svg+xml`. Opening that file can execute artifact-controlled code under the board origin. `noopener` blocks access to the opener, but it does not block same origin requests. Such a document can fetch `/`, recover the injected `boardToken`, and call mutation routes. Force active and unknown formats to download. Only whitelist formats that are safe to open inline. [spec:22](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:22), [spec:47](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:47), [results.py:33](/Users/bk/github/research-plans/skills/managing-research-plans/scripts/results.py:33), [artifactDisplay.ts:78](/Users/bk/github/research-plans/board/src/lib/artifactDisplay.ts:78), [board.py:910](/Users/bk/github/research-plans/skills/managing-research-plans/scripts/board.py:910), [board.py:849](/Users/bk/github/research-plans/skills/managing-research-plans/scripts/board.py:849), [board.py:959](/Users/bk/github/research-plans/skills/managing-research-plans/scripts/board.py:959)

- **High, blocker:** Artifact Markdown can create executable `javascript:` links. The current renderer customizes HTML and images but leaves links to Marked. A local runtime check produced `<a href="javascript:alert(1)">`. Add a link renderer with an explicit protocol policy. At minimum, reject `javascript:`, `data:`, and `file:`. [Markdown.tsx:28](/Users/bk/github/research-plans/board/src/components/Markdown.tsx:28), [Markdown.tsx:38](/Users/bk/github/research-plans/board/src/components/Markdown.tsx:38), [runtime evidence](/Users/bk/github/research-plans/logs/2026-07-12_22-26-35_markdown-link-scheme-check.log:1)

- **Medium:** The 2 MB limit does not bound work as designed. `fetch().text()` and `atob()` process the whole input before the viewer can inspect the decoded string. The CSV row cap also does not cap columns or total cells, so one row with hundreds of thousands of delimiters could create a huge DOM. Check encoded or response bytes before decoding, and cap rows, columns, and total cells. [spec:27](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:27), [spec:33](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:33), [spec:34](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:34)

- The proposed CSV cells and `<pre>` text nodes are otherwise sound. `SafeTable`’s existing raw HTML path remains separate and sanitizes its limited table markup. [SafeTable.tsx:10](/Users/bk/github/research-plans/board/src/components/SafeTable.tsx:10), [SafeTable.tsx:55](/Users/bk/github/research-plans/board/src/components/SafeTable.tsx:55)

## 3. Browser behavior errors

- **High, INFERENCE:** `nosniff` does not neutralize content that already has an active, correct MIME type. An HTML artifact served as `text/html` remains HTML. This is why the live fallback above must use attachment behavior for active types. [spec:54](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:54), [board.py:910](/Users/bk/github/research-plans/skills/managing-research-plans/scripts/board.py:910)

- **Medium, INFERENCE:** `Content-Disposition: inline` is a preference, not a command to render. `fetch()` ignores it entirely. The proposed `text/plain; charset=utf-8` plus `nosniff` should give the desired raw navigation behavior, but the design should not attribute that result to `inline` alone. [spec:47](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:47)

- **Medium, INFERENCE:** `fetch()` resolves normally for HTTP error responses. `loadAssetText` must check `res.ok`; otherwise a 404 or login/error body can become viewer content. It also needs an `AbortController` or request identity guard so an older request cannot overwrite a newer viewer state. [spec:33](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:33), [spec:41](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:41)

- **Medium:** Copying the zoom overlay literally will close the viewer whenever the user clicks inside it. The existing zoom scrim handles every click and has no inner surface that stops propagation. The viewer needs an inner panel with `stopPropagation()` because its body and footer are interactive. [spec:16](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:16), [spec:25](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:25), [Results.tsx:745](/Users/bk/github/research-plans/board/src/views/Results.tsx:745)

- **Low, INFERENCE:** The `atob` to `Uint8Array` to `TextDecoder` sequence correctly handles UTF-8. The missing decisions concern invalid UTF-8, byte-based size checks, and malformed or parameterized data URLs. Checking JavaScript string length is not a 2 MB byte limit. [spec:27](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:27), [spec:33](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:33)

## 4. Missed integration seams

- **High, blocker:** The proposed `ViewerModal` and `onView` contracts omit `assets`, yet the UX requires Markdown images to resolve through `bundle.assets`. The existing Reports view passes that map explicitly. Add `assets: Record<string,string>` to the modal contract or pass the current bundle map separately from `Results`. [spec:19](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:19), [spec:41](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:41), [spec:42](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:42), [Reports.tsx:146](/Users/bk/github/research-plans/board/src/views/Reports.tsx:146), [Markdown.tsx:58](/Users/bk/github/research-plans/board/src/components/Markdown.tsx:58)

- **Medium:** Artifact bytes are omitted from both duplicated file-hash contracts. Python’s `payload_files()` and TypeScript’s `allFiles()` cover manifests and scripts, but not `assets`. Python also computes `shareHash` before `build_assets()`. Hosted result staleness differs because `targetHash()` serializes the bundle including `assets`. Decide whether changing a viewed text artifact should stale review state. If yes, update both contracts and their pinned cross-language tests. [board.py:198](/Users/bk/github/research-plans/skills/managing-research-plans/scripts/board.py:198), [board.py:586](/Users/bk/github/research-plans/skills/managing-research-plans/scripts/board.py:586), [board.py:1447](/Users/bk/github/research-plans/skills/managing-research-plans/scripts/board.py:1447), [parse.ts:379](/Users/bk/github/research-plans/board/src/lib/parse.ts:379), [App.tsx:150](/Users/bk/github/research-plans/board/src/App.tsx:150), [hostedComments.ts:35](/Users/bk/github/research-plans/board/src/lib/hostedComments.ts:35)

- **Medium:** There are four board modes. Only `live` uses `/artifact/`; `static`, `remote`, and `hosted` all use embedded data URLs. Hosted Vercel has no artifact API and serves the generated `index.html`. The spec’s “live/shared” wording and export-only smoke test do not cover those contracts clearly. [types.ts:6](/Users/bk/github/research-plans/board/src/lib/types.ts:6), [board.py:331](/Users/bk/github/research-plans/skills/managing-research-plans/scripts/board.py:331), [board.py:1183](/Users/bk/github/research-plans/skills/managing-research-plans/scripts/board.py:1183), [board.py:1192](/Users/bk/github/research-plans/skills/managing-research-plans/scripts/board.py:1192)

- **Low:** `.log` is viewable in the spec but absent from artifact discovery. Explicit copying can still capture it, but normal discovery will not offer it. Add `.log` to `SCAN_EXTS` or document that limitation. [spec:21](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:21), [results.py:33](/Users/bk/github/research-plans/skills/managing-research-plans/scripts/results.py:33)

- The single-file build itself is compatible with this feature. Vite already inlines scripts and CSS, and the exported template has inline scripts rather than a restrictive CSP. A real `file://` smoke test is still needed. [vite.config.ts:8](/Users/bk/github/research-plans/board/vite.config.ts:8), [board-template.html:9](/Users/bk/github/research-plans/skills/managing-research-plans/assets/board-template.html:9)

## 5. Missing steps and tests

Add these before implementation approval:

- Markdown link protocol tests, plus live `.html` and `.svg` fallback tests.
- A Markdown viewer test with an embedded bundle image. This catches the missing `assets` prop.
- `fetch` 404, abort, close-before-resolution, and A-to-B request race tests.
- Predecode size boundaries, invalid UTF-8, empty base64, malformed base64, and MIME parameters.
- CSV tests for BOM, trailing newline, blank rows, unterminated quotes, exact 500 and 501 rows, maximum columns, and maximum total cells.
- Modal tests for panel click versus scrim click, Escape, `aria-modal`, initial focus, focus trapping, focus restoration, and body scroll locking.
- Browser smoke tests for live HTTP, exported `file://`, remote share, and hosted output. The current proposed smoke only inspects exported HTML. [spec:56](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:56), [spec:64](/Users/bk/github/research-plans/docs/specs/2026-07-12-artifact-viewer-design.md:64)

## 6. Open questions

1. Which live nonviewer formats may open inline? I recommend a small safe whitelist and attachment for HTML, SVG, XML, and unknown types.
2. Which Markdown link schemes are allowed? Should relative artifact links resolve through `bundle.assets`, like images do?
3. Should artifact byte changes affect `shareHash`, local draft storage, and hosted comment staleness?
4. Is 2 MB a byte limit or a decoded JavaScript string limit? What are the maximum columns and cells for CSV?
5. Should viewer content remain deliberately unannotatable? It is outside `AnnotationLayer`, while the card title and caption remain annotatable. [Results.tsx:694](/Users/bk/github/research-plans/board/src/views/Results.tsx:694), [Results.tsx:745](/Users/bk/github/research-plans/board/src/views/Results.tsx:745)

Current baseline tests passed: [15 board tests](/Users/bk/github/research-plans/logs/2026-07-12_22-26-35_artifact-viewer-current-board-tests.log:1) and [10 Python tests](/Users/bk/github/research-plans/logs/2026-07-12_22-26-35_artifact-viewer-current-python-tests.log:1). No implementation tests exist yet. Browser-specific points remain labeled `INFERENCE` because no test browser was available.