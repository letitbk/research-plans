# In-board artifact viewer (md/csv/text) — design

Status: revised after codex review · 2026-07-12 · target: post-v0.15.0 branch (BK numbers the release at cut)

## Problem

Clicking a text artifact on the board ("open results.md", "open table.csv", the `.tex` / `data:` links) downloads the file instead of showing it. Causes, in order:

1. `board/src/components/ArtifactCard.tsx` puts the HTML `download` attribute on every artifact anchor (the `open {basename}` link and both `linksRow` links). The attribute alone forces a download for same-origin and `data:` URLs — this is sufficient to explain today's behavior.
2. Once the attribute is removed, the live server's `/artifact/` route (`board.py` `do_GET`) becomes the second layer: it serves `mimetypes.guess_type()` results — `.md` → `text/markdown`, `.csv` → `text/csv`, unknown → `application/octet-stream` — types browsers treat as downloads rather than render (browser-behavior inference; confirmed in the implementation's Chrome smoke test rather than assumed).

BK's decision (2026-07-12): build the **in-board viewer** (not the browser-tab raw-text fix); the Reports tab's PDF/DOCX buttons stay downloads; ships on its own branch/PR after v0.15.0.

## UX

One new gesture: clicking a **viewable** artifact link opens a viewer modal inside the board (overlay like the image zoom modal in `Results.tsx`, but with an inner panel — see modal behavior), instead of navigating or downloading.

- Viewable extensions and their renderings:
  - `.md` → the existing `Markdown` component, with the bundle's `assets` map passed through (same renderer and image-resolution contract as the Reports tab).
  - `.csv`, `.tsv` → parsed and rendered as a scrollable table (sticky header row; caps below).
  - `.txt`, `.log`, `.json`, `.tex` → monospace `<pre>`, preserving whitespace. (`.log` is not in `results.py` `SCAN_EXTS`, so discovery never offers it; it stays viewable for explicitly copied artifacts — documented limitation, discovery unchanged.)
- Non-viewable files keep an anchor, policy per URL kind (derived from `url.startsWith("data:")`, no prop threading):
  - Live (`/artifact/...`) URLs: the `download` attribute is dropped **only** for types the server serves inline (the text whitelist, raster images, `.svg`, `.pdf` — see server policy); those get `target="_blank" rel="noopener"`. Active or unknown types (`.html`, `.xml`, `.xlsx`, anything else) **keep** the `download` attribute — never an inline navigation path for active content.
  - `data:` URLs (static/remote/hosted boards): keep the `download` attribute — Chrome refuses top-level navigation to `data:` URLs, so download is the only working affordance.
