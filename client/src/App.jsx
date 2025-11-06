import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { RichRenderer } from "./components/RichRenderer";

const DEFAULT_TITLE = "Sliced Learning";
const DEFAULT_DESCRIPTION = "Transform long-form content into digestible, trackable learning segments.";
const DEFAULT_FAVICON = "/vite.svg";

const upsertMetaTag = (attribute, name, content) => {
  if (typeof document === "undefined") {
    return;
  }
  if (!content) {
    const existing = document.head.querySelector(`meta[${attribute}='${name}']`);
    if (existing) {
      existing.remove();
    }
    return;
  }

  let tag = document.head.querySelector(`meta[${attribute}='${name}']`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
};

const updateFavicon = (href) => {
  if (typeof document === "undefined") {
    return;
  }
  const nextHref = href || DEFAULT_FAVICON;
  const rels = ["icon", "shortcut icon"];

  rels.forEach((rel) => {
    let link = document.head.querySelector(`link[rel='${rel}']`);
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = nextHref;
  });
};

const defaultState = {
  training: null,
  activeIndex: 0,
  completed: [],
};

const normalizeCompleted = (segments = [], completed = []) => {
  return segments.map((_, index) => Boolean(completed[index]));
};

const clampActiveIndex = (activeIndex = 0, segmentsLength = 0) => {
  if (!Number.isInteger(activeIndex)) {
    return 0;
  }
  if (!segmentsLength) {
    return 0;
  }
  return Math.min(Math.max(activeIndex, 0), Math.max(segmentsLength - 1, 0));
};

const arraysEqual = (left = [], right = []) => {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
};

const timeLabel = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

const PROGRESS_STORAGE_KEY = "sliced-progress";

const readProgressStorage = () => {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (storageError) {
    console.warn("Unable to parse stored progress", storageError);
  }

  return {};
};

const getStoredProgress = (source) => {
  if (!source) {
    return null;
  }

  const storage = readProgressStorage();
  const stored = storage[source];

  if (!stored || typeof stored !== "object") {
    return null;
  }

  const completed = Array.isArray(stored.completed)
    ? stored.completed.map(Boolean)
    : [];
  const activeIndex = Number.isInteger(stored.activeIndex)
    ? stored.activeIndex
    : 0;

  return {
    completed,
    activeIndex,
  };
};

const persistStoredProgress = (source, data) => {
  if (!source || typeof window === "undefined") {
    return;
  }

  const storage = readProgressStorage();
  const payload = {
    completed: Array.isArray(data.completed)
      ? data.completed.map(Boolean)
      : [],
    activeIndex: Number.isInteger(data.activeIndex)
      ? data.activeIndex
      : 0,
  };

  const nextStorage = {
    ...storage,
    [source]: payload,
  };

  try {
    window.localStorage.setItem(
      PROGRESS_STORAGE_KEY,
      JSON.stringify(nextStorage),
    );
  } catch (storageError) {
    console.warn("Unable to persist progress", storageError);
  }
};

const removeStoredProgress = (source) => {
  if (!source || typeof window === "undefined") {
    return;
  }

  const storage = readProgressStorage();

  if (!storage[source]) {
    return;
  }

  const { [source]: _, ...nextStorage } = storage;

  try {
    window.localStorage.setItem(
      PROGRESS_STORAGE_KEY,
      JSON.stringify(nextStorage),
    );
  } catch (storageError) {
    console.warn("Unable to remove stored progress", storageError);
  }
};

const renderArticle = (segment) => {
  // Prefer rich-text rendering if available
  if (segment?.richText && Array.isArray(segment.richText)) {
    return <RichRenderer nodes={segment.richText} />;
  }

  // Fallback to HTML rendering
  if (segment?.html) {
    return (
      <div
        className="prose prose-mediumReader mx-auto article-segment-content"
        dangerouslySetInnerHTML={{ __html: segment.html }}
      />
    );
  }

  // Fallback to plain text
  if (!segment?.text) {
    return null;
  }

  return (
    <div className="prose prose-mediumReader mx-auto">
      {segment.text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={`${segment.id}-paragraph-${index}`}>{paragraph}</p>
      ))}
    </div>
  );
};

