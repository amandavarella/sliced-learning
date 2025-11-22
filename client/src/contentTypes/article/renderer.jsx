/**
 * Renders an article segment
 */
export const renderArticle = (segment) => {
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

