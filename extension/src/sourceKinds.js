// Human labels for the extractor's page kinds (payload.sourceKind) and the
// image inlining stats, shown in the library and the reader.
import { DEFAULT_LIMITS } from "./extractors/inlineImages.js";

const KIND_LABELS = {
  blob: "GitHub file",
  "repo-readme": "GitHub README",
  "folder-readme": "GitHub README",
  wiki: "GitHub wiki",
  issue: "GitHub issue",
  pr: "GitHub pull request",
  confluence: "Confluence page",
};

const GITHUB_KINDS = new Set(["blob", "repo-readme", "folder-readme", "wiki", "issue", "pr"]);

const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

// The site a training came from, for the library badge
export const siteOf = (sourceKind, sourceUrl) => {
  const host = hostOf(sourceUrl);
  if (GITHUB_KINDS.has(sourceKind) || host === "github.com") {
    return { id: "github", label: "GitHub" };
  }
  if (sourceKind === "confluence") {
    return { id: "confluence", label: "Confluence" };
  }
  if (host.endsWith(".atlassian.net")) {
    return { id: "atlassian", label: "Atlassian" };
  }
  return { id: "generic", label: "Web page" };
};

// "GitHub issue", "Confluence page"; a generic capture is named by its site
export const kindLabel = (sourceKind, sourceUrl) => {
  if (KIND_LABELS[sourceKind]) {
    return KIND_LABELS[sourceKind];
  }
  const site = siteOf(sourceKind, sourceUrl);
  return site.id === "generic" ? "Web page" : `${site.label} page`;
};

const megabytes = (bytes) => `${Math.round(bytes / (1024 * 1024))} MB`;

const REASON_LABELS = {
  "fetch-failed": () => "could not be fetched",
  "not-image": (count) => (count === 1 ? "was not an image" : "were not images"),
  "too-large": (count) =>
    `${count === 1 ? "was" : "were"} over the ${megabytes(DEFAULT_LIMITS.perImageBytes)} per-image limit`,
  "total-cap": () => `came after the ${megabytes(DEFAULT_LIMITS.totalBytes)} training limit`,
};

// Note for the reader when the capture left images as links:
// { text: "Images skipped: 3", detail: "2 could not be fetched; 1 was over the 2 MB per-image limit. ..." }
export const skippedImagesNote = (stats) => {
  const skipped = Number(stats?.skipped) || 0;
  if (skipped <= 0) {
    return null;
  }
  const detail = Object.entries(stats.reasons || {})
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => {
      const label = `${count} ${REASON_LABELS[reason]?.(count) || reason}`;
      return reason === "fetch-failed" && stats.firstError ? `${label} (first error: ${stats.firstError})` : label;
    })
    .join("; ");
  return {
    id: "images-skipped",
    text: `Images skipped: ${skipped}`,
    detail: detail
      ? `${detail}. Skipped images keep their original links, which may not load here.`
      : "Skipped images keep their original links, which may not load here.",
  };
};

// "2.4 MB", "830 KB", "0 KB"
export const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.round(value / 1024)} KB`;
};
