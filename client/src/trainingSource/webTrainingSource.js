// Training source for the web app: talks to the Express API and keeps the
// reader's position in the page URL (?source=&segment=&done=) so a link can be
// shared or reopened on another device.

// The segment param only marks earlier segments done, so a finished
// training also carries done=1 to keep the last segment completed
const DONE_PARAM = "done";

const isTrainingFinished = (completed = []) => {
  return completed.length > 0 && completed.every(Boolean);
};

const normalizeCompleted = (segments = [], completed = []) => {
  return segments.map((_, index) => Boolean(completed[index]));
};

const hasWindow = () => typeof window !== "undefined";

// Support both query and hash forms of the URL parameters
const readUrlParams = () => {
  if (window.location.hash.includes("?")) {
    return new URLSearchParams(window.location.hash.split("?")[1]);
  }
  return new URLSearchParams(window.location.search);
};

const processUrl = async (url) => {
  const response = await fetch("/api/process", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "Unexpected error");
  }

  return response.json();
};

// Old share=<id>&source=<url> links: load the stored training, then rewrite
// the address bar to the newer source/segment form
const loadLegacyShare = async (shareId, source) => {
  const response = await fetch(
    `/api/training/${shareId}?source=${encodeURIComponent(source)}`,
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to load the shared training.");
  }

  const payload = await response.json();
  const currentSegment = payload.progress?.activeIndex ?? 0;

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete("share");
  nextUrl.searchParams.set("source", source);
  nextUrl.searchParams.set("segment", String(currentSegment));
  window.history.replaceState({}, "", nextUrl.toString());

  return payload;
};

// source/segment links: slice the source again and mark every segment before
// the requested one (or all of them, with done=1) as completed
const loadFromSource = async (source, segment, done) => {
  const payload = await processUrl(source);

  const requestedSegment = segment ? Math.max(0, Number(segment) || 0) : 0;
  const totalSegments = payload.segments?.length || 0;
  const validSegment = Math.min(requestedSegment, Math.max(0, totalSegments - 1));

  const existingCompleted = normalizeCompleted(
    payload.segments || [],
    payload.progress?.completed,
  );
  const completedWithProgress = existingCompleted.map((isCompleted, index) => {
    return done || index < validSegment ? true : isCompleted;
  });

  return {
    ...payload,
    progress: {
      ...payload.progress,
      completed: completedWithProgress,
      activeIndex: validSegment,
    },
  };
};

const buildShareLink = (training, { activeIndex = 0, completed = [] } = {}) => {
  if (!training?.sourceUrl || !hasWindow()) {
    return "";
  }

  const base = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams({
    source: training.sourceUrl,
    segment: String(activeIndex),
  });
  if (isTrainingFinished(completed)) {
    params.set(DONE_PARAM, "1");
  }

  return `${base}?${params.toString()}`;
};

export const webTrainingSource = {
  capabilities: {
    urlInput: true,
    examples: true,
    shareLinks: true,
    openOriginal: false,
  },

  process: (url) => processUrl(url),

  readInitialRequest() {
    if (!hasWindow()) {
      return null;
    }

    const params = readUrlParams();
    const source = params.get("source");
    if (!source) {
      return null;
    }

    return {
      source: source.trim(),
      shareId: params.get("share"),
      segment: params.get("segment"),
      done: params.get(DONE_PARAM) === "1",
    };
  },

  load({ shareId, source, segment, done }) {
    if (shareId) {
      return loadLegacyShare(shareId, source);
    }
    return loadFromSource(source, segment, done);
  },

  async saveProgress(training, { completed, activeIndex }) {
    // Only trainings stored by the server can be updated
    if (!training?.shareId || !training?.sourceUrl) {
      return;
    }

    await fetch(
      `/api/training/${training.shareId}/progress?source=${encodeURIComponent(training.sourceUrl)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          completed,
          activeIndex,
        }),
      },
    );
  },

  buildShareLink,

  syncLocation(training, { activeIndex, completed }) {
    if (!hasWindow()) {
      return;
    }

    const nextUrl = new URL(window.location.href);

    if (training?.sourceUrl) {
      nextUrl.searchParams.set("source", training.sourceUrl);
      nextUrl.searchParams.set("segment", String(activeIndex));
      if (isTrainingFinished(completed)) {
        nextUrl.searchParams.set(DONE_PARAM, "1");
      } else {
        nextUrl.searchParams.delete(DONE_PARAM);
      }
      nextUrl.searchParams.delete("share");
    } else {
      nextUrl.searchParams.delete("share");
      nextUrl.searchParams.delete("source");
      nextUrl.searchParams.delete("segment");
      nextUrl.searchParams.delete(DONE_PARAM);
    }

    window.history.replaceState({}, "", nextUrl.toString());
  },
};

export default webTrainingSource;
