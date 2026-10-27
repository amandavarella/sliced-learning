import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  renderSegment,
  getTrainingDescription,
  getContentTypeLabel,
} from "./contentTypes/index.js";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArticleIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  CopyIcon,
  FolderIcon,
  LinkIcon,
  LogoMark,
  PlusIcon,
  TrophyIcon,
  VideoIcon,
} from "./components/Icons.jsx";
import Confetti from "./components/Confetti.jsx";
import ReaderSettings from "./components/ReaderSettings.jsx";
import { useReaderSettings } from "./hooks/useReaderSettings.js";
import "./App.css";

const DEFAULT_TITLE = "Sliced Learning";

const EXAMPLES = [
  {
    label: "Paul Graham essay",
    url: "https://paulgraham.com/greatwork.html",
    type: "article",
  },
  {
    label: "Wikipedia article",
    url: "https://en.wikipedia.org/wiki/Spaced_repetition",
    type: "article",
  },
  {
    label: "Stanford commencement talk",
    url: "https://www.youtube.com/watch?v=UF8uR6Z6KLc",
    type: "video",
  },
];

const TYPE_ICONS = {
  article: ArticleIcon,
  video: VideoIcon,
  drive: FolderIcon,
};

const ContentTypeIcon = ({ type }) => {
  const Icon = TYPE_ICONS[type] ?? ArticleIcon;
  return <Icon />;
};

const isEditableTarget = (target) => {
  if (!target) {
    return false;
  }
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
};

const defaultState = {
  training: null,
  activeIndex: 0,
  completed: [],
};

const normalizeCompleted = (segments = [], completed = []) => {
  return segments.map((_, index) => Boolean(completed[index]));
};

