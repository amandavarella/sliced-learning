import { useMemo, useState } from "react";
import "./App.css";

const defaultState = {
  training: null,
  activeIndex: 0,
  completed: [],
};

const timeLabel = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

const renderArticle = (segment) => {
  if (segment?.html) {
    return (
      <div
        className="article-segment-content"
        dangerouslySetInnerHTML={{ __html: segment.html }}
      />
    );
  }

  if (!segment?.text) {
    return null;
  }

  return segment.text.split(/\n{2,}/).map((paragraph, index) => (
    <p key={`${segment.id}-paragraph-${index}`}>{paragraph}</p>
  ));
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

  const activeSegment = useMemo(() => {
    if (!training) {
      return null;
    }
    return training.segments[activeIndex];
  }, [activeIndex, training]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!url.trim()) {
      setError("Please paste a valid article or YouTube link.");
      return;
    }

    try {
      setError("");
      setLoading(true);
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

      const payload = await response.json();
      setTrainingState({
        training: payload,
        activeIndex: 0,
        completed: payload.segments.map(() => false),
      });
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
      const nextCompleted = [...previous.completed];
      nextCompleted[previous.activeIndex] = true;
      const isLast =
        previous.activeIndex === previous.training.segments.length - 1;

      return {
        ...previous,
        completed: nextCompleted,
        activeIndex: isLast
          ? previous.activeIndex
          : previous.activeIndex + 1,
      };
    });
  };

  const handleSelectSegment = (index) => {
    if (!training) {
      return;
    }

    setTrainingState((previous) => ({
      ...previous,
      activeIndex: index,
    }));
  };

  const handleReset = () => {
    setTrainingState(defaultState);
    setUrl("");
    setError("");
  };

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
              {loading ? "Processing..." : "Slice"}
            </button>
          </div>
        </form>
        {error && <p className="error-message">{error}</p>}
        {training && (
          <div className="progress-panel">
            <div className="progress-header">
              <h2>Progress</h2>
              <span>{progress}%</span>
            </div>
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
                  {training.type === "article"
                    ? `Article · ${training.segments.length} sections · ~${training.segmentMinutes} minutes each`
                    : `Video · ${training.segments.length} segments · ${training.segmentMinutes} minutes each`}
                </p>
              </div>
              <span>
                Segment {activeIndex + 1} / {training.segments.length}
              </span>
            </header>
            <section className="segment-body">
              <h3>{activeSegment.label}</h3>
              {training.type === "article"
                ? renderArticle(activeSegment)
                : renderVideo(activeSegment, training)}
            </section>
            <footer className="segment-footer">
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
