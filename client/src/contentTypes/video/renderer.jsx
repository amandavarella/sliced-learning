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

