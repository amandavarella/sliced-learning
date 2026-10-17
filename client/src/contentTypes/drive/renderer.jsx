/**
 * Renders a Google Drive file segment
 */
export const renderDrive = (segment) => {
  // Check if this is an audio/video file that should be embedded
  const fileId = segment?.fileId;
  const fileName = segment?.fileName || "";
  const isAudioFile = fileName.toLowerCase().endsWith('.m4a') || 
                      fileName.toLowerCase().endsWith('.mp3') || 
                      fileName.toLowerCase().endsWith('.wav') ||
                      fileName.toLowerCase().endsWith('.ogg');
  
  if (isAudioFile && fileId) {
    // For audio files, provide a link to view in Google Drive
    const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    
    return (
      <div className="drive-segment-content">
        <div className="drive-audio-card">
          <p>
            Audio file: <strong>{fileName}</strong>
          </p>
          <div className="drive-audio-actions">
            <a
              className="primary-button"
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Listen in Google Drive
            </a>
            <a
              className="ghost-button"
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download
            </a>
          </div>
        </div>
        {segment?.text && (
          <div className="drive-text">
            {segment.text.split(/\n{2,}/).map((paragraph, index) => (
              <p key={`${segment.id}-paragraph-${index}`}>{paragraph}</p>
            ))}
          </div>
        )}
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

