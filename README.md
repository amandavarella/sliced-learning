# Sliced Learning

Sliced Learning turns long content into short, timed training segments you can work through and track. Use the web app for public articles and YouTube videos, or the Chrome extension for GitHub and Confluence Cloud pages you are signed into.

- **server/**: Express API that processes articles and YouTube videos into learning segments
- **client/**: React interface with embedded video players, rich article rendering and shareable progress tracking
- **extension/**: Chrome extension that slices GitHub and Confluence pages inside the browser
- **shared/**: the slicing core used by both the server and the extension

## Web app

### Getting started

Open two terminals and run the following commands from the project root:

```bash
cd server
npm install
npm run dev
```

```bash
cd client
npm install
npm run dev
```

The client dev server proxies `/api` calls to `http://localhost:4000`, so start the backend first. Visit `http://localhost:5173` to load the UI.

> **Note:** The server fetches external content. Provide valid URLs and ensure outbound network access is allowed in your environment.

### Features

1. **Submit content**: paste an article or YouTube URL into the interface.
2. **Processing**: the backend segments the content by type.
   - **Articles** keep their HTML formatting and are split into segments of about 400 words (2 minutes of reading). Images, code blocks, lists and other formatting come through.
   - **YouTube videos** are split into 10-minute segments, each with an embedded player that starts and stops at the segment's timestamps.
3. **Learn**: move through the segments with a progress bar and per-segment completion status, in a layout built for focused reading.
4. **Share progress**: your position is kept in the page URL, so a share link reopens the training at the same segment, on another device or for someone else.

### Testing

The server has automated tests for article processing (`cd server && npm test`). Check the rest by hand:

- **Articles**: try long-form articles to confirm HTML is preserved and segments are about 400 words. Check images, code blocks, lists and blockquotes, and the layout with different content types.
- **Videos**: try several YouTube links to confirm 10-minute segments, playback with start and end timestamps, and the fallback for videos that cannot be processed.
- **Progress**: confirm a share link opens the training at the shared segment, and that a finished training stays finished after a reload.

### Folder scripts

- `server`: `npm run dev` (nodemon) and `npm start` for production.
- `client`: `npm run dev` for Vite, `npm run build` to create a production bundle.

## Chrome extension

### What it does

The server fetches pages without your cookies, so pages behind GitHub SSO or an Atlassian login come back as a sign-in page. The extension reads those pages from your signed-in tab instead. It slices them fully in the browser and keeps the trainings and progress in `chrome.storage.local`. Nothing is sent to the Sliced Learning server, and there are no share links.

Supported pages:

- **GitHub** (`github.com`): rendered Markdown files, README on a repo or folder page, wiki pages, and issue and pull request descriptions (the first body only, without comments or review threads).
- **Confluence Cloud**: pages on any `*.atlassian.net` site, in the `/wiki/spaces/<SPACE>/pages/<pageId>/<slug>` or `/wiki/pages/viewpage.action?pageId=<pageId>` form.

On any other page the toolbar button opens the reader with a message naming the supported sites. Public articles and YouTube videos stay with the web app.

### Install

```bash
cd extension
npm install
npm run build
```

Then load the build into Chrome (version 116 or later):

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick `extension/dist`.
4. After a rebuild, press the reload icon on the extension card.

### Use

1. Open a supported page and click the Sliced Learning toolbar icon.
2. The reader opens in an extension tab and slices the page there.
3. Open the **Library** (the brand button in the reader, or the "Back to your library" link) to see every stored training with its progress, open one, or delete it.
4. Click the icon again on a page that already has a training and the reader shows a banner: **Continue** keeps the saved training and its progress, **Re-slice** replaces it with the fresh capture and resets progress.

Progress is kept in this browser profile only.

### Permissions

- `activeTab`: lets the extension read the current page, and only after you click the toolbar icon.
- `scripting`: injects the capture script into that tab to extract and clean the page.
- `storage`: keeps trainings and progress in `chrome.storage.local`.
- `unlimitedStorage`: images are inlined into each training, so image-heavy pages take space; this stops Chrome from capping the store.
- Host permission `https://*.githubusercontent.com/*`: some GitHub image hosts send no CORS headers, so the page cannot read them. The service worker fetches those images instead.

There is no host permission for github.com or Confluence. Confluence API calls are same-origin requests from the page with your normal login.

### Develop and test

Run these in `extension/`:

- `npm run build`: builds the reader, service worker and capture script into `extension/dist`.
- `npm test`: extractor, cleaning and image inlining tests with `node --test` and jsdom, against saved GitHub and Confluence fixtures.
- `npm run e2e:github`: captures one public page of each GitHub kind in Chromium with Playwright. Needs network access to github.com.
- `npm run e2e:confluence`: captures pages from a local mock Confluence site in Chromium with Playwright. Needs no network.

Playwright is not a dependency of the package; the browser tests need an existing install. See [extension/README.md](extension/README.md) for the full guide: supported page kinds, Confluence capture routes and macro handling, image limits, the storage layout, the smoke test and the source layout. The design, decisions and what is still unchecked by hand are in [docs/chrome-extension-plan.md](docs/chrome-extension-plan.md).

## Shared slicing core

`shared/` holds the segmentation and sanitising code. The server imports it to slice articles, and the extension uses it to slice captured pages in the browser, so both produce trainings of the same shape. Each of `shared/`, `server/` and `extension/` runs its own tests with `npm test`.
