# Sliced Learning Chrome extension

Slices GitHub and Confluence Cloud pages into training segments inside your browser. Click the toolbar button on a supported page: the extension reads the rendered page from the logged-in tab, opens the Sliced Learning reader in a new tab, and slices the page there. The text and your progress stay in this Chrome profile (`chrome.storage.local`). Nothing is sent to the Sliced Learning server.

Supported hosts: `github.com` and `envato.atlassian.net`. On any other page the button opens the reader with a short "unsupported page" message.

Status: phase 4 of [the plan](../docs/chrome-extension-plan.md). Capture is generic for now (the first of `article.markdown-body`, `main`, `body`, minus GitHub heading anchors and copy buttons). Site-specific GitHub and Confluence extractors arrive in phases 5 and 6.

## Build

```bash
cd extension
npm install
npm run build
```

The build writes `extension/dist/`:

- `reader.html` and `assets/`: the reader page, which bundles the React client from `client/src` with this package's React.
- `background.js`: the service worker.
- `capture.js`: the script injected into the page on a click. It is a classic script with no imports.
- `manifest.json` and `icons/`, copied from `src/`.

`npm run icons` regenerates the placeholder icons in `src/icons/`.

## Load unpacked

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick `extension/dist`.
4. After a rebuild, press the reload icon on the extension card.

The manifest asks for `activeTab`, `scripting`, `storage` and `unlimitedStorage`, with no host permissions. The page is only read when you click the button.

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

Set `HEADED=1` to watch it and `SMOKE_URL` to capture another page. Playwright cannot click the toolbar button, and a click driven from the service worker does not grant `activeTab`, so the script loads a temporary copy of `dist/` whose manifest adds host access to `https://github.com/*`. The build in `dist/` is not changed.

## Storage layout

All data lives in `chrome.storage.local`. `<key>` is the page URL normalised by `src/urlKey.js`: hash removed, GitHub `?plain=1` removed, and the Confluence title slug after the page id removed.

| Key | Value | Written by | Removed |
|---|---|---|---|
| `capture:<key>` | `{ title, html, sourceUrl, capturedAt }` | service worker, on each click | by the reader once it slices the capture |
| `training:<key>` | `{ payload, progress, capturedAt }` | reader, after slicing; progress on every move | not yet (phase 7 adds a library with delete) |

`payload` has the shape the server returns from `POST /api/process` (`type`, `title`, `sourceUrl`, `segmentMinutes`, `totalSegments`, `totalWords`, `segments[]`). `progress` is `{ completed: boolean[], activeIndex }`.

When `training:<key>` already exists, the reader opens it with its progress and leaves the fresh capture alone. `reader.html?key=<key>&reslice=1` slices the latest capture again; phase 7 adds a button for it.

## Source layout

| File | Role |
|---|---|
| `src/manifest.json` | Manifest V3 |
| `src/background.js` | Toolbar click: site check, capture, store, open or focus the reader |
| `src/capture.js` | Injected capture of title and body HTML |
| `src/reader.html`, `src/reader.jsx` | Reader page entry, mounts `createReaderApp` from `client/src/ReaderRoot.jsx` |
| `src/extensionTrainingSource.js` | Training source backed by `chrome.storage.local`; slices with `shared/slice.js` |
| `src/storage.js` | Storage keys and helpers |
| `src/urlKey.js` | URL normalisation into storage keys |
| `src/sites.js` | Supported-host check |
| `vite.reader.config.js` | App build for the reader |
| `vite.scripts.config.js` | IIFE builds for `background.js` and `capture.js` |
