# Sliced Learning Chrome extension

Slices GitHub and Confluence Cloud pages into training segments inside your browser. Click the toolbar button on a supported page: the extension reads the rendered page from the logged-in tab, opens the Sliced Learning reader in a new tab, and slices the page there. The text and your progress stay in this Chrome profile (`chrome.storage.local`). Nothing is sent to the Sliced Learning server.

Supported hosts: `github.com` and any Confluence Cloud site on `*.atlassian.net` (built for `envato.atlassian.net`). On any other page the button opens the reader with a message naming the supported sites and a link to the Library.

Status: all seven phases of [the plan](../docs/chrome-extension-plan.md) are built. GitHub and Confluence Cloud pages have their own extractors. A supported host with a page the extractors do not recognise (a Confluence space overview, a Jira page on `atlassian.net`) uses the generic capture (the first of `article.markdown-body`, `main`, `body`).

## Supported GitHub pages

| Page | Example | Page kind (`payload.sourceKind`) | What is captured |
|---|---|---|---|
| Rendered Markdown file | `/<owner>/<repo>/blob/<ref>/<path>.md` | `blob` | The rendered file |
| README on the repo page | `/<owner>/<repo>` | `repo-readme` | The README |
| README on a folder page | `/<owner>/<repo>/tree/<ref>/<path>` | `folder-readme` | The folder's README |
| Wiki page | `/<owner>/<repo>/wiki/<page>` | `wiki` | The page body, without the custom sidebar |
| Issue | `/<owner>/<repo>/issues/<n>` | `issue` | The description only, no comments |
| Pull request | `/<owner>/<repo>/pull/<n>` | `pr` | The description only, no comments or review threads |

The kind comes from the URL path, then each kind tries an ordered list of selectors (`src/extractors/github.js`, recorded in the plan under "Phase 1 findings"). If none matches, for example on a GitHub page of another kind, the generic capture runs instead and the kind is `generic`.

Before the body leaves the page, `src/extractors/clean.js` removes GitHub UI (heading permalinks, copy buttons, diagram overlay toggles), turns task list checkboxes into ☑ and ☐ text, makes every `href`, `src` and `srcset` absolute, and swaps camo proxy URLs for the original image URL (`data-canonical-src`), keeping camo as a fallback.

**Mermaid and other rendered diagrams.** GitHub draws diagrams inside a cross-origin iframe the extension cannot read. The reader shows the diagram source as a code block (`language-mermaid`) followed by a "Diagram rendered on GitHub" link to the original page. Diagrams are not rendered in the reader.

## Supported Confluence Cloud pages

Page URLs in either form, kind `confluence`:

- `https://<site>.atlassian.net/wiki/spaces/<SPACE>/pages/<pageId>/<slug>` (the slug is optional)
- `https://<site>.atlassian.net/wiki/pages/viewpage.action?pageId=<pageId>`

`src/extractors/confluence.js` reads the page id from the URL and tries three routes in order. The route taken is stored with the training as `extraction.via`.

| `via` | Request | HTML at | Title at |
|---|---|---|---|
| `api-v2` | `GET /wiki/api/v2/pages/<id>?body-format=export_view`, then `?body-format=view` when the answer has no `body.export_view` | `body.export_view.value`, or `body.view.value` | `title` |
| `api-v1` | `GET /wiki/rest/api/content/search?cql=id=<id>&expand=body.export_view` | `results[0].body.export_view.value` | `results[0].title` |
| `dom` | none, reads the rendered page | first of `[data-testid="page-content-only"]`, `#content-body`, `.ak-renderer-document`, `#main-content`, `#content` | `[data-testid="title-text"]`, `h1#title-text`, `og:title`, `document.title` minus ` - <Space> - Confluence` |

**What the API route needs.** Only your normal Confluence login in that tab. The capture calls the API from the page with `credentials: "include"`, so your session cookie goes with it, and the requests are same-origin, so the manifest needs no Atlassian host permission. A page you cannot open in the browser cannot be captured either. If the site rejects cookie authentication from scripts, both API routes fail and the capture falls back to the rendered page (`via: "dom"`).

