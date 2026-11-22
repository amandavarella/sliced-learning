// GitHub extractor. Works on a live document (the capture script) and on a
// jsdom document (the fixture tests), so it only uses standard DOM APIs.
//
// The page kind comes from the URL path. Each kind then tries an ordered list
// of body selectors, recorded in "Phase 1 findings" in
// docs/chrome-extension-plan.md. A plain `.markdown-body` query is never used:
// wikis have a second one in the sidebar and issues nest two per comment.
import { fallbackTitle, firstHeading } from "./generic.js";

// Issue body selectors, also tried last on PR pages in case a signed-in user
// gets the React PR view. [Unverified] Signed out, PRs still use the classic
// timeline, so that fallback has not been seen working on a real page.
const ISSUE_BODY = [
  '[data-testid="issue-body"] [data-testid="markdown-body"]',
  "#issue-body-viewer .markdown-body",
];

export const BODY_SELECTORS = {
  blob: ["article.markdown-body"],
  "repo-readme": ["#readme article.markdown-body", "article.markdown-body"],
  "folder-readme": ["#readme article.markdown-body", "article.markdown-body"],
  wiki: ["#wiki-body .markdown-body", "#wiki-body"],
  issue: ISSUE_BODY,
  pr: ['[id^="pullrequest-"] .js-comment-body', ".js-discussion .js-comment-body", ...ISSUE_BODY],
};

// Paths under github.com/<owner>/<repo>/ that carry a page kind
const SECTION_KINDS = {
  blob: "blob",
  tree: "folder-readme",
  wiki: "wiki",
  issues: "issue",
  pull: "pr",
};

// Top-level github.com paths that look like <owner>/<repo> but are not repos
const RESERVED_OWNERS = new Set([
  "orgs",
  "settings",
  "marketplace",
  "notifications",
  "search",
  "explore",
  "topics",
  "collections",
  "sponsors",
  "features",
  "login",
  "pulls",
  "issues",
]);

export const detectGitHubKind = (url) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "github.com") {
    return null;
  }

  const [owner, repo, section, ...rest] = parsed.pathname.split("/").filter(Boolean);
  if (!owner || !repo || RESERVED_OWNERS.has(owner)) {
    return null;
  }
  if (!section) {
    return "repo-readme";
  }

  const kind = SECTION_KINDS[section];
  if (!kind) {
    return null;
  }
  // Issues and PRs need a number: /issues on its own is the list page
  if ((kind === "issue" || kind === "pr") && !/^\d+$/.test(rest[0] || "")) {
    return null;
  }
  return kind;
};

const hasContent = (node) => Boolean(node.textContent.trim() || node.querySelector("img"));

const pickBody = (document, kind) => {
  for (const selector of BODY_SELECTORS[kind]) {
    for (const node of document.querySelectorAll(selector)) {
      // The wiki sidebar is also a .markdown-body; never take it
      if (node.closest(".wiki-custom-sidebar") || !hasContent(node)) {
        continue;
      }
      return node;
    }
  }
  return null;
};

const textOf = (node) => node?.textContent?.replace(/\s+/g, " ").trim() || "";

// The PR header h1 holds the title in its first span and " - #N" in .sr-only
const prHeading = (document) => {
  const heading =
    document.querySelector("h1.gh-header-title") ||
    document.querySelector('h1[data-component="Heading"]') ||
    document.querySelector("h1");
  if (!heading) {
    return "";
  }
  const span = heading.querySelector(".js-issue-title, span");
  const clone = heading.cloneNode(true);
  for (const hidden of clone.querySelectorAll(".sr-only")) {
    hidden.remove();
  }
  return textOf(span) || textOf(clone).replace(/\s*#\d+\s*$/, "");
};

const lastPathSegment = (url) => {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    return "";
  }
};

const repoName = (url) => {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).slice(0, 2).join("/");
  } catch {
    return "";
  }
};

const TITLE_STRATEGIES = {
  blob: (document, body) => firstHeading(body) || textOf(document.querySelector("#file-name-id-wide")),
  "repo-readme": (document, body, url) => firstHeading(body) || repoName(url),
  "folder-readme": (document, body, url) =>
    firstHeading(body) || textOf(document.querySelector("#file-name-id-wide")) || lastPathSegment(url),
  wiki: (document, body) => textOf(document.querySelector("h1.gh-header-title")) || firstHeading(body),
  issue: (document) => textOf(document.querySelector('[data-testid="issue-title"]')),
  pr: (document) =>
    textOf(document.querySelector('[data-testid="issue-title"]')) || prHeading(document),
};

export const extractGitHub = (document, url) => {
  const kind = detectGitHubKind(url);
  if (!kind) {
    return null;
  }

  const bodyElement = pickBody(document, kind);
  if (!bodyElement) {
    return null;
  }

  const title = TITLE_STRATEGIES[kind](document, bodyElement, url) || fallbackTitle(document, url);
  return { kind, title, bodyElement };
};
