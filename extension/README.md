# Sliced Learning Chrome extension

Slices GitHub and Confluence Cloud pages into training segments inside your browser. Click the toolbar button on a supported page: the extension reads the rendered page from the logged-in tab, opens the Sliced Learning reader in a new tab, and slices the page there. The text and your progress stay in this Chrome profile (`chrome.storage.local`). Nothing is sent to the Sliced Learning server.

Supported hosts: `github.com` and `envato.atlassian.net`. On any other page the button opens the reader with a short "unsupported page" message.

Status: phase 5 of [the plan](../docs/chrome-extension-plan.md). GitHub pages have their own extractor. Confluence arrives in phase 6; until then other pages use the generic capture (the first of `article.markdown-body`, `main`, `body`).

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

## Images

Images are inlined into the training as `data:` URLs during the capture, because uploaded GitHub images use signed URLs that expire after five minutes and private repo images need your session. `src/extractors/inlineImages.js` fetches up to four images at a time:

| Limit | Value | When it is hit |
|---|---|---|
| Per image | 2 MB | The image keeps its URL |
| Per training | 20 MB | Later images keep their URLs |
| Per request | 15 s | The image keeps its URL |

An image also keeps its URL when the response is not an image or the fetch fails. Each image is fetched from the page first, where your GitHub cookies apply. Some GitHub image hosts (`private-user-images.githubusercontent.com` for uploads, `camo.githubusercontent.com` for proxied external images) send no CORS headers, so the page cannot read them; for those the capture asks the service worker, which may fetch from `*.githubusercontent.com` through the manifest's host permission. The counts are stored with the capture as `stats`: `{ inlined, skipped, bytes, reasons }`, where `reasons` counts skips by `fetch-failed`, `not-image`, `too-large` and `total-cap`.

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

`npm run icons` regenerates the placeholder icons in `src/icons/`.

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

Runs the extractor, cleaning and image inlining tests (`src/**/*.test.js`) with `node --test` and jsdom, against the fixtures in `fixtures/github/`. The fixtures hold the body element only, so `src/extractors/testPages.js` wraps each in the bit of page structure its selectors need.

## Smoke test

`scripts/e2e-smoke.mjs` runs the whole flow in Chromium with Playwright: it opens the Readability README on GitHub, triggers the toolbar handler from the service worker, checks the reader shows segments, clicks Next, reloads and checks progress survived, clicks again and checks the reader tab is reused, opens an unsupported page, and fails on any console error in the reader. It needs network access to github.com. It is not run in CI.

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

## Storage layout

All data lives in `chrome.storage.local`. `<key>` is the page URL normalised by `src/urlKey.js`: hash removed, GitHub `?plain=1` removed, and the Confluence title slug after the page id removed.

| Key | Value | Written by | Removed |
|---|---|---|---|
| `capture:<key>` | `{ title, html, sourceUrl, capturedAt, kind, stats }` | service worker, on each click | by the reader once it slices the capture |
| `training:<key>` | `{ payload, progress, capturedAt, stats }` | reader, after slicing; progress on every move | not yet (phase 7 adds a library with delete) |

`payload` has the shape the server returns from `POST /api/process` (`type`, `title`, `sourceUrl`, `segmentMinutes`, `totalSegments`, `totalWords`, `segments[]`), plus `sourceKind`, the extractor's page kind. `type` is always `"article"`. `progress` is `{ completed: boolean[], activeIndex }`.

When `training:<key>` already exists, the reader opens it with its progress and leaves the fresh capture alone. `reader.html?key=<key>&reslice=1` slices the latest capture again; phase 7 adds a button for it.

## Source layout

| File | Role |
|---|---|
| `src/manifest.json` | Manifest V3 |
| `src/background.js` | Toolbar click: site check, capture, store, open or focus the reader; image fetches the page cannot make |
| `src/capture.js` | Injected capture: extract, clean, inline images |
| `src/extractors/index.js` | Picks the extractor by host |
| `src/extractors/github.js` | GitHub page kinds, body selectors and titles |
| `src/extractors/generic.js` | Fallback capture for other pages |
| `src/extractors/clean.js` | Strips GitHub UI, replaces diagrams, absolutises URLs |
| `src/extractors/inlineImages.js` | Inlines images as data URLs within the caps |
| `src/imageFetch.js` | Page fetch with the service worker fallback |
| `src/reader.html`, `src/reader.jsx` | Reader page entry, mounts `createReaderApp` from `client/src/ReaderRoot.jsx` |
| `src/extensionTrainingSource.js` | Training source backed by `chrome.storage.local`; slices with `shared/slice.js` |
| `src/storage.js` | Storage keys and helpers |
| `src/urlKey.js` | URL normalisation into storage keys |
| `src/sites.js` | Supported-host check |
| `vite.reader.config.js` | App build for the reader |
| `vite.scripts.config.js` | IIFE builds for `background.js` and `capture.js` |
