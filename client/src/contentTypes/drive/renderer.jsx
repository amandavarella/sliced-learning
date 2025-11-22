/**
 * Renders a Google Drive file segment
 */
export const renderDrive = (segment) => {
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

