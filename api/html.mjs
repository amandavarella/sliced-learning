import { processContent } from "../server/src/contentTypes/index.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve HTML path - works for both local and Vercel
const getHtmlPath = () => {
  // Try Vercel output directory first
  const vercelPath = resolve(__dirname, "../client/dist/index.html");
  try {
    readFileSync(vercelPath, "utf-8");
    return vercelPath;
  } catch {
    // Fallback to relative path
    return resolve(__dirname, "../client/dist/index.html");
  }
};

const getTrainingTitle = async (sourceUrl) => {
  try {
    const payload = await processContent(sourceUrl);
    return payload.title || null;
  } catch (error) {
    console.error("[html.mjs] Failed to get training title:", error.message);
    return null;
  }
};

const injectMetaTags = (html, title, url) => {
  if (!title) {
    return html;
  }

  // Escape HTML entities in title
  const escapeHtml = (text) => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const escapedTitle = escapeHtml(title);
  const escapedUrl = escapeHtml(url);

  // Replace the title tag
  let updatedHtml = html.replace(
    /<title>.*?<\/title>/i,
    `<title>${escapedTitle}</title>`
  );

  // Remove existing og:title, og:description, og:url if they exist
  updatedHtml = updatedHtml.replace(
    /<meta\s+property=["']og:title["'][^>]*>/gi,
    ""
  );
  updatedHtml = updatedHtml.replace(
    /<meta\s+property=["']og:description["'][^>]*>/gi,
    ""
  );
  updatedHtml = updatedHtml.replace(
    /<meta\s+property=["']og:url["'][^>]*>/gi,
    ""
  );
  updatedHtml = updatedHtml.replace(
    /<meta\s+property=["']og:type["'][^>]*>/gi,
    ""
  );
  updatedHtml = updatedHtml.replace(
    /<meta\s+name=["']twitter:card["'][^>]*>/gi,
    ""
  );
  updatedHtml = updatedHtml.replace(
    /<meta\s+name=["']twitter:title["'][^>]*>/gi,
    ""
  );
  updatedHtml = updatedHtml.replace(
    /<meta\s+name=["']twitter:description["'][^>]*>/gi,
    ""
  );

  // Find the closing </head> tag and insert meta tags before it (without description)
  const metaTags = `
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:url" content="${escapedUrl}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapedTitle}" />
  `;

  updatedHtml = updatedHtml.replace("</head>", `${metaTags}</head>`);

  return updatedHtml;
};

export default async (req, res) => {
  try {
    // Read the built index.html file
    const htmlPath = getHtmlPath();
    let html = readFileSync(htmlPath, "utf-8");

    // Check if there's a source query parameter
    const sourceUrl = req.query?.source;
    const segment = req.query?.segment || "0";

    if (sourceUrl) {
      // Get the training title
      const title = await getTrainingTitle(sourceUrl);

      if (title) {
        // Build the full URL for og:url
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const fullUrl = `${protocol}://${host}${req.url}`;

        // Inject meta tags (without description)
        html = injectMetaTags(html, title, fullUrl);
      }
    }

    res.setHeader("Content-Type", "text/html");
    res.status(200).send(html);
  } catch (error) {
    console.error("[html.mjs] Error serving HTML:", error);
    // Fallback to serving the original HTML
    try {
      const htmlPath = getHtmlPath();
      const html = readFileSync(htmlPath, "utf-8");
      res.setHeader("Content-Type", "text/html");
      res.status(200).send(html);
    } catch (fallbackError) {
      console.error("[html.mjs] Fallback error:", fallbackError);
      res.status(500).send("Internal Server Error");
    }
  }
};

