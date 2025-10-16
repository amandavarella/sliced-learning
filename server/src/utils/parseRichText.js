import { unified } from "unified";
import rehypeParse from "rehype-parse";
import { visit } from "unist-util-visit";
import { toString } from "hast-util-to-string";

/**
 * Extracts text alignment from element properties
 */
const alignFrom = (props = {}) => {
  const cls = (props.className || []).join(" ").toLowerCase();
  if (cls.includes("aligncenter") || cls.includes("center")) return "center";
  if (cls.includes("alignright") || cls.includes("right")) return "right";
  return undefined;
};

/**
 * Checks if a blockquote is a pullquote (Medium-style)
 */
const isPullQuote = (props = {}) => {
  const cls = (props.className || []).join(" ").toLowerCase();
  return cls.includes("pullquote") || cls.includes("graf--pullquote");
};

/**
 * Extracts language from code block class name
 */
const langFrom = (node) => {
  const code = node.children?.find((c) => c.tagName === "code");
  const cls = (code?.properties?.className || []).join(" ");
  const match = cls.match(/language-([\w+-]+)/);
  return match?.[1];
};

/**
 * Converts HAST inline nodes to TextNode array with marks
 */
function hastInlineToText(node, marks = []) {
  const out = [];

  const walk = (n, currentMarks) => {
    if (n.type === "text") {
      const text = String(n.value || "");
      if (text.trim().length || /\S/.test(text)) {
        out.push({
          type: "text",
          text,
          marks: currentMarks.length ? [...currentMarks] : undefined,
        });
      }
      return;
    }

    if (n.type === "element") {
      const newMarks = [...currentMarks];
      const tag = n.tagName?.toLowerCase();

      // Apply marks based on tag
      if (tag === "strong" || tag === "b") newMarks.push({ type: "bold" });
      if (tag === "em" || tag === "i") newMarks.push({ type: "italic" });
      if (tag === "u") newMarks.push({ type: "underline" });
      if (tag === "s" || tag === "del" || tag === "strike")
        newMarks.push({ type: "strike" });
      if (tag === "code") newMarks.push({ type: "code" });
      if (tag === "sup") newMarks.push({ type: "sup" });
      if (tag === "sub") newMarks.push({ type: "sub" });
      if (tag === "mark") newMarks.push({ type: "highlight" });
      if (tag === "a" && n.properties?.href) {
        newMarks.push({
          type: "link",
          href: String(n.properties.href),
          title: n.properties.title,
        });
      }

      // Process children
      (n.children || []).forEach((c) => walk(c, newMarks));
    }
  };

  (node.children || []).forEach((c) => walk(c, marks));
  return out;
}

/**
 * Converts HAST paragraph node to BlockNode
 */
function hastToParagraph(node) {
  return {
    type: "paragraph",
    align: alignFrom(node.properties),
    children: hastInlineToText(node),
  };
}

/**
 * Converts HAST list node to BlockNode
 */
function hastToList(node, type) {
  const items = (node.children || [])
    .filter((c) => c.type === "element" && c.tagName === "li")
    .map((li) => ({
      type: "list_item",
      children: hastInlineToText(li),
    }));

  return { type, children: items };
}

/**
 * Coalesces adjacent paragraphs without visible separation
 */
function coalesceBlocks(blocks) {
  const out = [];

  for (const b of blocks) {
    const prev = out[out.length - 1];

    // Join adjacent paragraphs
    if (
      prev &&
      prev.type === "paragraph" &&
      b.type === "paragraph" &&
      !prev.align &&
      !b.align
    ) {
      prev.children = [
        ...(prev.children || []),
        { type: "text", text: "\n" },
        ...(b.children || []),
      ];
    } else {
      out.push(b);
    }
  }

  return out;
}

/**
 * Parses HTML into a rich-text AST that preserves styling
 * @param {string} html - HTML content to parse
 * @returns {Promise<Array>} Array of BlockNode objects
 */
export async function parseRichText(html) {
  const tree = unified().use(rehypeParse, { fragment: true }).parse(html);
  const blocks = [];

  visit(tree, (node) => {
    if (node.type !== "element") return;

    const tag = node.tagName?.toLowerCase();

    switch (tag) {
      case "p":
        blocks.push(hastToParagraph(node));
        break;

      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const level = parseInt(tag.charAt(1));
        blocks.push({
          type: "heading",
          level,
          align: alignFrom(node.properties),
          children: hastInlineToText(node),
        });
        break;
      }

      case "ul":
        blocks.push(hastToList(node, "bulleted_list"));
        break;

      case "ol":
        blocks.push(hastToList(node, "numbered_list"));
        break;

      case "blockquote": {
        const type = isPullQuote(node.properties) ? "pullquote" : "blockquote";
        blocks.push({
          type,
          children: [hastToParagraph(node)],
        });
        break;
      }

      case "pre":
        blocks.push({
          type: "codeblock",
          language: langFrom(node),
          children: [{ type: "text", text: toString(node) }],
        });
        break;

      case "hr":
        blocks.push({ type: "hr" });
        break;

      case "figcaption":
        blocks.push({
          type: "caption",
          align: alignFrom(node.properties),
          children: hastInlineToText(node),
        });
        break;

      default:
        break;
    }
  });

  return coalesceBlocks(blocks);
}
