# Chrome extension: slice GitHub and Confluence pages in the browser

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
- **Mermaid and SVG.** GitHub renders Mermaid as inline SVG and the sanitiser strips `svg`. Decide in phase 5 whether to allow SVG or drop diagrams with a placeholder.
- **Code highlighting.** GitHub and Confluence highlight with classed spans. The reader shows code monochrome unless highlight styles are added.
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
- **Mermaid is not inline SVG.** The risk line above assumed it was. GitHub renders each diagram in a cross-origin `iframe.render-viewer` from `viewscreen.githubusercontent.com`, inside `section.js-render-needs-enrichment[data-type="mermaid"]`. The capture script cannot read inside that iframe. The source survives in the same section as `pre[lang="mermaid"]` and in a `data-json` attribute on the render container. Phase 5 options: show the Mermaid source as a code block, or a placeholder with a link to the original. See `fixtures/github/blob-mermaid.html` (10 diagrams).

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
5. **Mermaid.** Pick one: show diagram source as a code block, or a placeholder with a link to the original page.