- Modal chrome: artifact title + basename chip in the header, ✕ button; body scrolls (`overflow-auto`); footer offers the escape hatch — live: "open raw ↗" (new tab); `data:`: "download". Modal behavior: scrim click closes, but the inner panel stops propagation (body and footer are interactive, unlike the zoom image); Escape closes; `role="dialog"` + `aria-modal="true"`; initial focus moves to the ✕ button and returns to the invoking button on close; body scroll locked while open.
- The modal is **not** part of the AnnotationLayer (deliberate, same as the image zoom modal; commenting on artifacts stays on the card's `data-annot-scope`).
- Oversized fallback: if the size guard trips (see data path), the viewer body shows a "too large to display here" notice plus the raw/download link instead of rendering.

## Data path

New pure lib `board/src/lib/assetText.ts`:

- `loadAssetText(url: string, signal?: AbortSignal): Promise<string>`:
  - `data:` URLs: parse `data:<mime>[;params];base64,<payload>` (malformed → typed error). **Pre-decode byte guard**: reject when `payload.length * 3/4 > 2 MB` before calling `atob`. Decode `atob` → `Uint8Array` → `TextDecoder("utf-8")` (non-fatal mode; invalid UTF-8 yields replacement characters, never throws).
  - Other URLs: `fetch(url, { signal })`; **`res.ok` is checked** (non-2xx → typed error, never rendered as content); `Content-Length` checked against the 2 MB cap when present, with a post-`text()` byte-length backstop. The limit is a **byte** limit, not a JS string length.
  - `ViewerModal` passes an `AbortController` signal and ignores stale resolutions (request-identity guard), so closing or switching artifacts can't paint an older response.
  - Shared boards already embed every artifact file as a base64 `data:` URL (`build_assets` iterates the whole `artifacts/` dir for every non-live mode), so no payload schema change is needed. Mode coverage: `live` fetches `/artifact/`; `static`, `remote`, and `hosted` all decode `data:` URLs — one code path each, all four modes covered.
- `parseCsv(text: string, delim: "," | "\t"): string[][]` — hand-rolled RFC 4180: quoted fields, `""` escapes, embedded delimiters/newlines, CRLF and LF, leading BOM stripped, trailing newline not a row, unterminated quote tolerated (rest of input becomes the field). No new dependencies.
- CSV render caps (all with truncation notices): 500 rows, 200 columns, 50,000 total cells — a single pathological row cannot build an unbounded DOM.

## Component changes

- `board/src/lib/artifactDisplay.ts` (pure, unit-tested — all branch logic stays here):
  - New exported decision: `viewKind(file) : "md" | "csv" | "tsv" | "text" | null` from the extension table above, and `inlineSafe(file): boolean` mirroring the server's inline whitelist for the anchor `download`-attribute policy.
  - `ArtifactLink` gains optional `view: ViewKind`; the `card` mode result gains `view: ViewKind | null` for the main file. Existing modes (`table-image`, `table-inline`, `figure`, `oversized`, `missing`) unchanged.
- `board/src/components/ViewerModal.tsx` (new): props `{ url, kind, title, basename, assets, onClose }` — **`assets` is part of the contract** so `.md` images resolve exactly as on the Reports tab; loads text via `loadAssetText` (loading / error / oversized states), renders per kind, footer per URL kind.
- `board/src/components/ArtifactCard.tsx`: new optional prop `onView(v: { url, kind, title, basename })` mirroring `onZoom`. Where a link's `view` kind is non-null and `onView` is provided, render a button ("view results.md") instead of the anchor; otherwise the per-URL-kind anchor policy above.
- `board/src/views/Results.tsx`: `viewer` state beside `zoom`, Escape handling extended, `<ViewerModal>` rendered beside the zoom modal with the current bundle's `assets`, `onView` passed at both `ArtifactCard` call sites. (Results is the only consumer of `ArtifactCard`.)

## Markdown link hardening (pre-existing hole, fixed here)

`Markdown.tsx` overrides raw HTML and images but leaves **links** to marked's default renderer, so artifact/report markdown can emit `<a href="javascript:...">` into `dangerouslySetInnerHTML` — exploitable today via the Reports tab, not just the new viewer. `makeMarked` gains a `link` renderer with a scheme allowlist: `http:`, `https:`, `mailto:`, and in-page `#fragment` links render as anchors (absolute links get `rel="noopener noreferrer"`); `javascript:`, `data:`, `file:`, other schemes, and relative paths (which cannot resolve on the board) render as escaped text — the same "the board never follows a URL the payload didn't provide" contract images already obey.

## Server change (board.py, `/artifact/` route only)

Response policy by suffix (replaces bare `guess_type`):

- Text whitelist `{".md", ".csv", ".tsv", ".txt", ".log", ".json", ".tex"}` → `text/plain; charset=utf-8`, `Content-Disposition: inline`.
- Raster images `{".png", ".jpg", ".jpeg", ".gif", ".webp"}` → real mime, inline.
- `.svg` → `image/svg+xml` (required: figure mode renders `<img src="/artifact/….svg">`, and nosniff blocks type-mismatched images).
- `.pdf` → `application/pdf`, inline.
- Everything else — including `.html`, `.xml`, unknown — → `application/octet-stream` + `Content-Disposition: attachment` (active content never navigable under the board origin).
- All `/artifact/` responses additionally send `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox` — direct navigation to any artifact (including `.svg`, whose documents can script) lands in an opaque-origin, script-disabled document, while `<img>` rendering is unaffected (browser-behavior inference; verified in the Chrome smoke test).

Rationale: the live board HTML embeds the per-boot `boardToken` (`board.py` `serve()`), and mutating routes accept it. A same-origin navigable `.html`/`.svg` artifact could fetch `/` and replay that token; the attachment + sandbox policy closes the path. `/report/` routes (deliberate `Content-Disposition: attachment` PDF/DOCX) untouched. `build_assets`' `data:` URLs keep their real mime (the viewer decodes regardless of mime).

## Security notes

- Markdown renders through the existing `Markdown` component with escaped raw HTML, payload-only images, and (new, above) allowlisted link schemes. No new raw-HTML path.
- CSV/tsv cells and `<pre>` content render as React text nodes — no `dangerouslySetInnerHTML` anywhere in this feature.
- `loadAssetText` only ever receives URLs from the payload's `assets` map (payload-controlled, same trust domain as every existing `img src`), never free-form input; errors and non-2xx responses are typed states, never rendered as document content.
- Hash/staleness contracts are **deliberately unchanged**: artifact bytes stay outside `payload_files()`/`allFiles()` and `shareHash` (computed before `build_assets`), and hosted `targetHash` already serializes `assets` — viewing alters none of this.

## Tests

- `parseCsv`: quotes, escaped quotes, embedded commas/newlines, CRLF, BOM, trailing newline, blank rows, unterminated quote, ragged rows, empty input, exactly-500 and 501 rows, column and total-cell caps.
- `loadAssetText`: base64 UTF-8 decode (incl. non-ASCII), invalid UTF-8 (replacement, no throw), empty/malformed base64, mime parameters in the data URL, pre-decode size rejection at the byte boundary; fetch path (mocked): ok, 404 → error state, abort, stale-response race (A resolves after B opened).
- `artifactDisplay`: `viewKind` extension table; `inlineSafe`; `links()` view tagging; card-mode `view` for md/csv/pdf/html.
- `Markdown`: link scheme allowlist — `https:` anchor with `noopener noreferrer`, `javascript:`/`data:`/relative render as text; existing image/HTML policies unregressed.
- `ArtifactCard` (jsdom): view button for md/csv when `onView` present; live `.pdf` → anchor without `download` + `target="_blank"`; live `.html`/`.xlsx` → anchor **with** `download`; `data:` URLs always `download`.
- `ViewerModal` (jsdom): md renders through Markdown incl. an image resolved from `assets` (guards the assets contract); csv table + caps notices; text in `<pre>`; oversized/error/loading states; panel click does not close, scrim click and ✕ do; focus moves in and restores.
- `tests/test_board.py` (live-server harness): `/artifact/` `.md`/`.csv` → `text/plain; charset=utf-8` + inline; `.png` → `image/png`; `.svg` → `image/svg+xml`; `.html` → octet-stream + attachment; nosniff + CSP sandbox on all; `/report/` headers unchanged.
- Template rebuild + `--export` smoke on a synthetic project (make_project helpers), plus a real-browser smoke: live board over HTTP (view md/csv, open-raw renders as text, html artifact downloads, svg figure still renders) and the exported single file over `file://` (viewer works from `data:` URLs).

## Out of scope

- Links inside report markdown bodies resolving to artifacts (they now render as safe text when relative; making them open the viewer is a follow-up).
- Annotating viewer content (commenting stays on the card scope).
- Rendering `.xlsx`/binary formats; `.log` in discovery (`SCAN_EXTS`).
- Any change to hash/staleness contracts (see security notes).

## Revision history

- 2026-07-12 — draft (this session), after BK chose the in-board viewer over browser-tab raw text.
- 2026-07-12 — revised per codex sol/xhigh review (docs/specs/2026-07-12-codex-review-artifact-viewer.md); all three blockers verified in code and addressed: (1) live non-viewable anchors keep `download` for active/unknown types and the server forces attachment + nosniff + CSP sandbox on `/artifact/`; (2) Markdown link-scheme allowlist (pre-existing `javascript:` hole, also reachable from the Reports tab); (3) `assets` added to the ViewerModal/onView contract. Also folded in: byte-based pre-decode caps, CSV row/column/cell caps, `res.ok` + abort/race guards, modal panel/focus semantics, corrected cause ordering and call-site count, browser-behavior claims demoted to smoke-tested inferences.