const renderVideo = (segment, training) => {
  const videoId = training?.videoId;
  const startSeconds = Math.max(0, Math.floor(segment.startSeconds ?? 0));
  const rawEnd = segment.endSeconds ?? segment.startSeconds + segment.durationSeconds;
  const endSeconds = Math.max(startSeconds, Math.floor(rawEnd ?? startSeconds));

  const params = new URLSearchParams({
    autoplay: "0",
    rel: "0",
    modestbranding: "1",
    start: String(startSeconds),
  });

  if (endSeconds > startSeconds) {
    params.set("end", String(endSeconds));
  }

  const embedSrc = videoId
    ? `https://www.youtube.com/embed/${videoId}?${params.toString()}`
    : null;

  return (
    <div className="video-segment">
      {embedSrc ? (
        <div className="video-player">
          <iframe
            key={`${segment.id}-${startSeconds}`}
            src={embedSrc}
            title={training?.title || segment.label}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : (
        <p className="video-embed-fallback">
          Unable to load the embedded video. Open it directly on YouTube: {" "}
          <a href={training?.sourceUrl} target="_blank" rel="noreferrer">
            {training?.sourceUrl}
          </a>
        </p>
      )}
      <div className="video-segment-details">
        <div>
          <strong>Start:</strong> {segment.cue.start}
        </div>
        <div>
          <strong>End:</strong> {segment.cue.end}
        </div>
        <div>
          <strong>Duration:</strong> {timeLabel(segment.durationSeconds)}
        </div>
        <p className="video-segment-note">
          Watch this segment before advancing. Use the timestamps above to skip directly.
        </p>
      </div>
    </div>
  );
};

function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [{ training, activeIndex, completed }, setTrainingState] = useState(
    defaultState,
  );
  const [copyStatus, setCopyStatus] = useState("");
  const hydratingRef = useRef(false);
  const lastPersistRef = useRef(null);
  const lastLocalPersistRef = useRef(null);
  const shouldPersistLocalRef = useRef(true);

  const activeSegment = useMemo(() => {
    if (!training) {
      return null;
    }
    return training.segments[activeIndex];
  }, [activeIndex, training]);

  const hydrateTraining = useCallback(
    (incomingTraining, sourceValue, options = {}) => {
      const {
        preferIncomingActiveIndex = false,
        skipStoredProgress = false,
      } = options;

      shouldPersistLocalRef.current = !skipStoredProgress;

      if (!incomingTraining) {
        return;
      }

      const segments = Array.isArray(incomingTraining.segments)
        ? incomingTraining.segments
        : [];
      let normalizedCompleted = normalizeCompleted(
        segments,
        incomingTraining.progress?.completed,
      );
      let normalizedActiveIndex = clampActiveIndex(
        incomingTraining.progress?.activeIndex,
        segments.length,
      );

      const trimmedSource = typeof sourceValue === "string" ? sourceValue.trim() : "";
      const resolvedSourceUrl = (incomingTraining.sourceUrl || trimmedSource || "").trim();
      const storedProgress = skipStoredProgress || !resolvedSourceUrl
        ? null
        : getStoredProgress(resolvedSourceUrl);

      if (storedProgress) {
        normalizedCompleted = normalizeCompleted(segments, storedProgress.completed);

        if (!preferIncomingActiveIndex) {
          normalizedActiveIndex = clampActiveIndex(
            storedProgress.activeIndex,
            segments.length,
          );
        }
      }

      const hydratedTraining = {
        ...incomingTraining,
        progress: {
          completed: normalizedCompleted,
          activeIndex: normalizedActiveIndex,
        },
      };

      if (resolvedSourceUrl && !incomingTraining.sourceUrl) {
        hydratedTraining.sourceUrl = resolvedSourceUrl;
      }

      hydratingRef.current = true;
      setTrainingState({
        training: hydratedTraining,
        activeIndex: normalizedActiveIndex,
        completed: normalizedCompleted,
      });

      const nextUrlValue = trimmedSource || resolvedSourceUrl;
      if (nextUrlValue) {
        setUrl(nextUrlValue);
      }

      setCopyStatus("");
    },
    [setTrainingState, setUrl, setCopyStatus],
  );

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!url.trim()) {
      setError("Please paste a valid article or YouTube link.");
      return;
    }

    try {
      setError("");
      setLoading(true);
      const trimmedUrl = url.trim();
      const response = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: trimmedUrl }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Unexpected error");
      }

      const payload = await response.json();
      hydrateTraining(payload, trimmedUrl);
    } catch (requestError) {
      setTrainingState(defaultState);
      setError(requestError.message || "Unable to process the URL.");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (!training) {
      return;
    }

    setTrainingState((previous) => {
      if (!previous.training) {
        return previous;
      }

      const nextCompleted = [...previous.completed];
      nextCompleted[previous.activeIndex] = true;
      const isLast =
        previous.activeIndex === previous.training.segments.length - 1;
      const nextActiveIndex = isLast
        ? previous.activeIndex
        : previous.activeIndex + 1;

      const nextTraining = {
        ...previous.training,
        progress: {
          completed: nextCompleted,
          activeIndex: nextActiveIndex,
        },
      };

      return {
        ...previous,
        training: nextTraining,
        completed: nextCompleted,
        activeIndex: nextActiveIndex,
      };
    });
  };

  const handlePrevious = () => {
    if (!training) {
      return;
    }

    setTrainingState((previous) => {
      if (!previous.training) {
        return previous;
      }

      const nextActiveIndex = Math.max(previous.activeIndex - 1, 0);

      if (nextActiveIndex === previous.activeIndex) {
        return previous;
      }

      const nextTraining = {
        ...previous.training,
        progress: {
          ...(previous.training.progress ?? {
            completed: previous.completed,
          }),
          activeIndex: nextActiveIndex,
        },
      };

      return {
        ...previous,
        training: nextTraining,
        activeIndex: nextActiveIndex,
      };
    });
  };

  const handleSelectSegment = (index) => {
    if (!training) {
      return;
    }

    setTrainingState((previous) => ({
      ...previous,
      training: previous.training
        ? {
            ...previous.training,
            progress: {
              completed: previous.completed,
              activeIndex: index,
            },
          }
        : previous.training,
      activeIndex: index,
    }));
  };

  const handleReset = () => {
    if (training?.sourceUrl) {
      removeStoredProgress(training.sourceUrl);
    }

    lastLocalPersistRef.current = null;
    shouldPersistLocalRef.current = true;
    hydratingRef.current = false;
    setTrainingState(defaultState);
    setUrl("");
    setError("");
    setCopyStatus("");
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Parse URL parameters - support both query and hash forms
    const parseUrlParams = () => {
      if (window.location.hash.includes("?")) {
        return new URLSearchParams(window.location.hash.split("?")[1]);
      }
      return new URLSearchParams(window.location.search);
    };

    const params = parseUrlParams();

    // NEW FORMAT: source and segment parameters (deployment-agnostic)
    const source = params.get("source");
    const segmentParam = params.get("segment");

    // OLD FORMAT: share ID for backward compatibility
    const shareId = params.get("share");

    // Backward compatibility: migrate old share= format to new format
    if (shareId && source) {
      const migrateOldShareUrl = async () => {
        try {
          setError("");
          setLoading(true);
          const response = await fetch(
            `/api/training/${shareId}?source=${encodeURIComponent(source)}`,
          );

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || "Unable to load the shared training.");
          }

          const payload = await response.json();

          // Extract current segment from the loaded data
          const currentSegment = payload.progress?.activeIndex ?? 0;

          // Redirect to new format
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete("share");
          nextUrl.searchParams.set("source", source);
          nextUrl.searchParams.set("segment", String(currentSegment));
          window.history.replaceState({}, "", nextUrl.toString());

          hydrateTraining(payload, source, {
            preferIncomingActiveIndex: true,
            skipStoredProgress: true,
          });
        } catch (shareError) {
          setTrainingState(defaultState);
          setError(shareError.message || "Unable to load the shared training.");
        } finally {
          setLoading(false);
        }
      };

      migrateOldShareUrl();
      return;
    }

    // NEW FORMAT: Process source and jump to segment
    if (source) {
      const processSharedContent = async () => {
        try {
          setError("");
          setLoading(true);
          const trimmedSource = source.trim();
          const response = await fetch("/api/process", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: trimmedSource }),
          });

          if (!response.ok) {
            const payload = await response.json();
            throw new Error(payload.error || "Unexpected error");
          }

          const payload = await response.json();

          // Parse and validate segment parameter
          const requestedSegment = segmentParam ? Math.max(0, Number(segmentParam) || 0) : 0;
          const totalSegments = payload.segments?.length || 0;
          const validSegment = Math.min(requestedSegment, Math.max(0, totalSegments - 1));

          // Override the default activeIndex with the requested segment
          const modifiedPayload = {
            ...payload,
            progress: {
              ...payload.progress,
              activeIndex: validSegment,
            },
          };

          hydrateTraining(modifiedPayload, trimmedSource, {
            preferIncomingActiveIndex: segmentParam !== null,
          });
        } catch (processError) {
          setTrainingState(defaultState);
          setError(processError.message || "Unable to process the URL.");
        } finally {
          setLoading(false);
        }
      };

      processSharedContent();
    }
  }, [hydrateTraining]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextUrl = new URL(window.location.href);

    // Use new format: source and segment only (no shareId)
    if (training?.sourceUrl) {
      nextUrl.searchParams.set("source", training.sourceUrl);
      nextUrl.searchParams.set("segment", String(activeIndex));
      // Clean up old format params
      nextUrl.searchParams.delete("share");
    } else {
      nextUrl.searchParams.delete("share");
      nextUrl.searchParams.delete("source");
      nextUrl.searchParams.delete("segment");
    }

    window.history.replaceState({}, "", nextUrl.toString());
  }, [training, activeIndex]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const currentSource = training?.sourceUrl?.trim();

    if (!currentSource) {
      lastLocalPersistRef.current = null;
      return;
    }

    if (!shouldPersistLocalRef.current) {
      lastLocalPersistRef.current = null;
      return;
    }

    if (hydratingRef.current) {
      hydratingRef.current = false;
      return;
    }

    const previous = lastLocalPersistRef.current;

    if (
      previous &&
      previous.source === currentSource &&
      previous.activeIndex === activeIndex &&
      arraysEqual(previous.completed, completed)
    ) {
      return;
    }

    const payload = {
      completed: [...completed],
      activeIndex,
    };

    persistStoredProgress(currentSource, payload);
    lastLocalPersistRef.current = {
      source: currentSource,
      completed: payload.completed,
      activeIndex: payload.activeIndex,
    };
  }, [training, completed, activeIndex]);

  useEffect(() => {
    // Keep persistence logic only if shareId exists (backward compatibility)
    // New format doesn't require server-side persistence - progress is in URL
    if (!training?.shareId || !training?.sourceUrl) {
      lastPersistRef.current = null;
      return;
    }

    if (hydratingRef.current) {
      hydratingRef.current = false;
      lastPersistRef.current = {
        shareId: training.shareId,
        completed,
        activeIndex,
      };
      return;
    }

    const previous = lastPersistRef.current;

    if (
      previous &&
      previous.shareId === training.shareId &&
      previous.activeIndex === activeIndex &&
      arraysEqual(previous.completed, completed)
    ) {
      return;
    }

    const persist = async () => {
      try {
        lastPersistRef.current = {
          shareId: training.shareId,
          completed,
          activeIndex,
        };

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
      } catch (persistError) {
        console.error("Unable to save progress", persistError);
      }
    };

    persist();
  }, [activeIndex, completed, training]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const metaSource = training?.meta || null;
    const baseTitle = metaSource?.title || training?.title || DEFAULT_TITLE;
    const finalTitle = baseTitle === DEFAULT_TITLE
      ? DEFAULT_TITLE
      : `${baseTitle} | Sliced Learning`;

    document.title = finalTitle;

    const description = metaSource?.description || DEFAULT_DESCRIPTION;
    const canonicalUrl = metaSource?.url || training?.sourceUrl || (typeof window !== "undefined" ? window.location.href : undefined);
    const ogImage = metaSource?.ogImage || null;
    const favicon = metaSource?.favicon || DEFAULT_FAVICON;
    const socialTitle = metaSource?.title || baseTitle;

    upsertMetaTag("name", "description", description);
    upsertMetaTag("property", "og:title", socialTitle);
    upsertMetaTag("property", "og:description", description);
    upsertMetaTag("property", "og:url", canonicalUrl);
    upsertMetaTag("property", "og:image", ogImage);
    upsertMetaTag("name", "twitter:title", socialTitle);
    upsertMetaTag("name", "twitter:description", description);
    upsertMetaTag("name", "twitter:image", ogImage);
    upsertMetaTag("name", "twitter:card", ogImage ? "summary_large_image" : "summary");

    updateFavicon(favicon);
  }, [training?.meta, training?.title, training?.sourceUrl]);

  const shareLink = useMemo(() => {
    if (!training?.sourceUrl) {
      return "";
    }

    if (typeof window === "undefined") {
      return "";
    }

    // Build deployment-agnostic share link with source and segment only
    const base = `${window.location.origin}${window.location.pathname}`;
    const params = new URLSearchParams({
      source: training.sourceUrl,
      segment: String(activeIndex),
    });

    return `${base}?${params.toString()}`;
  }, [training, activeIndex]);

  useEffect(() => {
    if (!copyStatus) {
      return undefined;
    }

    const timerId = setTimeout(() => setCopyStatus(""), 2000);
    return () => clearTimeout(timerId);
  }, [copyStatus]);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareLink) {
      return;
    }

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(shareLink);
      } else if (
        typeof window !== "undefined" &&
        typeof window.prompt === "function"
      ) {
        window.prompt("Copy this link", shareLink);
      }
      setCopyStatus("Link copied");
    } catch (copyError) {
      console.error("Unable to copy share link", copyError);
      setCopyStatus("Unable to copy link");
    }
  }, [shareLink]);

  const progress = useMemo(() => {
    if (!training) {
      return 0;
    }
    const completedCount = completed.filter(Boolean).length;
    if (!training.segments.length) {
      return 0;
    }
    return Math.round((completedCount / training.segments.length) * 100);
  }, [completed, training]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Sliced Learning</h1>
        <form className="input-form" onSubmit={handleSubmit}>
          <label htmlFor="url-input">Paste an article or YouTube link</label>
          <div className="field-row">
            <input
              id="url-input"
              name="url"
              placeholder="https://..."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="button-spinner" aria-hidden="true" />
                  <span className="visually-hidden">Processing</span>
                </>
              ) : (
                "Slice"
              )}
            </button>
          </div>
        </form>
        {error && <p className="error-message">{error}</p>}
        {training && (
          <div className="progress-panel">
            <div className="progress-header">
              <h2>Progress</h2>
              {shareLink ? (
                <div className="progress-actions">
                  <button
                    type="button"
                    className="copy-link-button"
                    onClick={handleCopyShareLink}
                    aria-label="Copy share link"
                    title="Copy share link"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M16 1H4a3 3 0 0 0-3 3v12h2V4a1 1 0 0 1 1-1h12z" />
                      <path d="M20 5H8a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3zm1 15a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1z" />
                    </svg>
                  </button>
                  <span>{progress}%</span>
                </div>
              ) : (
                <span>{progress}%</span>
              )}
            </div>
            {copyStatus && shareLink && (
              <p className="copy-feedback">{copyStatus}</p>
            )}
            <div className="progress-bar">
              <div className="progress-value" style={{ width: `${progress}%` }} />
            </div>
            <ul className="segments-list">
              {training.segments.map((segment, index) => {
                const status = completed[index]
                  ? "completed"
                  : index === activeIndex
                  ? "active"
                  : "pending";
                return (
                  <li
                    key={segment.id}
                    className={`segment-item ${status}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectSegment(index)}
                      className="segment-trigger"
                    >
                      <span>{segment.label}</span>
                      {completed[index] && <span className="segment-check">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button className="reset-button" type="button" onClick={handleReset}>
              Start over
            </button>
          </div>
        )}
      </aside>

      <main className="content">
        {training && activeSegment ? (
          training.type === "article" ? (
            /* Article: white reading surface with Medium-style layout */
            <div className="w-full max-w-5xl mx-auto my-6">
              <div className="bg-white text-slate-900 rounded-2xl shadow-sm px-6 sm:px-12 py-10">
                <header className="max-w-[72ch] mx-auto mb-8">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <h1 className="font-sans font-extrabold tracking-tight leading-tight text-3xl sm:text-4xl">
                      {training.title}
                    </h1>
                    <span className="text-sm text-slate-500 whitespace-nowrap mt-2">
                      Segment {activeIndex + 1} / {training.segments.length}
                    </span>
                  </div>
                  <p className="text-slate-600 font-sans text-sm">
                    Article · {training.segments.length} sections · ~{training.segmentMinutes} minutes each
                  </p>
                </header>
                <section key={activeSegment.id || activeIndex} className="max-w-[72ch] mx-auto mb-8">
                  <h2 className="font-sans font-bold text-xl mb-6 text-slate-900">{activeSegment.label}</h2>
                  {renderArticle(activeSegment)}
                </section>
                <footer className="max-w-[72ch] mx-auto flex justify-end gap-3 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handlePrevious}
                    disabled={!training.segments.length || activeIndex === 0}
                    className="px-5 py-2.5 rounded-lg border border-gray-300 bg-white text-slate-700 font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={
                      training.segments.length === 0 ||
                      (activeIndex === training.segments.length - 1 &&
                        completed[activeIndex])
                    }
                    className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {activeIndex === training.segments.length - 1
                      ? completed[activeIndex]
                        ? "Completed"
                        : "Finish segment"
                      : "Next"}
                  </button>
                </footer>
              </div>
            </div>
          ) : (
            /* Video: keep original dark card style */
            <div className="segment-view">
              <header className="segment-header">
                <div>
                  <h2>{training.title}</h2>
                  <p className="segment-meta">
                    Video · {training.segments.length} segments · {training.segmentMinutes} minutes each
                  </p>
                </div>
                <span>
                  Segment {activeIndex + 1} / {training.segments.length}
                </span>
              </header>
              <section key={activeSegment.id || activeIndex} className="segment-body">
                <h3>{activeSegment.label}</h3>
                {renderVideo(activeSegment, training)}
              </section>
              <footer className="segment-footer">
                <button
                  type="button"
                  onClick={handlePrevious}
                  disabled={!training.segments.length || activeIndex === 0}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={
                    training.segments.length === 0 ||
                    (activeIndex === training.segments.length - 1 &&
                      completed[activeIndex])
                  }
                >
                  {activeIndex === training.segments.length - 1
                    ? completed[activeIndex]
                      ? "Completed"
                      : "Finish segment"
                    : "Next"}
                </button>
              </footer>
            </div>
          )
        ) : (
          <div className="placeholder">
            <h2>Create your first training</h2>
            <p>
              Paste a link to a long-form article or a YouTube video and we will
              slice it into bite-sized learning modules. Track your progress on
              the left as you move through each segment.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