const segmentDurationMinutes = (segment, fallbackMinutes) => {
  const estimated = Number(segment?.estimatedMinutes);
  if (Number.isFinite(estimated) && estimated >= 0) {
    return estimated;
  }
  const start = Number(segment?.startSeconds);
  const end = Number(segment?.endSeconds);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return (end - start) / 60;
  }
  return fallbackMinutes;
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
  const [segmentsOpen, setSegmentsOpen] = useState(false);
  const [confettiBurst, setConfettiBurst] = useState(0);
  const [readerSettings, updateReaderSettings] = useReaderSettings();
  const hydratingRef = useRef(false);
  const lastPersistRef = useRef(null);
  const segmentViewRef = useRef(null);
  const previousIndexRef = useRef(null);

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

  const processUrl = async (rawUrl) => {
    if (!rawUrl.trim()) {
      setError("Please paste a valid article, YouTube, or Google Drive folder link.");
      return;
    }

    try {
      setError("");
      setLoading(true);
      const trimmedUrl = rawUrl.trim();
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

  const handleSubmit = (event) => {
    event.preventDefault();
    processUrl(url);
  };

  const handleExample = (exampleUrl) => {
    setUrl(exampleUrl);
    processUrl(exampleUrl);
  };

  const handleNext = useCallback(() => {
    if (!training) {
      return;
    }

    // Celebrate only when this click marks the last unfinished segment done
    const finishesTraining =
      !completed[activeIndex] &&
      training.segments.every((_, index) => index === activeIndex || completed[index]);
    if (finishesTraining) {
      setConfettiBurst((count) => count + 1);
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
  }, [training, activeIndex, completed]);

  const handlePrevious = useCallback(() => {
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
  }, [training]);

  const handleSelectSegment = (index) => {
    setSegmentsOpen(false);
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
    setSegmentsOpen(false);
  };

  // Keyboard navigation: arrow keys move between segments
  useEffect(() => {
    if (!training) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      if (event.key === "ArrowRight") {
        handleNext();
      } else if (event.key === "ArrowLeft") {
        handlePrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [training, handleNext, handlePrevious]);

  // Bring the new segment into view when the learner moves between segments
  useEffect(() => {
    if (!training) {
      previousIndexRef.current = null;
      return;
    }

    const previousIndex = previousIndexRef.current;
    previousIndexRef.current = activeIndex;

    if (previousIndex === null || previousIndex === activeIndex) {
      return;
    }

    const node = segmentViewRef.current;
    if (node && node.getBoundingClientRect().top < 0) {
      const prefersReducedMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      node.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [training, activeIndex]);

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
      document.title = DEFAULT_TITLE;
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

  const copyLink = useCallback(async (link, successMessage) => {
    if (!link) {
      return;
    }

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(link);
      } else if (
        typeof window !== "undefined" &&
        typeof window.prompt === "function"
      ) {
        window.prompt("Copy this link", link);
      }
      setCopyStatus(successMessage);
    } catch (copyError) {
      console.error("Unable to copy link", copyError);
      setCopyStatus("Unable to copy link");
    }
  }, []);

  const handleCopyShareLink = useCallback(() => {
    copyLink(shareLink, "Link copied");
  }, [copyLink, shareLink]);

  const handleCopySourceLink = useCallback(() => {
    copyLink(training?.sourceUrl, "Original link copied");
  }, [copyLink, training]);

  const totalSegments = training?.segments.length ?? 0;
  const completedCount = completed.filter(Boolean).length;
  const allDone = totalSegments > 0 && completedCount === totalSegments;

  const progress = useMemo(() => {
    if (!totalSegments) {
      return 0;
    }
    return Math.round((completedCount / totalSegments) * 100);
  }, [completedCount, totalSegments]);

  const minutesLeft = useMemo(() => {
    if (!training?.segments.length) {
      return null;
    }
    const perSegment = Number(training.segmentMinutes);
    const fallbackMinutes =
      Number.isFinite(perSegment) && perSegment > 0 ? perSegment : null;

    // Count unread segments from the reader's position onwards, using each
    // segment's own length so the estimate moves with every step
    let total = 0;
    for (let index = activeIndex; index < training.segments.length; index += 1) {
      if (completed[index]) {
        continue;
      }
      const minutes = segmentDurationMinutes(training.segments[index], fallbackMinutes);
      if (minutes === null) {
        return null;
      }
      total += minutes;
    }
    return Math.round(total);
  }, [training, activeIndex, completed]);

  const urlForm = (
    <form className="input-form" onSubmit={handleSubmit}>
      <label htmlFor="url-input">
        Paste an article, YouTube, or Google Drive folder link
      </label>
      <div className="field-row">
        {training?.sourceUrl ? (
          <button
            type="button"
            className="field-icon field-icon-button"
            onClick={handleCopySourceLink}
            aria-label="Copy original link"
            title="Copy original link"
          >
            <LinkIcon />
          </button>
        ) : (
          <span className="field-icon">
            <LinkIcon />
          </span>
        )}
        <input
          id="url-input"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck="false"
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
  );

  const errorMessage = error ? (
    <p className="error-message" role="alert">
      {error}
    </p>
  ) : null;

  if (!training) {
    return (
      <div className="app-shell is-landing">
        <header className="topbar">
          <button
            type="button"
            className="brand brand-button"
            onClick={handleReset}
            aria-label="Sliced Learning home"
          >
            <LogoMark />
            <span>Sliced Learning</span>
          </button>
          <ReaderSettings
            settings={readerSettings}
            onChange={updateReaderSettings}
            showTypography={false}
          />
        </header>

        <main className="landing">
          <section className="hero">
            <span className="eyebrow">Learn in focused slices</span>
            <h1>
              Turn long reads and videos into{" "}
              <span className="gradient-text">bite-sized lessons</span>
            </h1>
            <p className="hero-lede">
              Paste a link and get short, timed sections you can finish one at a
              time. Your progress lives in the link, so you can pick up on any
              device.
            </p>

            <div className="hero-form">
              {urlForm}
              {errorMessage}
            </div>

            {loading ? (
              <div className="loading-card" role="status">
                <span className="loading-dot" aria-hidden="true" />
                <div>
                  <strong>Slicing your content</strong>
                  <p>Long videos and folders can take a few seconds.</p>
                </div>
              </div>
            ) : (
              <div className="examples">
                <span className="examples-label">Try one:</span>
                {EXAMPLES.map((example) => (
                  <button
                    key={example.url}
                    type="button"
                    className="example-chip"
                    onClick={() => handleExample(example.url)}
                  >
                    <ContentTypeIcon type={example.type} />
                    {example.label}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="feature-grid" aria-label="Supported content">
            <article className="feature-card">
              <span className="feature-icon is-article">
                <ArticleIcon />
              </span>
              <h2>Articles</h2>
              <p>Long reads become ~2 minute sections with images, code, and quotes intact.</p>
            </article>
            <article className="feature-card">
              <span className="feature-icon is-video">
                <VideoIcon />
              </span>
              <h2>YouTube</h2>
              <p>Videos split into 10 minute chapters that start and stop at the right moment.</p>
            </article>
            <article className="feature-card">
              <span className="feature-icon is-drive">
                <FolderIcon />
              </span>
              <h2>Google Drive</h2>
              <p>Shared folders turn into a playlist, one file per section.</p>
            </article>
          </section>

          <section className="steps" aria-label="How it works">
            <div className="step">
              <span className="step-number">1</span>
              <div>
                <h3>Paste a link</h3>
                <p>Any public article, YouTube video, or Drive folder.</p>
              </div>
            </div>
            <div className="step">
              <span className="step-number">2</span>
              <div>
                <h3>Learn one slice at a time</h3>
                <p>Finish a section, tick it off, and move on.</p>
              </div>
            </div>
            <div className="step">
              <span className="step-number">3</span>
              <div>
                <h3>Share your spot</h3>
                <p>Copy the link to continue later or send it to a friend.</p>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const isLastSegment = activeIndex === totalSegments - 1;
  const typeLabel = getContentTypeLabel(training.type);

  return (
    <div className="app-shell is-learning">
      {confettiBurst > 0 && <Confetti key={confettiBurst} />}
      <aside className="sidebar">
        <div className="sidebar-top">
          <button
            type="button"
            className="brand brand-button"
            onClick={handleReset}
            aria-label="Sliced Learning home"
          >
            <LogoMark />
            <span>Sliced Learning</span>
          </button>
          <div className="sidebar-actions">
            <ReaderSettings settings={readerSettings} onChange={updateReaderSettings} />
            <button
              type="button"
              className="new-button"
              onClick={handleReset}
              aria-label="Start a new training"
            >
              <PlusIcon />
              <span>New</span>
            </button>
          </div>
        </div>
        <div className="sidebar-form">{urlForm}</div>
        {errorMessage}
        <div className="progress-panel">
          <div className="progress-header">
            <h2>Your progress</h2>
            <div className="progress-actions">
              {shareLink && (
                <button
                  type="button"
                  className="copy-link-button"
                  onClick={handleCopyShareLink}
                  aria-label="Copy share link"
                  title="Copy share link"
                >
                  <CopyIcon />
                </button>
              )}
              <span className="progress-percent">{progress}%</span>
            </div>
          </div>
          {copyStatus && shareLink && (
            <p className="copy-feedback" role="status">
              {copyStatus}
            </p>
          )}
          <div
            className="progress-bar"
            role="progressbar"
            aria-label="Training progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="progress-value" style={{ width: `${progress}%` }} />
          </div>
          <p className="progress-stats">
            <CheckIcon />
            {completedCount} of {totalSegments} done
            {minutesLeft !== null && minutesLeft > 0 && (
              <>
                <span className="dot-separator" aria-hidden="true">·</span>
                <ClockIcon />~{minutesLeft} min left
              </>
            )}
          </p>
          <button
            type="button"
            className="segments-toggle"
            aria-expanded={segmentsOpen}
            aria-controls="segments-list"
            onClick={() => setSegmentsOpen((open) => !open)}
          >
            {segmentsOpen ? "Hide sections" : `All ${totalSegments} sections`}
            <ChevronIcon />
          </button>
          <ul
            id="segments-list"
            className={`segments-list${segmentsOpen ? " is-open" : ""}`}
          >
            {training.segments.map((segment, index) => {
              const status = completed[index]
                ? "completed"
                : index === activeIndex
                ? "active"
                : "pending";
              const isCurrent = index === activeIndex;
              return (
                <li
                  key={segment.id}
                  className={`segment-item ${status}${isCurrent ? " is-current" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectSegment(index)}
                    className="segment-trigger"
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    <span className="segment-index">{index + 1}</span>
                    <span className="segment-label">{segment.label}</span>
                    {completed[index] && (
                      <span className="segment-check" aria-label="Completed">
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="reset-button" type="button" onClick={handleReset}>
            Start over
          </button>
        </div>
      </aside>

      <main className="content">
        {allDone && (
          <section className="completion-banner" role="status">
            <span className="completion-icon">
              <TrophyIcon />
            </span>
            <div className="completion-text">
              <strong>You finished every section!</strong>
              <p>You are ready to slice something new.</p>
            </div>
            <div className="completion-actions">
              <button type="button" className="primary-button" onClick={handleReset}>
                <PlusIcon />
                New training
              </button>
            </div>
          </section>
        )}
        <div className="segment-view" ref={segmentViewRef}>
          <header className="segment-header">
            <div className="segment-heading">
              {typeLabel && (
                <span className={`type-pill is-${training.type}`}>
                  <ContentTypeIcon type={training.type} />
                  {typeLabel}
                </span>
              )}
              <h2>{training.title}</h2>
              <p className="segment-meta">{getTrainingDescription(training)}</p>
            </div>
            <span className="segment-counter">
              Segment {activeIndex + 1} / {totalSegments}
            </span>
          </header>
          <section className="segment-body" key={activeIndex}>
            <h3>{activeSegment?.label}</h3>
            {activeSegment && renderSegment(training.type, activeSegment, training)}
          </section>
          <footer className="segment-footer">
            <button
              type="button"
              className="ghost-button"
              onClick={handlePrevious}
              disabled={!totalSegments || activeIndex === 0}
            >
              <ArrowLeftIcon />
              Previous
            </button>
            <span className="keyboard-hint" aria-hidden="true">
              <kbd>←</kbd>
              <kbd>→</kbd> to navigate
            </span>
            <button
              type="button"
              className="primary-button"
              onClick={handleNext}
              disabled={totalSegments === 0 || (isLastSegment && completed[activeIndex])}
            >
              {isLastSegment
                ? completed[activeIndex]
                  ? "Completed"
                  : "Finish segment"
                : "Next"}
              {isLastSegment ? <CheckIcon /> : <ArrowRightIcon />}
            </button>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