Before slicing, `src/extractors/cleanConfluence.js` turns Confluence macros into plain HTML the reader can show:

| In the page | In the training |
|---|---|
| Table of contents macro | removed |
| Info, note, tip, warning macros | a blockquote led by the macro title, or by the type ("Warning") when the title is empty |
| Expand macro | `details` with the expand label as `summary` (shown collapsed) |
| Code macro | `pre > code` with a `language-<brush>` class, the code title as a bold paragraph above |
| Status lozenge | a plain `span` with the status text |
| Jira issue macro | a link to the issue with the key as text, then the summary |
| Emoticon images | their Unicode fallback or alt text, such as `(tick)` |
| Attachment images | the full-size `data-image-src` URL (a thumbnail `src` is kept as the inliner's fallback) |
| Layout wrappers (`table-wrap`, column layouts, image wrappers) | unwrapped |
| Every `href` and `src` | absolute against the site (export view uses `/wiki/download/...` and `/wiki/spaces/...`) |

Only the expand and info macro class names are confirmed in Atlassian documentation; the rest follow Confluence's long-standing view HTML and are marked unverified in the code.

**What to check on first real use.** Whether `via` is `api-v2` (stored in `training:<key>.extraction`), whether macros come through as the table above says, and whether attachment images were inlined (`stats.inlined`). The checklist with DevTools snippets is in the plan under "First manual test on envato.atlassian.net".

## Library

Open `reader.html` with no query (the brand button in the reader, the "Back to your library" link, or `chrome-extension://<id>/reader.html`) to see every training stored in this profile, most recently studied first (by the last progress save, else the capture date). Each row shows:

- the title, which opens the training (`reader.html?key=<key>`)
- a site badge (GitHub, Confluence, Atlassian for other `atlassian.net` pages, or Web page) and the page kind ("GitHub issue", "Confluence page")
- the capture date and "n of m done" with a progress bar
- **Delete**, which asks "Delete this training and its progress?" first. Confirming removes `training:<key>` and any `capture:<key>` still waiting for it. It cannot be undone; capture the page again to get it back, with progress reset.

Two figures sit above the list: the number of trainings (finished and in progress) and **Storage used**, from `chrome.storage.local.getBytesInUse`, which counts everything the extension stores. Images are inlined into each training, so image-heavy pages take the most space; deleting finished trainings frees it. The `unlimitedStorage` permission means Chrome does not cap it.

The list is read when the Library opens and again when its tab comes back into view.

## Opening a page again: continue or re-slice

Clicking the toolbar button on a page that already has a training stores a fresh capture and opens (or focuses and reloads) its reader tab. Because both exist, the reader shows a banner: "Saved training from <date>. Continue, or Re-slice from the page you just captured."

- **Continue** keeps the saved training and its progress, and deletes the new capture.
- **Re-slice** slices the new capture, replaces the training and resets progress to the first segment.

Until you choose, the capture stays in storage and the banner comes back on reload. `reader.html?key=<key>&reslice=1` re-slices the waiting capture without asking; the reader then drops `reslice=1` from the address so a reload does not re-slice again.

## Reader details

The tab title is the training title. "Open original" in the progress panel opens the captured page in a new tab. The line under the title names the page kind, for example "GitHub issue · 2 sections · ~2 min each". When the capture left images as links, a second line says "Images skipped: n" and its tooltip gives the reasons from `stats.reasons` (could not be fetched, not an image, over the 2 MB per-image limit, after the 20 MB training limit).

Confluence trainings use a full-width layout: the content card fills the space beside the sidebar and the article body drops the 36em reading measure, so wide tables have room. Other training kinds keep the centred 800 px card. The source asks for it through `getLayout(training)`, and `npm run e2e:confluence` checks the card is at least 90% of that space at 1600x900.

Chrome gives extension pages a default stylesheet that sets `body` to `system-ui` at 75%. `src/reader.css` hands the font and size back to the root, so the reader uses Inter at the same 16px base as the web app. The Google Fonts stylesheet loads under the default extension page CSP (checked by the smoke test).

## Images

Images are inlined into the training as `data:` URLs during the capture, because uploaded GitHub images use signed URLs that expire after five minutes and private repo images need your session. `src/extractors/inlineImages.js` fetches up to four images at a time:

| Limit | Value | When it is hit |
|---|---|---|
| Per image | 2 MB | The image keeps its URL |
| Per training | 20 MB | Later images keep their URLs |
| Per request | 15 s | The image keeps its URL |

An image also keeps its URL when the response is not an image or the fetch fails. Each image is fetched from the page first, where your GitHub or Confluence cookies apply. Some GitHub image hosts (`private-user-images.githubusercontent.com` for uploads, `camo.githubusercontent.com` for proxied external images) send no CORS headers, so the page cannot read them; for those the capture asks the service worker, which may fetch from `*.githubusercontent.com` through the manifest's host permission. Same-origin images, such as Confluence attachments under `/wiki/download/`, are fetched with `credentials: "include"`; cross-origin images keep the fetch default, which sends no cookies. The counts are stored with the capture as `stats`: `{ inlined, skipped, bytes, reasons }`, where `reasons` counts skips by `fetch-failed`, `not-image`, `too-large` and `total-cap`.

## Build

```bash
cd extension
npm install
npm run build
```

The build writes `extension/dist/`:

- `reader.html` and `assets/`: the reader page, which bundles the React client from `client/src` with this package's React.
- `background.js`: the service worker.
- `capture.js`: the script injected into the page on a click. It is a classic script with no imports (Vite bundles the extractor modules into one IIFE).
- `manifest.json` and `icons/`, copied from `src/`.

`npm run icons` regenerates the toolbar icons in `src/icons/` (16, 32, 48 and 128 px) from the app's `LogoMark` (`client/src/components/Icons.jsx`). `scripts/make-icons.mjs` holds the logo's shapes and colours, rasterises them with 8 x 8 supersampling and writes PNGs with Node's zlib, so it needs no image library. If `LogoMark` changes, update the `LOGO` constant in the script and run it again.

## Load unpacked

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick `extension/dist`.
4. After a rebuild, press the reload icon on the extension card.

The manifest asks for `activeTab`, `scripting`, `storage` and `unlimitedStorage`, plus one host permission, `https://*.githubusercontent.com/*`, so the service worker can fetch GitHub images the page cannot read (see Images above). It has no host permission for github.com or Confluence: the page is only read when you click the button.

## Tests

```bash
npm test
```

Runs the extractor, cleaning and image inlining tests (`src/**/*.test.js`) with `node --test` and jsdom, against the fixtures in `fixtures/github/` and `fixtures/confluence/`. The Confluence tests answer the REST API with a fake `fetchImpl`. The fixtures hold the body element only, so `src/extractors/testPages.js` wraps each in the bit of page structure its selectors need.

## Smoke test

`scripts/e2e-smoke.mjs` runs the whole flow in Chromium with Playwright: it opens the Readability README on GitHub, triggers the toolbar handler from the service worker, and checks that:

- the reader shows segments, the tab title is the training title, the description names the kind, and Inter from Google Fonts loaded on a 16px body
- progress survives a reload
- a second click reuses the tab and shows the banner; Continue keeps progress and removes the capture
- a third click and Re-slice reset progress; `?reslice=1` re-slices without asking and leaves the address
- the Library lists the training with "1 of 3 done" above an older Confluence training written into storage by the test, a row opens its training, and Delete (after Cancel once) removes the training and its waiting capture
- an unsupported page names the supported sites and links back to the Library
- the reader logs no console errors It needs network access to github.com. It is not run in CI.

```bash
npm run build
npm run smoke
```

Playwright is not a dependency of this package. If `playwright` does not resolve from `extension/`, point at an install:

```bash
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs \
CHROMIUM_PATH="/path/to/Google Chrome for Testing" \
npm run smoke
```

Set `HEADED=1` to watch it and `SMOKE_URL` to capture another page.

`scripts/e2e-github.mjs` (`npm run e2e:github`, same environment variables) captures one public page of each GitHub kind (blob, repo README, wiki, issue, PR) and checks the stored training's kind, title, segment count and, for the repo README and the issue, that images were inlined. `E2E_ONLY=issue,pr` runs a subset. Playwright cannot click the toolbar button, and a click driven from the service worker does not grant `activeTab`, so the script loads a temporary copy of `dist/` whose manifest adds host access to `https://github.com/*` on top of the manifest's own. The build in `dist/` is not changed.

`scripts/e2e-confluence-mock.mjs` (`npm run e2e:confluence`, same environment variables) needs no network. It starts a local mock Confluence (rendered page, v2 page endpoint, v1 content search, attachment downloads, all but the page behind a mock session cookie) and routes `https://mock.atlassian.net/*` to it with Playwright. It captures three pages, one per route (`api-v2`, `api-v1`, `dom`), and checks kind, route, title, segment count, inlined images, the storage key and that no macro markup is left.

## Storage layout

All data lives in `chrome.storage.local`. `<key>` is the page URL normalised by `src/urlKey.js`: hash removed, GitHub `?plain=1` removed, and the Confluence title slug after the page id removed.

| Key | Value | Written by | Removed |
|---|---|---|---|
| `capture:<key>` | `{ title, html, sourceUrl, capturedAt, kind, stats, extraction }` | service worker, on each click | by the reader once it slices the capture, on Continue, or with the training on Delete |
| `training:<key>` | `{ payload, progress, capturedAt, progressUpdatedAt, stats, extraction }` | reader, after slicing; progress on every move | Delete in the Library |

`payload` has the shape the server returns from `POST /api/process` (`type`, `title`, `sourceUrl`, `segmentMinutes`, `totalSegments`, `totalWords`, `segments[]`), plus `sourceKind`, the extractor's page kind (`confluence` for Confluence pages). `extraction` is `{ via, format, apiErrors }` for Confluence (`format` is `export_view` or `view`, `apiErrors` lists why the API routes failed on a `dom` capture) and `null` elsewhere. `type` is always `"article"`. `progress` is `{ completed: boolean[], activeIndex }`. `progressUpdatedAt` is the ISO time of the last progress save (the capture time until then) and orders the Library.

When `training:<key>` and a newer `capture:<key>` both exist, the reader asks whether to continue or re-slice (see above).

## Source layout

| File | Role |
|---|---|
| `src/manifest.json` | Manifest V3 |
| `src/background.js` | Toolbar click: site check, capture, store, open or focus the reader; image fetches the page cannot make |
| `src/capture.js` | Injected capture: extract, clean, inline images |
| `src/extractors/index.js` | Picks the extractor by host |
| `src/extractors/github.js` | GitHub page kinds, body selectors and titles |
| `src/extractors/confluence.js` | Confluence page id, REST API routes, DOM fallback and titles |
| `src/extractors/cleanConfluence.js` | Turns Confluence macros into plain HTML, resolves attachment URLs |
| `src/extractors/generic.js` | Fallback capture for other pages |
| `src/extractors/clean.js` | Strips GitHub UI, replaces diagrams, absolutises URLs |
| `src/extractors/inlineImages.js` | Inlines images as data URLs within the caps |
| `src/imageFetch.js` | Page fetch with the service worker fallback |
| `src/reader.html`, `src/reader.jsx` | Reader page entry, mounts `createReaderApp` from `client/src/ReaderRoot.jsx` |
| `src/reader.css` | Undoes Chrome's default extension page font |
| `src/extensionTrainingSource.js` | Training source backed by `chrome.storage.local`; slices with `shared/slice.js`, lists and deletes trainings, continue or re-slice |
| `src/sourceKinds.js` | Labels for page kinds and sites, the skipped images note, byte formatting |
| `src/storage.js` | Storage keys and helpers |
| `../client/src/components/Library.jsx` | The Library, shown when a training source has `capabilities.library` |
| `src/urlKey.js` | URL normalisation into storage keys |
| `src/sites.js` | Supported-host check (`github.com`, `*.atlassian.net`) |
| `vite.reader.config.js` | App build for the reader |
| `vite.scripts.config.js` | IIFE builds for `background.js` and `capture.js` |
