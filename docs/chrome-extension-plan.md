# Chrome extension: slice GitHub and Confluence pages in the browser

## Status

All seven phases are implemented on the `chrome-extension` branch, one or two commits each. Unit tests, the smoke test, the GitHub e2e against public pages and the Confluence e2e against a local mock pass. Nothing has run against envato.atlassian.net, a private GitHub repo or a signed-in GitHub session. Amanda still needs to check these by hand:

- **Confluence on envato.atlassian.net:** the "First manual test on envato.atlassian.net" checklist in the phase 6 notes, which covers open questions 1 and 2 (cookie auth from page scripts, DOM selectors), whether `body.export_view` comes back from v2, whether attachment downloads redirect to another host, the title suffix, and the macro markup.
- **GitHub signed in:** open question 3 (the React PR view), open question 4 (private repo `/raw/` images), uploaded images on private repos, and the `picture` dark-mode sources (phase 5 "Unverified").
- **The `*.githubusercontent.com` host permission** from phase 5 needs her OK, since Chrome shows it as an install warning.
- **Mermaid:** decided (open question 5). The reader draws each diagram with the `mermaid` package and keeps the source behind a "Diagram source" disclosure, plus the link to the original page.
- **A real toolbar click** (phase 7): every browser test drives the click from the service worker with an extra host permission, so the `activeTab` path, the reader tab reload on a second click, and the toolbar icon at 16 px on light and dark toolbars are unchecked.

**Bug fixed after the first private repo test:** a private GitHub README skipped all 9 images as `fetch-failed`. The page fetch sent `credentials: "include"` to github.com `/raw/` URLs, which redirect to raw.githubusercontent.com, and that host answers `Access-Control-Allow-Origin: *`, which the browser rejects on a credentialed request. Page image fetches now always use `credentials: "same-origin"`, which still sends the github.com cookie on the first hop, and the "Images skipped" tooltip now shows the first fetch error (`stats.firstError`).

**Bugs fixed after a private README with a 30-row glossary:** the table rendered as one paragraph. A table over the 400-word segment budget was descended into, so its rows were emitted without the table, and the HTML parser drops `tr` and `td` outside a table when the reader sets the segment HTML. `shared/segmentation.js` now splits tables, lists, blockquotes and details by whole children inside a copy of the element (tables repeat their header, ordered lists continue with `start`), and never splits a `pre`, `figure` or table row. The same page showed a stray "Copy code to clipboard" line under each code block; the signed-out fixtures carry that label only in an `aria-label`, so `cleanBody` now also drops tooltips (`tool-tip`, `[role="tooltip"]`) and any button, screen reader text or bare copy label next to a `pre` [Unverified: which of these GitHub sends to a signed-in private repo]. The reader adds its own GitHub style copy button to every code block (`client/src/hooks/useCodeCopyButtons.js`), checked by `npm run e2e:tables-copy`.

## Why

The server fetches URLs with axios and no cookies, so pages behind GitHub SSO or Atlassian login return a sign-in page. A Chrome extension runs inside the logged-in tab, reads the rendered page, slices it locally and keeps the text in the browser. Company content never reaches the server.

## Decisions (agreed with Amanda, 2026-11-23)

| Question | Decision |
|---|---|
| Where content is sliced and stored | Fully in the browser. `chrome.storage.local`, no server round trip, no share links. |
| Where the reader opens | New tab inside the extension, reusing the React client. |
| Confluence flavour | Confluence Cloud only (`https://envato.atlassian.net/wiki/spaces/<SPACE>/pages/<id>/<slug>`). |
| GitHub scope | Rendered Markdown files, README on repo or folder pages, wiki pages, issue and PR descriptions (first body only, comment threads excluded). github.com only. |
| Progress | This browser profile only, `chrome.storage.local`, keyed by normalised URL. |
| Public pages | Not handled by the extension. The web app stays the home for public articles and YouTube. |
| Install | Load unpacked from `extension/dist`. |
| Linked pages | Single page per training. Links inside segments open the real page. |

## Architecture

Three pieces in a new top-level `extension/` folder, Manifest V3.

**Capture script.** Injected on demand when the toolbar button is clicked, using the `activeTab` and `scripting` permissions. No persistent content scripts and no broad `host_permissions`. It reads title plus body HTML and posts it back to the service worker. It also inlines images as data URLs (see below) because it runs in the page origin where cookies apply.

**Service worker.** Receives the capture, normalises the URL into a storage key, runs the shared slicer, saves to `chrome.storage.local`, opens the reader tab. If a training for that key already exists it reopens it with its progress and the reader offers "Re-slice".

**Reader page.** The existing React client bundled as an extension page (`reader.html`). `client/src/App.jsx` gets a `trainingSource` adapter with two implementations: the current `/api` one for the web app and a `chrome.storage.local` one for the extension. In extension mode the URL form, examples and share-link button are hidden, and the source link opens the real page in a new tab.

**Shared slicing core.** `server/src/utils/segmentation.js` and `server/src/utils/sanitize.js` move to a top-level `shared/` module imported by both server and extension. Segmentation hardcodes JSDOM today, so it takes a document-parser function instead: JSDOM in Node, `DOMParser` in the browser. DOMPurify (via `isomorphic-dompurify`, or plain `dompurify` in the browser) already runs in both. `vercel.json` `includeFiles` must gain `shared/**`.

### GitHub capture

Selectors to confirm in phase 1 against real pages:

- Rendered `.md` blob pages and the README on repo or folder pages: `article.markdown-body`.
- Wiki pages: the markdown body inside the wiki container.
- Issues and PRs: the first markdown body only, which is the description.
- Title from the page heading or file path, cleaned of the " · GitHub" suffix.

GitHub navigates as a single-page app. Capturing on click, not on page load, avoids tracking navigation events.

### Confluence Cloud capture

Preferred route: the Confluence REST API called from the page context, where session cookies apply. Page id comes from the URL path. Request the body in `export_view` format, which is flattened HTML with most macros rendered. Fallback: read the rendered body from the DOM.

### Private images and attachments

GitHub private-repo images use short-lived signed URLs and Confluence attachments need session cookies. Both break once the HTML is rendered from the `chrome-extension://` origin. The capture script fetches each image from the page context and inlines it as a data URL.

