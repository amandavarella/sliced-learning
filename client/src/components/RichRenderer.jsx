import './RichRenderer.css';

/**
 * Renders a single TextNode with its marks (bold, italic, links, etc.)
 */
const renderText = (t, i) => {
  if (!t.marks || t.marks.length === 0) {
    return <span key={i}>{t.text}</span>;
  }

  return t.marks.reduceRight((child, mark, j) => {
    const key = `${i}-${j}`;

    switch (mark.type) {
      case "bold":
        return <strong key={key}>{child}</strong>;
      case "italic":
        return <em key={key}>{child}</em>;
      case "underline":
        return <u key={key}>{child}</u>;
      case "strike":
        return <s key={key}>{child}</s>;
      case "code":
        return <code key={key} className="inline-code">{child}</code>;
      case "sup":
        return <sup key={key}>{child}</sup>;
      case "sub":
        return <sub key={key}>{child}</sub>;
      case "highlight":
        return <mark key={key}>{child}</mark>;
      case "link":
        return (
          <a
            key={key}
            href={mark.href}
            target="_blank"
            rel="nofollow noopener noreferrer"
            title={mark.title}
          >
            {child}
          </a>
        );
      default:
        return child;
    }
  }, <>{t.text}</>);
};

/**
 * RichRenderer - Renders rich-text AST nodes with preserved styling
 *
 * Supports:
 * - Headings with alignment
 * - Paragraphs with alignment
 * - Lists (bulleted and numbered)
 * - Blockquotes and pullquotes
 * - Code blocks with language
 * - Horizontal rules
 * - Captions
 * - Inline marks: bold, italic, underline, strike, code, links, etc.
 */
export function RichRenderer({ nodes }) {
  if (!nodes || !Array.isArray(nodes)) {
    return null;
  }

  return (
    <div className="rich-content">
      {nodes.map((n, idx) => {
        const align = n.align ? `text-${n.align}` : "";

        switch (n.type) {
          case "heading": {
            const level = n.level || 2;
            const HeadingTag = `h${level}`;
            return (
              <HeadingTag key={idx} className={align}>
                {(n.children || []).map(renderText)}
              </HeadingTag>
            );
          }

          case "paragraph":
            return (
              <p key={idx} className={align}>
                {(n.children || []).map(renderText)}
              </p>
            );

          case "blockquote":
          case "pullquote": {
            const isPullquote = n.type === "pullquote";
            return (
              <blockquote
                key={idx}
                className={isPullquote ? "pullquote" : "blockquote"}
              >
                {(n.children || []).map((c, i) =>
                  c.type === "paragraph" ? (
                    <p key={i}>{(c.children || []).map(renderText)}</p>
                  ) : null
                )}
              </blockquote>
            );
          }

          case "bulleted_list":
          case "numbered_list": {
            const ListTag = n.type === "bulleted_list" ? "ul" : "ol";
            return (
              <ListTag key={idx}>
                {(n.children || []).map((li, i) => (
                  <li key={i}>{(li.children || []).map(renderText)}</li>
                ))}
              </ListTag>
            );
          }

          case "codeblock":
            return (
              <pre key={idx} className={n.language ? `language-${n.language}` : ""}>
                <code>{(n.children || []).map(renderText)}</code>
              </pre>
            );

          case "caption":
            return (
              <figcaption key={idx} className={`caption ${align}`}>
                {(n.children || []).map(renderText)}
              </figcaption>
            );

          case "hr":
            return <hr key={idx} />;

          default:
            return null;
        }
      })}
    </div>
  );
}
