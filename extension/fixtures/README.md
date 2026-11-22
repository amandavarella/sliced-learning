# Extractor fixtures

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