| Limit | Value |
|---|---|
| Per image | 2 MB, else keep the original URL |
| Per training | 20 MB, else stop inlining |
| Storage | `unlimitedStorage` permission requested |

### Storage model

Key: `training:<normalisedUrl>`. Normalisation strips the hash, drops the Confluence title slug so the page id is canonical, and removes GitHub `?plain=1`. Value: `{ payload, progress, capturedAt }` where `payload` has the same shape the server returns today (`type`, `title`, `sourceUrl`, `segmentMinutes`, `totalSegments`, `totalWords`, `segments[]`).

### Build

Plain Vite with two configs, no CRXJS dependency. One app build for the reader page importing from `client/src`, one library build in IIFE mode for the capture script and the service worker. Output lands in `extension/dist`, which is what gets loaded unpacked. `extension/` has its own `package.json`.

## Delivery phases

Each phase is one commit on the `chrome-extension` branch, done by one worker, reviewed before the next starts.

1. **Spike.** Verify the GitHub selectors on the four page kinds using Playwright against public pages. Check the Confluence v2 API docs for `export_view`. Save sanitised HTML fixtures under `extension/fixtures/` from public GitHub pages. Write findings into this doc under "Phase 1 findings". Live Confluence and managed-Chrome checks need Amanda's browser and are deferred to the first manual test.
2. **Shared core.** Move segmentation and sanitiser to `shared/`, make the parser injectable, keep the server green (existing article tests plus a manual run of sample URLs).
3. **Reader refactor.** Introduce the adapter, extension-mode flags, "Open original" action. Web app behaviour unchanged, `npm run lint` and `npm run build` pass in `client/`.
4. **Extension scaffold.** Manifest, service worker, storage, reader page build, toolbar click opens an empty reader. README section on loading unpacked.
5. **GitHub capture.** All four page kinds with fixture tests for the extractor.
6. **Confluence capture.** API route, DOM fallback, attachment inlining, fixture tests.
7. **Polish.** Reopen-or-re-slice, unsupported-page message, icons, a small library list of stored trainings with delete, README update.

## Risks

- **Selectors drift.** GitHub and Confluence redesign often. Keep a list of candidate selectors per page kind plus fixture tests that fail loudly.
- **Mermaid and SVG.** Resolved: GitHub renders Mermaid in a cross-origin iframe, not inline SVG (see Rendering notes), so the capture keeps the source and the reader draws it with the `mermaid` package. The sanitiser still strips `svg`; the drawn SVG is never stored.
- **Code highlighting.** Handled for GitHub in phase 7: the reader keeps GitHub's Prettylights spans and colours them in both themes (`extension/src/githubSyntax.css`). Confluence code macros still show monochrome.
- **Confluence macros.** Jira macros, expand blocks and status lozenges may render as iframes or empty shells even in export view.
- **Storage growth.** Data URLs make trainings large. The library list in phase 7 adds delete, and the caps above bound each training.

## Phase 1 findings

Verified on 2026-11-23 with headless Chromium (Playwright), signed out, after `networkidle`, against public pages. Everything under "GitHub" was checked on live pages. The Confluence section comes from Atlassian's published OpenAPI specs; nothing was called on a real Confluence site.

### GitHub selectors

| Page kind | Test URL | Body selector (in order) | Matches | Title strategy |
|---|---|---|---|---|
| Markdown blob | `mozilla/readability/blob/main/README.md` | `article.markdown-body` | 1 (6,638 chars) | File name from `#file-name-id-wide`, or the first `h1` inside the body when it exists. `document.title` is `<path> at <ref> · <owner>/<repo> · GitHub`. |
| README on repo root | `vitejs/vite`, `mozilla/readability` | `article.markdown-body` | 1 | First `h1` inside the body (`Vite ⚡`, `Readability.js`), else `<owner>/<repo>`. The page `h1` elements are the repo name and are not useful. |
| README on folder page | `vitejs/vite/tree/main/packages/vite` | `#readme article.markdown-body`, then `article.markdown-body` | 1 (771 chars) | First `h1` in the body, else the folder name from `#file-name-id-wide`. |
| Wiki page | `mrdoob/three.js/wiki/Migration-Guide`, `.../wiki` | `#wiki-body .markdown-body`, then `#wiki-body` | 1 inside `#wiki-body` | `h1.gh-header-title` (`Migration Guide`, `Home`). `document.title` is `<Page> · <owner>/<repo> Wiki · GitHub`. |
| Issue description | `vitejs/vite/issues/21954` | `[data-testid="issue-body"] [data-testid="markdown-body"]`, then `#issue-body-viewer .markdown-body` | first match is the description (1,168 chars) | `[data-testid="issue-title"]`. The page `h1` also contains `#21954`. |
| PR description | `vitejs/vite/pull/22981` | `[id^="pullrequest-"] .js-comment-body`, then the first `.js-discussion .js-comment-body` | 1 (959 chars) | Text of the first `span` in the page `h1`, or clone `h1` and remove `.sr-only` (which holds ` - #22981`). `document.title` is `<title> by <author> · Pull Request #N · <owner>/<repo>`. |

A plain `.markdown-body` query is not safe on its own:

- **Wiki:** two matches. The second is the custom sidebar (`div.wiki-custom-sidebar.markdown-body`). Scope to `#wiki-body`.
- **Issues:** each comment has two nested `.markdown-body` nodes. The outer one is `div[data-testid="markdown-body"].markdown-body`, which wraps `div.markdown-body.safe-html-box__<hash>`. Description and comments use the same markup, so the extractor must scope to `[data-testid="issue-body"]` and take the outer node once. The `safe-html-box__<hash>` class suffix is a build hash, so never select on it.
- **PRs:** the PR conversation page is still the classic server-rendered timeline when signed out. The description is the `.js-comment-body` inside `div#pullrequest-<id>.timeline-comment-group`. Review comments appear as `td.comment-body.js-comment-body` further down, and normal comments use the same `div.js-comment-body` class, so scope to `[id^="pullrequest-"]`.

Title fallback for every kind: `meta[property="og:title"]`, then `document.title` with the trailing ` · GitHub` removed.

### Rendering notes

