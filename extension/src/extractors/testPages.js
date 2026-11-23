// Test helper, not part of the extension bundle. Builds jsdom documents from
// the fixtures in extension/fixtures/github/.
//
// The fixtures are the outerHTML of the matched body only (see
// extension/fixtures/README.md), so selectors that depend on the surrounding
// page (#readme, #wiki-body, [data-testid="issue-body"], the PR timeline, the
// file name and title headings) would find nothing. Each page below wraps its
// fixture in a minimal skeleton with just those parts, copied from the live
// page structure recorded in docs/chrome-extension-plan.md. Some skeletons
// also add decoys (the wiki sidebar, a comment after the description) to
// check the extractor skips them.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const fixture = (name) =>
  readFileSync(new URL(`../../fixtures/github/${name}`, import.meta.url), "utf8");

const COMMENT_DECOY = `<div class="markdown-body"><p>A comment, not the description.</p></div>`;

export const PAGES = [
  {
    fixture: "blob-readme.html",
    url: "https://github.com/mozilla/readability/blob/main/README.md",
    pageTitle: "readability/README.md at main · mozilla/readability · GitHub",
    wrap: (html) => `<h1 id="file-name-id-wide">README.md</h1>${html}`,
    kind: "blob",
    title: "Readability.js",
  },
  {
    fixture: "blob-relative-img.html",
    url: "https://github.com/sindresorhus/awesome/blob/main/readme.md",
    pageTitle: "awesome/readme.md at main · sindresorhus/awesome · GitHub",
    wrap: (html) => `<h1 id="file-name-id-wide">readme.md</h1>${html}`,
    kind: "blob",
    // No h1 in this README, so the file name heading is used
    title: "readme.md",
  },
  {
    fixture: "blob-mermaid.html",
    url: "https://github.com/mermaid-js/mermaid/blob/develop/README.md",
    pageTitle: "mermaid/README.md at develop · mermaid-js/mermaid · GitHub",
    wrap: (html) => `<h1 id="file-name-id-wide">README.md</h1>${html}`,
    kind: "blob",
    title: "Mermaid",
  },
  {
    fixture: "repo-readme.html",
    url: "https://github.com/vitejs/vite",
    pageTitle: "GitHub - vitejs/vite: Next generation frontend tooling. It's fast!",
    wrap: (html) => `<div id="readme">${html}</div>`,
    kind: "repo-readme",
    title: "Vite ⚡",
  },
  {
    fixture: "folder-readme.html",
    url: "https://github.com/vitejs/vite/tree/main/packages/vite",
    pageTitle: "vite/packages/vite at main · vitejs/vite · GitHub",
    // A decoy article before #readme checks that #readme wins on folder pages
    wrap: (html) =>
      `<h1 id="file-name-id-wide">vite</h1><article class="markdown-body"><p>Decoy</p></article><div id="readme">${html}</div>`,
    kind: "folder-readme",
    title: "Vite ⚡",
  },
  {
    fixture: "wiki.html",
    url: "https://github.com/mrdoob/three.js/wiki/Migration-Guide",
    pageTitle: "Migration Guide · mrdoob/three.js Wiki · GitHub",
    wrap: (html) =>
      `<h1 class="gh-header-title">Migration Guide</h1><div id="wiki-body">${html}</div>` +
      `<div class="wiki-custom-sidebar markdown-body"><p>Sidebar</p></div>`,
    kind: "wiki",
    title: "Migration Guide",
  },
  {
    fixture: "wiki-textile.html",
    url: "https://github.com/mrdoob/three.js/wiki",
    pageTitle: "Home · mrdoob/three.js Wiki · GitHub",
    wrap: (html) =>
      `<h1 class="gh-header-title">Home</h1><div id="wiki-body" class="gollum-textile-content">${html}</div>`,
    kind: "wiki",
    title: "Home",
  },
  {
    fixture: "issue.html",
    url: "https://github.com/vitejs/vite/issues/21954",
    pageTitle: "Issue #21954 · vitejs/vite · GitHub",
    wrap: (html) =>
      `<h1><bdi data-testid="issue-title">\`backdrop-filter\` before \`-webkit-backdrop-filter\` is dropped</bdi> <span>#21954</span></h1>` +
      `<div data-testid="issue-body">${html}</div>` +
      `<div data-testid="comment-body"><div data-testid="markdown-body" class="markdown-body">${COMMENT_DECOY}</div></div>`,
    kind: "issue",
    title: "`backdrop-filter` before `-webkit-backdrop-filter` is dropped",
  },
  {
    fixture: "pr.html",
    url: "https://github.com/vitejs/vite/pull/22981",
    pageTitle: "feat(client): add copy error button to overlay (#22980) by RajX-dev · Pull Request #22981 · vitejs/vite · GitHub",
    // The header h1 is the React one seen live; the timeline is classic
    wrap: (html) =>
      `<h1 data-component="Heading"><span class="f1">feat(client): add copy error button to overlay (#22980)</span><span class="sr-only"> - #22981</span></h1>` +
      `<div class="js-discussion"><div id="pullrequest-4084739965"><task-lists>${html}</task-lists></div>` +
      `<div id="issuecomment-1"><div class="comment-body markdown-body js-comment-body"><p>A comment</p></div></div></div>`,
    kind: "pr",
    title: "feat(client): add copy error button to overlay (#22980)",
  },
];

export const makeDocument = ({ url, pageTitle = "", head = "", body }) =>
  new JSDOM(
    `<!doctype html><html><head><title>${pageTitle}</title>${head}</head><body>${body}</body></html>`,
    { url },
  ).window.document;

export const pageDocument = (page) =>
  makeDocument({ url: page.url, pageTitle: page.pageTitle, body: page.wrap(fixture(page.fixture)) });

export const readFixture = fixture;
