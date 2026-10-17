/**
 * Renders a video segment
 */
const timeLabel = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

export const renderVideo = (segment, training) => {
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
        <div className="video-chip">
          <span className="video-chip-label">Start</span>
          <strong>{segment.cue.start}</strong>
        </div>
        <div className="video-chip">
          <span className="video-chip-label">End</span>
          <strong>{segment.cue.end}</strong>
        </div>
        <div className="video-chip">
          <span className="video-chip-label">Duration</span>
          <strong>{timeLabel(segment.durationSeconds)}</strong>
        </div>
        <p className="video-segment-note">
          Watch this segment before advancing. The player starts and stops at the right moment.
        </p>
      </div>
    </div>
  );
};