- **Blob, repo and folder pages are the React `code-view` app.** Short files ship the rendered article in the server HTML and also in the embedded JSON (`script[data-target="react-app.embeddedData"]`, a `richText` field). The long `vite/packages/vite/CHANGELOG.md` (320 KB of Markdown) has no `markdown-body` in the server HTML at all: the client renders it after load. After `networkidle` the full article was present (91 of 91 headings), so there was no virtualised or lazy rendering of the body. Since capture runs on click in a loaded tab, reading the live DOM is enough. The embedded JSON is a possible fallback but was not needed.
- **Issue pages are the React `repo` app.** Rendered fully after load.
- **Wiki pages are server-rendered.** The three.js wiki home is written in Textile (`#wiki-body.gollum-textile-content`) but still contains a `.markdown-body` child, so the same selector works.
- **No `<template>` hiding content.** The only `template` elements on these pages are GitHub UI templates (flash messages, clipboard buttons).
- **GitHub UI inside the body:** every heading is wrapped in `div.markdown-heading` with an `a.anchor` holding an `svg.octicon-link` (137 of them on the wiki page). Code blocks sit in `div.highlight` with `pl-*` classed spans and a `clipboard-copy` button in a `.zeroclipboard-container`. Issue task lists carry `task-list-item` classes. The phase 5 extractor should drop `a.anchor`, `clipboard-copy` and `.zeroclipboard-container` before slicing. These SVG octicons are why the raw SVG count is high; none of them are content.
- **Mermaid is not inline SVG,** as the risk line above assumed. GitHub renders each diagram in a cross-origin `iframe.render-viewer` from `viewscreen.githubusercontent.com`, inside `section.js-render-needs-enrichment[data-type="mermaid"]`. The capture script cannot read inside that iframe. The source survives in the same section as `pre[lang="mermaid"]` and in a `data-json` attribute on the render container. The capture keeps the source as a code block and the reader draws it (see the Diagrams note below). See `fixtures/github/blob-mermaid.html` (10 diagrams).

### Image URLs in rendered Markdown

| Source in Markdown | `src` in the rendered DOM | Notes |
|---|---|---|
| External `https://` image (badges, logos) | `https://camo.githubusercontent.com/<hmac>/<hex-encoded-url>` | Original URL kept in `data-canonical-src`. Camo is public, no cookies. |
| Uploaded attachment (`https://github.com/user-attachments/assets/<uuid>`) | `https://private-user-images.githubusercontent.com/<userId>/<id>-<uuid>.png?jwt=...` | Happens on public repos too. The JWT and the inner S3 signature both expire after 300 seconds. The wrapping `<a href>` is the same signed URL. The inliner must fetch these during capture, not later. |
| Repo-relative path (`media/logo.svg`) | `/<owner>/<repo>/raw/<ref>/<path>` | Relative to github.com, redirects to `raw.githubusercontent.com`. [Inference] On private repos the redirect target carries a `?token=` and needs the session. Resolve against `location.origin` before fetching. |
| Absolute `raw.githubusercontent.com` URL | unchanged | Public for public repos. |
| Actions badge | `https://github.com/<owner>/<repo>/actions/workflows/<file>/badge.svg` | Same-origin to github.com. |

No `loading="lazy"` or `data-src` attributes were present on Markdown images, so `src` is the URL to fetch. Remote images are not proxied through Camo when the URL is already on a GitHub host.

### Fixtures

Saved under `extension/fixtures/github/`, documented in `extension/fixtures/README.md`:

| File | Size | Text chars | Images |
|---|---|---|---|
| `blob-readme.html` | 32 KB | 6,638 | 0 |
| `repo-readme.html` | 11 KB | 925 | 9 (camo, github.com badge) |
| `folder-readme.html` | 2.6 KB | 771 | 0 |
| `wiki.html` | 238 KB | 79,314 | 0 |
| `wiki-textile.html` | 1.9 KB | 399 | 0 |
| `issue.html` | 14 KB | 1,168 | 2 (private-user-images, expired) |
| `pr.html` | 1.8 KB | 959 | 0 |
| `blob-relative-img.html` | 120 KB | 35,657 | 3 (relative `/raw/`, camo, raw.githubusercontent.com) |
| `blob-mermaid.html` | 137 KB | 8,893 | 19, plus 10 Mermaid iframes |

### Confluence Cloud API

Checked against the published specs `https://dac-static.atlassian.com/cloud/confluence/openapi-v2.v3.json` and `https://dac-static.atlassian.com/cloud/confluence/swagger.v3.json` (v1), downloaded 2026-11-23.

**v2, preferred.** `GET /wiki/api/v2/pages/{id}?body-format=export_view`

- `body-format` accepts `storage`, `atlas_doc_format`, `view`, `export_view`, `anonymous_export_view`, `styled_view`, `editor`. Both `export_view` and `view` are listed.
- The parameter description says the representation "will be available under a response field of the same name under the `body` field". So the HTML is at `body.export_view.value` (or `body.view.value`), with `body.<format>.representation` naming the format. Title is at `title`, the site base at `_links.base`.
- [Unverified] The `BodySingle` response schema only declares `storage`, `atlas_doc_format` and `view`, not `export_view`. The parameter docs say it works; the schema does not show it. Confirm on a real page; if `body.export_view` is missing, fall back to `body-format=view`.
- Auth for browser use is the session cookie. OAuth scope listed is `read:page:confluence`.

**v1 fallback.** `GET /wiki/rest/api/content/{id}?expand=body.export_view` is no longer in the current v1 spec. The only v1 content read that remains is `GET /wiki/rest/api/content/search?cql=id=<id>&expand=body.export_view`, with the HTML at `results[0].body.export_view.value`. The v1 `Content.body` schema does list `export_view`, `view`, `styled_view` and `anonymous_export_view`. [Unverified] The old `content/{id}` path may still answer on live sites; treat it as a third attempt, not something to rely on.

[Inference] Images and attachments in `export_view` HTML point at `/wiki/download/attachments/<pageId>/<file>?...` relative to the site, so the inliner must resolve them against `https://<site>.atlassian.net` and fetch them with the session.

**DOM fallback, all unverified.** Not checked against a live Confluence Cloud page. Candidates to try in order for the body: `[data-testid="page-content-only"]`, `#content-body`, `.ak-renderer-document`, `#main-content` (older layout), `#content`. Title: `[data-testid="title-text"]`, `h1#title-text`, then `document.title` with the trailing ` - <Space> - Confluence` removed.

