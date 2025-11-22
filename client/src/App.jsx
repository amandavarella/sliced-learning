import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderSegment, getTrainingDescription } from "./contentTypes/index.js";
import "./App.css";

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

  const activeSegment = useMemo(() => {
    if (!training) {
      return null;
    }
    return training.segments[activeIndex];
  }, [activeIndex, training]);

  const hydrateTraining = useCallback(
    (incomingTraining, sourceValue) => {
      if (!incomingTraining) {
        return;
      }

      const segments = Array.isArray(incomingTraining.segments)
        ? incomingTraining.segments
        : [];
      const normalizedCompleted = normalizeCompleted(
        segments,
        incomingTraining.progress?.completed,
      );
      const normalizedActiveIndex = clampActiveIndex(
        incomingTraining.progress?.activeIndex,
        segments.length,
      );

      const hydratedTraining = {
        ...incomingTraining,
        progress: {
          completed: normalizedCompleted,
          activeIndex: normalizedActiveIndex,
        },
      };

      hydratingRef.current = true;
      setTrainingState({
        training: hydratedTraining,
        activeIndex: normalizedActiveIndex,
        completed: normalizedCompleted,
      });

      if (sourceValue) {
        setUrl(sourceValue);
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

          hydrateTraining(payload, source);
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

          // When a segment parameter is provided, mark all previous segments as completed
          const existingCompleted = normalizeCompleted(
            payload.segments || [],
            payload.progress?.completed,
          );
          const completedWithProgress = existingCompleted.map((isCompleted, index) => {
            // Mark all segments before the requested segment as completed
            return index < validSegment ? true : isCompleted;
          });

          // Override the default activeIndex with the requested segment
          const modifiedPayload = {
            ...payload,
            progress: {
              ...payload.progress,
              completed: completedWithProgress,
              activeIndex: validSegment,
            },
          };

          hydrateTraining(modifiedPayload, trimmedSource);
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

  // Update document title and meta tags when training is loaded
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    if (training?.title) {
      // Update document title with course title
      document.title = training.title;

      // Update or create Open Graph meta tags for better sharing
      const updateMetaTag = (property, content) => {
        let meta = document.querySelector(`meta[property="${property}"]`);
        if (!meta) {
          meta = document.createElement("meta");
          meta.setAttribute("property", property);
          document.head.appendChild(meta);
        }
        meta.setAttribute("content", content);
      };

      const updateMetaName = (name, content) => {
        let meta = document.querySelector(`meta[name="${name}"]`);
        if (!meta) {
          meta = document.createElement("meta");
          meta.setAttribute("name", name);
          document.head.appendChild(meta);
        }
        meta.setAttribute("content", content);
      };

      // Set Open Graph title
      updateMetaTag("og:title", training.title);

      // Set Open Graph description
      const description = getTrainingDescription(training);
      updateMetaTag("og:description", description);

      // Set Open Graph URL
      if (training.sourceUrl) {
        const shareUrl = typeof window !== "undefined" 
          ? `${window.location.origin}${window.location.pathname}?source=${encodeURIComponent(training.sourceUrl)}&segment=${activeIndex}`
          : training.sourceUrl;
        updateMetaTag("og:url", shareUrl);
      }

      // Set Open Graph type
      updateMetaTag("og:type", "website");

      // Set Twitter Card meta tags
      updateMetaName("twitter:card", "summary");
      updateMetaName("twitter:title", training.title);
      updateMetaName("twitter:description", description);
    } else {
      // Reset to default title when no training is loaded
      document.title = "Vite + React";
    }
  }, [training, activeIndex]);

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
        {training ? (
          <div className="segment-view">
            <header className="segment-header">
              <div>
                <h2>{training.title}</h2>
                <p className="segment-meta">
                  {getTrainingDescription(training)}
                </p>
              </div>
              <span>
                Segment {activeIndex + 1} / {training.segments.length}
              </span>
            </header>
            <section className="segment-body">
              <h3>{activeSegment.label}</h3>
              {renderSegment(training.type, activeSegment, training)}
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
