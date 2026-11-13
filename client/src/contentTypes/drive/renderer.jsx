const MEDIA_LABELS = {
  audio: { kind: "Audio file", action: "Listen in Google Drive" },
  video: { kind: "Video file", action: "Watch in Google Drive" },
  image: { kind: "Image", action: "View in Google Drive" },
};

const AUDIO_EXTENSIONS = [".m4a", ".mp3", ".wav", ".ogg"];

/**
 * Works out whether a segment is a file we only link to (media, or a file whose
 * content could not be loaded). The server's text for these segments is just
 * the same links written as markdown, so it is not shown.
 */
const getLinkOnlyCard = (segment) => {
  const fileId = segment?.fileId;
  if (!fileId) {
    return null;
  }

  const fileName = segment.fileName || "";
  // Older saved trainings may lack fileType, so fall back to the extension.
  const isAudioByName = AUDIO_EXTENSIONS.some((extension) =>
    fileName.toLowerCase().endsWith(extension),
  );
  const fileType = segment.fileType || (isAudioByName ? "audio" : null);
  const media = MEDIA_LABELS[fileType];

  if (!media && !segment.viewUrl) {
    return null;
  }

  return {
    fileName,
    kind: media ? media.kind : "Couldn't load this file's content",
    action: media ? media.action : "Open in Google Drive",
    viewUrl: segment.viewUrl || `https://drive.google.com/file/d/${fileId}/view`,
    downloadUrl:
      segment.downloadUrl ||
      `https://drive.google.com/uc?export=download&id=${fileId}`,
  };
};

/**
 * Renders a Google Drive file segment
 */
export const renderDrive = (segment) => {
  const card = getLinkOnlyCard(segment);

  if (card) {
    return (
      <div className="drive-segment-content">
        <div className="drive-audio-card">
          <p>
            {card.kind}: <strong>{card.fileName}</strong>
          </p>
          <div className="drive-audio-actions">
            <a
              className="primary-button"
              href={card.viewUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {card.action}
            </a>
            <a
              className="ghost-button"
              href={card.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (segment?.html) {
    return (
      <div
        className="drive-segment-content"
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