### Open questions for Amanda

1. **Confluence API on envato.atlassian.net.** On any page, open DevTools and run `fetch('/wiki/api/v2/pages/<id>?body-format=export_view').then(r => r.json()).then(j => console.log(Object.keys(j.body), j.body.export_view?.value?.length))`. This confirms whether `export_view` comes back and whether the session cookie is accepted from the page context (some Atlassian APIs want an `X-Atlassian-Token` header or reject cookie auth from scripts).
2. **Confluence DOM selectors.** In the same tab, run `document.querySelector('.ak-renderer-document')?.innerText.length` and the same for `[data-testid="page-content-only"]` and `#content-body`, so phase 6 has a verified fallback.
3. **Signed-in GitHub PR view.** Signed out, PRs use the classic timeline. GitHub has been rolling out a React PR view for signed-in users. On one Envato PR, check whether `document.querySelector('[id^="pullrequest-"] .js-comment-body')` still finds the description; if not, paste the outer HTML of the description block.
4. **Private repo images.** On a private Envato repo README with a relative image, confirm the `/raw/` URL fetches from the page context (`fetch(img.src).then(r => r.status)`), since the redirect target on private repos carries a token.
5. **Mermaid.** Decided: draw the diagrams in the reader with the `mermaid` package, with the source in a collapsed "Diagram source" disclosure under each one.

## Phase 4 notes

Deviations from the plan above, made while building the scaffold:

- **Slicing runs in the reader page, not the service worker.** An MV3 service worker has no `DOMParser` (found in phase 2). The service worker stores the raw capture as `capture:<key>`; the reader slices it on open, writes `training:<key>` and deletes the capture. When a training already exists the reader opens it and ignores the new capture unless the URL has `reslice=1`. Phase 7 replaces this with a continue or re-slice banner.
- **Phase 4 goes past "an empty reader".** The generic capture (`article.markdown-body`, then `main`, then `body`, minus `a.anchor`, `clipboard-copy` and `.zeroclipboard-container`) is enough to slice a public GitHub README end to end. It also resolves `href` and `src` to absolute URLs, since the reader renders from `chrome-extension://`.
- **Capture runs in two `executeScript` calls.** The first injects `capture.js`, which only defines `globalThis.__slicedLearningCapture` in the extension's isolated world. The second calls it with `func` and gets the result. This avoids depending on the completion value of the IIFE bundle and leaves room for an async capture (image inlining) and options in later phases.
- **The reader tab is reused.** The service worker looks for an open reader tab with the same URL through `chrome.runtime.getContexts` and focuses it, otherwise opens a new one. That API needs Chrome 116, set as `minimum_chrome_version`.
- **No inline script in `reader.html`.** The web app applies saved display settings with an inline script; extension pages forbid that, so `reader.jsx` does it before mounting.
- **One React.** `vite.reader.config.js` aliases `react` and `react-dom` to `extension/node_modules`, so the client code bundled from `client/src` does not pull in `client/node_modules/react`.
- **Smoke test uses a patched manifest copy.** A click driven from the service worker does not grant `activeTab`, so `scripts/e2e-smoke.mjs` loads a temporary copy of `dist/` with `host_permissions: ["https://github.com/*"]`. The real manifest has no host permissions.
- **Known gap for phase 7.** "New" and "Start over" are hidden in extension mode, but the brand button in the sidebar still returns to the landing page. That page has no URL form in the extension and its copy still says "Paste a link". The extension landing needs its own copy (or the library list). Fixed in phase 7: the brand button opens the Library.

## Phase 5 notes

GitHub extraction for the four page kinds, cleaning, and image inlining. Code in `extension/src/extractors/`, tests next to it (`npm test` in `extension/`), browser check in `extension/scripts/e2e-github.mjs`.

### Selectors as implemented

| Kind | URL path | Body selectors, in order | Title, in order |
|---|---|---|---|
| `blob` | `/<o>/<r>/blob/...` | `article.markdown-body` | first `h1` in the body, `#file-name-id-wide` |
| `repo-readme` | `/<o>/<r>` | `#readme article.markdown-body`, `article.markdown-body` | first `h1` in the body, `<o>/<r>` |
| `folder-readme` | `/<o>/<r>/tree/...` | `#readme article.markdown-body`, `article.markdown-body` | first `h1` in the body, `#file-name-id-wide`, last path segment |
| `wiki` | `/<o>/<r>/wiki[/...]` | `#wiki-body .markdown-body`, `#wiki-body`, skipping anything inside `.wiki-custom-sidebar` | `h1.gh-header-title`, first `h1` in the body |
| `issue` | `/<o>/<r>/issues/<n>` | `[data-testid="issue-body"] [data-testid="markdown-body"]`, `#issue-body-viewer .markdown-body` | `[data-testid="issue-title"]` |
| `pr` | `/<o>/<r>/pull/<n>` | `[id^="pullrequest-"] .js-comment-body`, `.js-discussion .js-comment-body`, then the two issue selectors | `[data-testid="issue-title"]`, then the header `h1`: `.js-issue-title` or its first `span`, else its text minus `.sr-only` and a trailing `#N` |

Every kind falls back to `og:title`, then `document.title` minus ` · GitHub`. A match with no text and no image is skipped. When no selector matches, `extractPage` uses the generic capture (kind `generic`).

### Deviations

