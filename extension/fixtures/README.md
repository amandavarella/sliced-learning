# Extractor fixtures

## GitHub

Rendered Markdown bodies captured from public GitHub pages on 2026-11-23, signed out, in headless Chromium after `networkidle`. Each file is the `outerHTML` of the element the phase 1 selector matched, unmodified. They feed the GitHub extractor tests in phase 5.

| File | Page kind | Source URL | Selector that matched |
|---|---|---|---|
| `github/blob-readme.html` | Markdown blob | https://github.com/mozilla/readability/blob/main/README.md | `article.markdown-body` |
| `github/repo-readme.html` | README on repo root | https://github.com/vitejs/vite | `article.markdown-body` |
| `github/folder-readme.html` | README on folder page | https://github.com/vitejs/vite/tree/main/packages/vite | `#readme article.markdown-body` |
| `github/wiki.html` | Wiki page (Markdown) | https://github.com/mrdoob/three.js/wiki/Migration-Guide | `#wiki-body .markdown-body` |
| `github/wiki-textile.html` | Wiki home page written in Textile | https://github.com/mrdoob/three.js/wiki | `#wiki-body .markdown-body` |
| `github/issue.html` | Issue description | https://github.com/vitejs/vite/issues/21954 | `[data-testid="issue-body"] [data-testid="markdown-body"]` |
| `github/pr.html` | Pull request description | https://github.com/vitejs/vite/pull/22981 | `[id^="pullrequest-"] .js-comment-body` |
| `github/blob-relative-img.html` | Blob with a repo-relative image | https://github.com/sindresorhus/awesome/blob/main/readme.md | `article.markdown-body` |
| `github/blob-mermaid.html` | Blob with Mermaid diagrams | https://github.com/mermaid-js/mermaid/blob/develop/README.md | `article.markdown-body` |

The issue fixture contains `private-user-images.githubusercontent.com` URLs with a signed JWT. They expired a few minutes after capture, which is the point: tests must not try to load them.

## Refreshing

Load each URL in a browser (or Playwright, headless Chromium), wait for network idle, then save `document.querySelector(<selector>).outerHTML` from the table above into the matching file. In the DevTools console:

```js
copy(document.querySelector('article.markdown-body').outerHTML)
```

Update the date above when you refresh, and only use public pages.

## Confluence Cloud

Hand-written on 2026-11-23, modelled on the export view HTML Confluence renders for macros (see "Phase 6 notes" in `docs/chrome-extension-plan.md` for which class names are confirmed in Atlassian documentation and which are not). Not captured from envato.atlassian.net or any other company page; every name, ticket and URL in them is made up, and the site is `mock.atlassian.net`. They feed `src/extractors/confluence.test.js` and the mock e2e (`scripts/e2e-confluence-mock.mjs`).

| File | Stands for | Contents |
|---|---|---|
| `confluence/export-view.html` | `body.export_view.value` of `GET /wiki/api/v2/pages/123?body-format=export_view` | Headings, paragraphs, a table in `div.table-wrap`, TOC macro, info and warning macros, expand macro, code macro with a title, two status lozenges, a Jira issue macro, two emoticons, two attachment images with `/wiki/download/...` URLs (one with a thumbnail `src`), about 600 words |
| `confluence/view.html` | `body.view.value`, for the v2 `body-format=view` retry | A heading, a paragraph and a list |
| `confluence/dom-page.html` | The rendered page, for the DOM fallback | Navigation, breadcrumbs, `h1[data-testid="title-text"]`, `[data-testid="page-content-only"]` with an `.ak-renderer-document` inside, a heading copy-link button and a comment block outside the body |

To replace them with real captures from a page you may share, run in DevTools on that page:

```js
const id = location.pathname.match(/pages\/(\d+)/)[1];
fetch(`/wiki/api/v2/pages/${id}?body-format=export_view`).then((r) => r.json()).then((j) => copy(j.body.export_view.value));
```

Only commit captures of pages that are fine to publish in this repository.
