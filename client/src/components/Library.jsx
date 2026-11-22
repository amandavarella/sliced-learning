import { useCallback, useEffect, useState } from "react";
import { useTrainingSource } from "../trainingSource/index.js";
import { formatShortDate } from "../utils/formatDate.js";
import { ArticleIcon, CheckIcon } from "./Icons.jsx";

// The list of stored trainings, shown instead of the landing page when the
// training source has `capabilities.library` (the Chrome extension). With an
// `error` (an unsupported page, a missing capture) it shows the message and a
// link back to the list instead.
const Library = ({ error = "", loading = false }) => {
  const trainingSource = useTrainingSource();
  const [items, setItems] = useState(null);
  const [usage, setUsage] = useState(null);
  const [listError, setListError] = useState("");
  const [confirmKey, setConfirmKey] = useState(null);
  const [deletingKey, setDeletingKey] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [trainings, storage] = await Promise.all([
        trainingSource.listTrainings(),
        trainingSource.getStorageUsage?.() ?? null,
      ]);
      setItems(trainings);
      setUsage(storage);
      setListError("");
    } catch (refreshError) {
      setListError(refreshError.message || "Unable to read the stored trainings.");
    }
  }, [trainingSource]);

  const showList = !error && !loading;

  // Read the list on open, and again when the tab comes back into view, since
  // another reader tab may have sliced, finished or deleted a training
  useEffect(() => {
    if (!showList) {
      return undefined;
    }
    refresh();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [showList, refresh]);

  const handleDelete = async (key) => {
    setDeletingKey(key);
    try {
      await trainingSource.deleteTraining(key);
      setConfirmKey(null);
      await refresh();
    } catch (deleteError) {
      setListError(deleteError.message || "Unable to delete the training.");
    } finally {
      setDeletingKey(null);
    }
  };

  if (loading) {
    return (
      <section className="hero">
        <div className="loading-card" role="status">
          <span className="loading-dot" aria-hidden="true" />
          <div>
            <strong>Opening your training</strong>
            <p>Long pages can take a few seconds to slice.</p>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="hero library-notice">
        <p className="error-message" role="alert">
          {error}
        </p>
        <a className="primary-button" href={window.location.pathname}>
          Back to your library
        </a>
      </section>
    );
  }

  const finishedCount =
    items?.filter((item) => item.totalSegments > 0 && item.completedCount === item.totalSegments)
      .length ?? 0;

  return (
    <>
      <section className="hero library-hero">
        <span className="eyebrow">Your library</span>
        <h1>
          Trainings in <span className="gradient-text">this browser</span>
        </h1>
        <p className="hero-lede">
          Open a GitHub or Confluence page and click the Sliced Learning toolbar
          button to add it here. Everything stays in this Chrome profile.
        </p>
      </section>

      {listError && (
        <p className="error-message" role="alert">
          {listError}
        </p>
      )}

      {items === null ? (
        <div className="loading-card" role="status">
          <span className="loading-dot" aria-hidden="true" />
          <div>
            <strong>Reading your library</strong>
          </div>
        </div>
      ) : (
        <>
          {items.length > 0 && (
            <section className="library-stats" aria-label="Library totals">
              <div className="feature-card library-stat">
                <span className="library-stat-label">Trainings</span>
                <strong className="library-stat-value">{items.length}</strong>
                <p>
                  {finishedCount} finished, {items.length - finishedCount} in progress
                </p>
              </div>
              {usage && (
                <div className="feature-card library-stat">
                  <span className="library-stat-label">Storage used</span>
                  <strong className="library-stat-value">{usage.label}</strong>
                  <p>Images are stored inside each training, so image-heavy pages take the most space.</p>
                </div>
              )}
            </section>
          )}

          {items.length === 0 ? (
            <section className="feature-card library-empty">
              <span className="feature-icon is-article">
                <ArticleIcon />
              </span>
              <h2>No trainings yet</h2>
              <p>
                Supported pages: Markdown files, READMEs, wikis, issues and pull
                requests on github.com, and Confluence Cloud pages.
              </p>
            </section>
          ) : (
            <ul className="library-list" aria-label="Stored trainings">
              {items.map((item) => {
                const percent = item.totalSegments
                  ? Math.round((item.completedCount / item.totalSegments) * 100)
                  : 0;
                const confirming = confirmKey === item.key;
                const captured = formatShortDate(item.capturedAt);
                return (
                  <li key={item.key} className="feature-card library-item">
                    <a className="library-link" href={item.href}>
                      <span className="library-badges">
                        <span className={`type-pill is-${item.site.id}`}>{item.site.label}</span>
                        <span className="library-kind">{item.kindLabel}</span>
                      </span>
                      <strong className="library-title">{item.title}</strong>
                      <span className="progress-stats">
                        <CheckIcon />
                        {item.completedCount} of {item.totalSegments} done
                        {captured && (
                          <>
                            <span className="dot-separator" aria-hidden="true">·</span>
                            Captured {captured}
                          </>
                        )}
                      </span>
                      <span
                        className="progress-bar"
                        role="progressbar"
                        aria-label={`${item.title} progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                      >
                        <span className="progress-value" style={{ width: `${percent}%` }} />
                      </span>
                    </a>
                    <div className="library-actions">
                      {confirming ? (
                        <>
                          <span className="library-confirm">Delete this training and its progress?</span>
                          <button
                            type="button"
                            className="ghost-button library-delete"
                            onClick={() => handleDelete(item.key)}
                            disabled={deletingKey === item.key}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => setConfirmKey(null)}
                            disabled={deletingKey === item.key}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setConfirmKey(item.key)}
                          aria-label={`Delete ${item.title}`}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
};

export default Library;