- **Host permission for GitHub image hosts.** The plan wanted no host permissions. Fetching from the page context does not work for two GitHub image hosts: `private-user-images.githubusercontent.com` (uploaded screenshots in issues, PRs and READMEs) and `camo.githubusercontent.com` (the proxy for external images) send no `Access-Control-Allow-Origin` header, and content script requests follow the page's CORS rules. Checked on the live issue page: both fail with `Failed to fetch` from the isolated world, while `img.shields.io` and same-origin `github.com` succeed. The manifest now asks for `https://*.githubusercontent.com/*`, and when a page fetch throws, the capture asks the service worker to fetch the image (`src/imageFetch.js`). Chrome shows this as an install warning for githubusercontent.com. It grants nothing on github.com or Confluence. **Needs Amanda's OK**; without it, uploaded images and camo-only images keep their URLs, and the uploaded ones break after five minutes.
- **Segment count on short pages.** A segment is 400 words. The Vite README is about 150 words, so it slices into one segment; the e2e expects at least one for that page. The phase 1 issue (`vitejs/vite#21954`) and PR (`#22981`) are also under 400 words, so the e2e uses `vitejs/vite#11804` (issue with an uploaded screenshot) and `vitejs/vite#10671` (PR with an image) instead.
- **PR header.** Signed out, the PR timeline is still classic, but the header `h1` is already the React component (`h1[data-component="Heading"]` with the title in the first `span` and ` - #N` in `.sr-only`). The title strategy handles both headers.
- **Task lists.** The sanitiser keeps dropping `input`; it cannot constrain `type` and `disabled` without a DOMPurify hook, which would apply to the server's shared instance too. `cleanBody` replaces each checkbox with `☑ ` or `☐ ` text instead.
- **`details`.** GitHub UI toggles (`details.details-reset`, `details.details-overlay`, `details-dialog`) are removed. A `details` that wraps the whole body is opened up, with its summary kept as a paragraph. Other `details` in the content stay, collapsed, because the sanitiser does not allow the `open` attribute.
- **Diagrams.** Every `section.js-render-needs-enrichment`, `.render-container` or `iframe.render-viewer` becomes `<pre><code class="language-<type>">` (type from `data-type`, usually `mermaid`) plus a "Diagram rendered on GitHub" link. The source comes from `pre[lang]`, then `data-json`, the iframe's `data-content`, then `data-plain`. The same code covers GeoJSON, TopoJSON and STL blocks, which use the same viewscreen markup [Inference: not seen in a fixture]. The reader draws the `language-mermaid` blocks (`client/src/hooks/useMermaidDiagrams.js`): after a segment is in the DOM it loads `mermaid` with a dynamic `import()`, so the package is a separate chunk that only loads for a segment with a diagram, and replaces each block with `figure.mermaid-diagram` holding the SVG, followed by `details.mermaid-source` with the source. The link to the original page stays. Mermaid runs with `securityLevel: "strict"`, `theme: "dark"` when the reader theme is dark (or Auto on a dark OS) and `"default"` otherwise, and redraws when the theme changes. A block Mermaid cannot parse stays as source. The SVG is never stored and the sanitiser is unchanged. The extension reader loads the chunk from its own origin and draws without `unsafe-eval` (`scripts/e2e-mermaid.mjs`). Other diagram types stay as source.
- **Stats.** `stats` also has `reasons`, counting skips by `fetch-failed`, `not-image`, `too-large` and `total-cap`. The reader writes `stats` into `training:<key>` next to `payload`, and `payload.sourceKind` holds the page kind.
- **Fetch timeout.** Each image fetch is aborted after 15 seconds so one slow host cannot hang the capture.

### Sanitiser

`shared/sanitize.js` now allows `details`, `summary` and `kbd`. Checked before the change: all three were stripped to their text. `input` stays stripped (see task lists above). GitHub alert blocks (`div.markdown-alert`) already survive as classed `div`s; only their SVG icon is dropped, so the "Note" or "Warning" label text remains. The reader has no alert styles yet. The URI regexp is unchanged. Tests in `shared/sanitize.test.js`.

### Results

Unit tests: 43 in `extension/` (extractor, cleaning, inlining, service worker fallback), 16 in `shared/` (10 existing, 6 new for the sanitiser). Server tests still pass (3).

`npm run e2e:github` on 2026-11-23, headless Chrome for Testing, signed out:

| Kind | Page | Title | Segments | Images inlined |
|---|---|---|---|---|
| `blob` | `mozilla/readability/blob/main/README.md` | Readability.js | 3 | 0 of 0 |
| `repo-readme` | `vitejs/vite` | Vite ⚡ | 1 | 9 of 9 (89 KB) |
| `wiki` | `mrdoob/three.js/wiki/Migration-Guide` | Migration Guide | 30 | 0 of 0 |
| `issue` | `vitejs/vite/issues/11804` | TypeError: Failed to fetch dynamically imported module | 2 | 1 of 1 (39 KB) |
| `pr` | `vitejs/vite/pull/10671` | feat: experimental server persistent caching | 2 | 1 of 1 (10 KB) |

The phase 4 smoke test still passes. `dist/capture.js` is a single IIFE with no `import`, about 17 KB unminified.

### Unverified

