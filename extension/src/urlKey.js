// Turns a page URL into the storage key for its training, so the same page
// reached by slightly different links reopens the same progress.
//
// - The hash is dropped everywhere (heading anchors, Confluence comment links).
// - GitHub: `?plain=1` (the source view of a Markdown file) is dropped.
// - Confluence Cloud: the title slug after the page id is dropped, because it
//   changes when the page is renamed while the id stays the same.
const CONFLUENCE_PAGE_PATH = /^(\/wiki\/spaces\/[^/]+\/pages\/\d+)(?:\/.*)?$/;

export const normaliseUrl = (value) => {
  const url = new URL(value);
  url.hash = "";

  if (url.hostname === "github.com" && url.searchParams.get("plain") === "1") {
    url.searchParams.delete("plain");
  }

  if (url.hostname.endsWith(".atlassian.net")) {
    const match = url.pathname.match(CONFLUENCE_PAGE_PATH);
    if (match) {
      url.pathname = match[1];
    }
  }

  return url.toString();
};