- **Signed-in PR view.** The React PR view fallback (issue selectors on a `/pull/` URL) is only tested against the issue fixture. Open question 3 above still stands.
- **Private repo `/raw/` images.** The page fetch to `github.com/<o>/<r>/raw/...` sends the session, and the redirect goes to `raw.githubusercontent.com` with a `?token=`. Whether that redirect target answers a cross-origin fetch from the page is not checked. If it does not, the service worker fallback fetches it without cookies, which works only if the token in the redirect URL is enough. Open question 4 above still stands.
- **Uploaded images on private repos.** Assumed to behave like public ones (signed `private-user-images` URL, no cookies needed), so the service worker fallback should work. Not checked.
- **`picture` sources.** Inlining replaces the `img`; a `<source srcset>` beside it (the Vite logo's dark variant) keeps its camo URL, which the reader may load instead in dark mode. Camo is public, so it still loads.
- **GitHub error pages.** One headless probe of the PR page got GitHub's "Unicorn!" error page; a retry worked. `e2e-github.mjs` retries a page up to three times.

## Phase 6 notes

Confluence Cloud capture: REST API first, DOM fallback, macro cleaning, attachment inlining. Code in `extension/src/extractors/confluence.js` and `cleanConfluence.js`, tests in `confluence.test.js`, browser check against a local mock in `extension/scripts/e2e-confluence-mock.mjs`. Nothing was run against a real Confluence site.

### Routes as implemented

| `via` | Request (from the page, `credentials: "include"`) | HTML | Title |
|---|---|---|---|
| `api-v2` | `GET /wiki/api/v2/pages/<id>?body-format=export_view` | `body.export_view.value` | `title` |
| `api-v2` (retry) | same with `body-format=view`, when the first answer has no `body.export_view` | `body.view.value` | `title` |
| `api-v1` | `GET /wiki/rest/api/content/search?cql=id=<id>&expand=body.export_view` | `results[0].body.export_view.value` | `results[0].title` |
| `dom` | none | first non-empty of `[data-testid="page-content-only"]`, `#content-body`, `.ak-renderer-document`, `#main-content`, `#content` | `[data-testid="title-text"]`, `h1#title-text`, `og:title`, `document.title` minus ` - <Space> - Confluence` |

A route fails on a non-2xx answer, a thrown fetch, a 20 second timeout, or HTML with no text and no image. An API answer without a title takes the DOM title. The page id comes from `/wiki/spaces/<space>/pages/<id>[/<slug>]` or `/wiki/pages/viewpage.action?pageId=<id>`; any other `atlassian.net` URL uses the generic capture. The route taken is stored as `extraction: { via, format, apiErrors }` in `capture:<key>` and `training:<key>`.

### Deviations

- **`sites.js` now accepts any `*.atlassian.net` site** (one label before `atlassian.net`), where phase 5 allowed `envato.atlassian.net` alone, so the mock e2e can use `mock.atlassian.net`. The page is still read only on a click, and the manifest has no Atlassian host permission. Jira pages on the same host count as supported and get the generic capture.
- **`extractPage` is async** for every host because the Confluence extractor awaits the API. The three GitHub tests that call it now `await` it; nothing else in them changed.
- **API HTML stays in an inert document.** `parseBody` parses the HTML with the page's `DOMParser` and keeps the wrapper in that parsed document, rather than importing it into the page, so attachment images do not start loading and scripts never run in the page.
- **Image credentials.** Page-context image fetches now pass `credentials: "include"` for same-origin URLs and keep `"same-origin"` (the fetch default) for cross-origin ones (`withPageCredentials` in `imageFetch.js`). Same-origin requests already sent cookies under the default, so behaviour on GitHub is unchanged; `include` for cross-origin would break hosts answering `Access-Control-Allow-Origin: *`.
- **Info macros become blockquotes** (`blockquote.confluence-panel confluence-panel-<type>`) led by a bold title, since the reader already styles blockquotes and has no panel styles. The panel macro (`div.panel` with `.panelHeader`) gets the same treatment.
- **Jira macros keep the summary** as text after the key link; the Jira status lozenge and issue type icon are dropped.
- **No `content/{id}` v1 attempt.** Phase 1 suggested `GET /wiki/rest/api/content/<id>?expand=body.export_view` as a third API attempt. It is not in the current v1 spec, so it is not called.
- **No sanitiser change.** `details`, `summary`, `blockquote`, `table`, `span` with `class` were already allowed. `shared/` is untouched.

### Cleaning rules and how sure they are

| Rule | Markup matched | Status |
|---|---|---|
| Expand macro to `details`/`summary` | `.expand-container`, `.expand-control`, `.expand-control-text`, `.expand-content` | `expand-container` and `expand-control` confirmed in Atlassian's KB "Expand Macro collapses immediately upon expanding it". `expand-control-text` and `expand-content` unverified. |
| Info, note, tip, warning to blockquote | `.confluence-information-macro[-<type>]`, `p.title`, `.confluence-information-macro-body` | `confluence-information-macro`, `-body`, `-information` named in an Atlassian community answer on styling the info macro in HTML export. `p.title` and the other type suffixes unverified. |
| Code macro to `pre > code` | `div.code.panel`, `[data-macro-name="code"]`, `.code-block`, `pre.syntaxhighlighter-pre` with `data-syntaxhighlighter-params="brush: <lang>"`, `.codeHeader` | Unverified |
| Status lozenge to `span` | `.status-macro`, `[data-macro-name="status"]` | Unverified |
| TOC macro removed | `.toc-macro`, `.client-side-toc-macro`, `[data-macro-name="toc"]` | Unverified |
| Jira macro to link | `.jira-issue` with `data-jira-key`, `a.jira-issue-key`, `.summary`; else a link to `<origin>/browse/<key>` | Unverified |
| Emoticons to text | `img.emoticon`, `img[data-emoticon-name]`, `img[data-emoji-id]`; `data-emoji-fallback` (unless it is a `:shortname:`), then `alt` | Unverified |
| Attachment images | `img[data-image-src]` resolved against the site (or `data-base-url` for a relative path); old `src` kept as `data-fallback-src` | Unverified |
| Layout unwrapped | `.contentLayout2`, `.columnLayout`, `.cell`, `.innerCell`, `div.table-wrap`, `span.confluence-embedded-file-wrapper` | Unverified |
| UI removed | `span.aui-icon`, macro icon spans, `span.confluence-anchor-link`, `button`, `script`, `style` | Unverified |
| URLs absolute | every `href`, `src`, `srcset`, against the page URL (reuses `absolutise` from `clean.js`) | Tested |

Searches for Atlassian documentation of `syntaxhighlighter-pre`, `status-macro` and the Jira macro markup found nothing usable. These rules follow the view HTML Confluence has rendered for years, and Cloud may render some macros differently (or as empty shells, see Risks). The fixtures are hand-written to the same assumptions, so the tests prove the rules work on that markup, not that the markup is right.

### Results

Unit tests: 66 in `extension/` (43 from phase 5, 22 Confluence tests in `confluence.test.js`, 1 for `withPageCredentials`), 16 in `shared/` (unchanged).

`npm run e2e:confluence` on 2026-11-23, headless Chrome for Testing, local mock routed from `https://mock.atlassian.net`:

| Page | Mock behaviour | `via` | Title | Segments | Images inlined |
|---|---|---|---|---|---|
| 123 | v2 answers with `export_view` | `api-v2` | Onboarding guide | 2 | 2 of 2 |
| 124 | v2 answers 500, v1 search answers | `api-v1` | Onboarding guide (v1) | 2 | 2 of 2 |
| 125 | both answer 500 | `dom` | Onboarding from the rendered page | 1 | 0 of 0 |

The mock refuses every API and attachment request without its session cookie; all 9 such requests carried it. The storage key drops the slug (`training:https://mock.atlassian.net/wiki/spaces/TEST/pages/123`). The phase 4 smoke test and `E2E_ONLY=repo-readme,issue npm run e2e:github` still pass. `dist/capture.js` is about 32 KB unminified (17 KB after phase 5).

### Unverified

- **Cookie auth from page scripts.** Phase 1 open question 1 still stands: whether envato.atlassian.net answers `/wiki/api/v2/...` from a page `fetch` with only the session cookie, or wants an `X-Atlassian-Token` header. The mock cannot tell; GET requests normally need no XSRF token.
- **`body.export_view` in v2.** The v2 response schema does not declare it. The code retries with `view`, which renders macros less fully.
- **Attachment downloads.** `/wiki/download/attachments/...` is same-origin, but Confluence Cloud may redirect it to the Atlassian media service on another host. A cross-origin redirect needs CORS headers on that host; if they are missing, the page fetch fails, the service worker fallback has no host permission there, and the image keeps its URL, which will not load in the reader. Look at `stats.reasons["fetch-failed"]` after the first capture.
- **DOM selectors.** Phase 1 open question 2 still stands.
- **Title suffix.** `document.title` assumed to be `<Page> - <Space> - Confluence`.
- **Macro markup.** See the table above.

### First manual test on envato.atlassian.net

1. **Build and load.** `cd extension && npm install && npm run build`. In `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick `extension/dist` (or press reload on the existing card).
2. **Open the page.** Sign in to envato.atlassian.net in the same Chrome profile and open the example page, `https://envato.atlassian.net/wiki/spaces/<SPACE>/pages/<pageId>/<slug>`. Pick one with a table, an image, a code block and an info or expand macro if you can.
3. **Click the toolbar button.** The reader should open in a new tab with the page title and one or more sections.
4. **Check the reader.** Title matches the page; headings, tables and code blocks look right; info macros show as quotes with a bold title; expand macros show as collapsed toggles; status lozenges are plain words; Jira macros are links with the key; no table of contents at the top; images show (they should be `data:` URLs, so they still load with the network off).
5. **Check the route.** In the reader tab, open DevTools and run:

   ```js
   chrome.storage.local.get(null).then((all) => {
     const [key, t] = Object.entries(all).find(([k]) => k.startsWith("training:") && k.includes("atlassian"));
     console.log(key, t.payload.sourceKind, t.extraction, t.stats);
   });
   ```

   Expect `confluence`, `extraction.via` = `"api-v2"`, `extraction.format` = `"export_view"`, and `stats.inlined` equal to the number of images. Paste the output back.

If something is off, run these in DevTools on the Confluence page tab (not the reader) and paste the results:

- **API answers from the page** (phase 1 question 1):

  ```js
  const id = location.pathname.match(/pages\/(\d+)/)?.[1] || new URLSearchParams(location.search).get("pageId");
  fetch(`/wiki/api/v2/pages/${id}?body-format=export_view`, { credentials: "include" })
    .then((r) => { console.log(r.status, r.headers.get("content-type")); return r.json(); })
    .then((j) => console.log(Object.keys(j.body || {}), j.body?.export_view?.value?.length, j.title));
  ```

- **v1 fallback:**

  ```js
  fetch(`/wiki/rest/api/content/search?cql=id=${id}&expand=body.export_view`, { credentials: "include" })
    .then((r) => r.json()).then((j) => console.log(j.results?.[0]?.body?.export_view?.value?.length));
  ```

- **Macro markup** (to correct the cleaning rules):

  ```js
  fetch(`/wiki/api/v2/pages/${id}?body-format=export_view`).then((r) => r.json()).then((j) => {
    const d = new DOMParser().parseFromString(j.body.export_view.value, "text/html");
    console.log([...new Set([...d.querySelectorAll("[data-macro-name]")].map((n) => `${n.dataset.macroName}: ${n.className}`))]);
    console.log(d.querySelector("img")?.outerHTML);
  });
  ```

- **Attachment fetch** (the redirect question above):

  ```js
  const img = document.querySelector('img[src*="/wiki/download/"], img[data-image-src]');
  fetch(img.dataset.imageSrc || img.src, { credentials: "include" })
    .then((r) => console.log(r.status, r.url, r.headers.get("content-type")))
    .catch((e) => console.log("failed", e.message));
  ```

- **DOM fallback** (phase 1 question 2):

  ```js
  ['[data-testid="page-content-only"]', "#content-body", ".ak-renderer-document", "#main-content", "#content"]
    .map((s) => [s, document.querySelector(s)?.innerText.length]);
  ```

- **Capture errors.** In `chrome://extensions`, click **service worker** on the Sliced Learning card and look for "Sliced Learning could not capture this page".

## Phase 7 notes

Polish: a Library of stored trainings with delete, the continue or re-slice choice, reader details, icons from the app logo, and a font fix. Built and tested on 2026-11-23.

### What changed

| Area | Behaviour | Code |
|---|---|---|
| Library | With no training open, the extension reader lists every `training:<key>`: title (opens `reader.html?key=<key>`), site badge, page kind, capture date, "n of m done" and a progress bar, newest progress first. Above the list: the number of trainings (finished and in progress) and storage used from `getBytesInUse`, each with a helper line. An empty library explains which pages are supported. | `client/src/components/Library.jsx`, `listTrainings` and `getStorageUsage` in `extensionTrainingSource.js` |
| Delete | **Delete** turns into "Delete this training and its progress?" with Delete and Cancel. Confirming removes `training:<key>` and `capture:<key>` in one `chrome.storage.local.remove` call, then reloads the list. | `deleteTraining`, `deleteTrainingAndCapture` in `storage.js` |
| Continue or re-slice | When a training and a newer capture both exist, the reader opens the training with a banner: "Saved training from <date>. Continue, or Re-slice from the page you just captured." Continue deletes the capture. Re-slice slices it, replaces the training and resets progress. `?reslice=1` re-slices without asking. A capture older than the training is deleted on open. | `loadTraining`, `keepSavedTraining`, `resliceTraining`; the banner in `App.jsx` |
| Unsupported page | The message names the supported sites and page kinds, with a "Back to your library" link. A missing capture shows the same layout. | `UNSUPPORTED_MESSAGE`, `Library.jsx` |
| Reader details | Description line from the source: "GitHub issue · 2 sections · ~2 min each". "Images skipped: n" under it when `stats.skipped` is above zero, with the reasons as a tooltip. `document.title` was already the training title; the smoke test now checks it. "Open original" was already present. | `describeTraining`, `getTrainingNotes`, `src/sourceKinds.js` |
| Icons | The `LogoMark` gradient square with three bars, rasterised at 16, 32, 48 and 128 px. | `scripts/make-icons.mjs` |
| Fonts | Inter at a 16px base on the reader page (see below). | `src/reader.css` |
| Wide Confluence layout | Confluence trainings get `is-wide` on `main.content`: the card and banners default to 65% of the content width, centred, and at least 800px when there is room. The article body loses the reading measure so text and wide tables fill the card. Dragged reading margins override the default width. The padding scale is unchanged, and other kinds and the web app keep the 800px centred card. | `getLayout` in `extensionTrainingSource.js`, `.content.is-wide` in `client/src/App.css` |
| GitHub syntax colours | Highlighted GitHub code keeps its Prettylights `pl-*` spans through cleaning, sanitising and slicing (tested on `blob-readme.html`). The reader colours them with GitHub's `--color-prettylights-syntax-*` values from Primer primitives 11.10.0, light for the light and sepia themes and dark for the dark theme or a dark OS with no theme set, mapped to classes as in github-markdown-css. Code blocks in extension trainings sit on the theme's `--surface-2` instead of the always-dark block. Extension only: the server's Readability pass drops classes, so web app articles never carry `pl-*` spans. `npm run e2e:github` checks the keyword colour and block background in both schemes. | `src/githubSyntax.css`, imported by `src/reader.jsx` |

### Training source interface additions

Documented in `client/src/trainingSource/index.js`. The web source sets `library: false` and implements none of the methods, so its landing page, description line and behaviour are unchanged.

| Member | Purpose |
|---|---|
| `capabilities.library` | Render `<Library>` instead of the landing page when no training is loaded |
| `listTrainings()` | `TrainingSummary[]`: `key`, `title`, `href`, `sourceUrl`, `site`, `kindLabel`, `capturedAt`, `updatedAt`, `completedCount`, `totalSegments` |
| `deleteTraining(key)` | Remove a training and anything kept for it |
| `getStorageUsage()` | `{ bytes, label }`, optional |
| `describeTraining(training)` | Description line, optional; defaults to the content type's |
| `getTrainingNotes(training)` | `{ id, text, detail }[]` shown under the description, optional |
| `getLayout(training)` | `{ wide }`, optional; `wide: true` adds `is-wide` to the content container |
| `keepSavedTraining(training)`, `resliceTraining(training)` | The two banner actions, used when `load` returns `pendingCapture` |

### Deviations

- **The reused reader tab is reloaded.** The service worker already focused an open reader tab for the same key. It now also reloads it, so the reader reads the fresh capture and shows the banner. Progress is saved on every move, so the reload loses nothing. The alternative, a `chrome.storage.onChanged` listener in the reader, would need another interface hook for no visible gain.
- **The extension source now has `syncLocation`.** Once a training shows, it rewrites the address to `?key=<key>`, which drops `reslice=1` so a reload does not re-slice again and keeps the URL the service worker looks for when reusing tabs. When the learner goes back to the Library it clears the query. It only clears a key it wrote itself, so the first render (no training yet) cannot wipe the key being loaded.
- **`progressUpdatedAt`.** `training:<key>` gains this field, set on every progress save and to the capture time on slicing. The Library sorts by it and falls back to `capturedAt` for trainings saved before phase 7.
- **Badges.** Sites come from the page kind first, then the host: GitHub, Confluence, Atlassian (a generic capture on `atlassian.net`, such as a Jira page) or Web page.
- **No charts on the Library figures.** The "Numbers in the UI" rule asks for clickable figures with a small chart of real history. Storage and training counts are read live and no history is stored, so there is nothing true to chart and the figures are plain.
- **New CSS** is one scoped block in `client/src/App.css` (`.library-*`, `.capture-banner`, `.segment-note`, `.type-pill.is-github` and `.is-confluence`). It reuses `feature-card`, `type-pill`, `progress-bar`, `progress-stats`, `completion-banner`, `primary-button`, `ghost-button` and `error-message`. No existing rule changed.

### Fonts under the extension CSP

Phase 4 left this unverified. The smoke test now waits for `document.fonts.ready` and checks the loaded faces and the body's computed style. The Google Fonts stylesheet does load under the default extension page CSP: `Inter` and `Literata` both report `loaded`. The check found a different problem. Chrome gives extension pages a default stylesheet with `body { font-family: system-ui, sans-serif; font-size: 75% }`, which overrides the `:root` font, so the reader UI was in system-ui at 12px since phase 4. Only elements with their own `font-family` (segment text, some headings) used Inter. `src/reader.css`, imported only by the extension entry, sets `body { font-family: inherit; font-size: inherit }`. Body is now `Inter, system-ui, ...` at 16px. Fonts are still fetched from Google, so with no network the reader falls back to system fonts. Bundling the font files was not needed.

### Icons

`make-icons.mjs` stays plain Node. It describes `LogoMark` as data (the 32 x 32 rounded square with radius 9, the `#7c5cff` to `#ff6b9d` diagonal gradient, and the three white bars at opacity 1, 0.85 and 0.7), samples each pixel 64 times, and writes RGBA PNGs with `zlib`. No new dependency. The shapes are copied by hand, so a change to `LogoMark` needs the same change in the script.

### Results

| Check | Result |
|---|---|
| `client`: `npm run lint`, `npm run build` | clean |
| `extension`: `npm test` | 71 pass (66 before, 5 new in `sourceKinds.test.js`) |
| `extension`: `npm run build` | clean |
| `shared`: `npm test` | 16 pass, unchanged |
| `npm run smoke` | pass: Library, delete with cancel, banner, Continue, Re-slice, `?reslice=1`, unsupported link, fonts, no console errors |
| `E2E_ONLY=blob,issue npm run e2e:github` | pass: blob 3 segments, issue 2 segments with 1 of 1 image inlined |
| `npm run e2e:confluence` | pass: `api-v2`, `api-v1` and `dom` routes |

All runs were headless Chrome for Testing (Playwright's `chromium-1243`), with `PLAYWRIGHT_MODULE` pointing at the main checkout's Playwright.

### Unverified

- **A real toolbar click.** See the Status list at the top.
- **The banner date** uses the browser's locale and time zone (`toLocaleDateString`), checked only in an English locale.
- **Storage used** counts every key the extension stores, including captures waiting for a choice, so it can be larger than the sum of the listed trainings.
- **Large libraries.** `listTrainings` reads the whole storage area, data URLs included, on every open. Fine for tens of trainings; with hundreds of image-heavy ones it may be slow. Not measured.
