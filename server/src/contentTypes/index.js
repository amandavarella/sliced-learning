import { videoContentType } from "./video/index.js";
import { articleContentType } from "./article/index.js";
import { driveContentType } from "./drive/index.js";

/**
 * Registry of all content types
 * Order matters: more specific detectors should come first
 * The first content type that detects a match will be used
 */
const contentTypes = [
  driveContentType, // Drive detection should come before article (more specific)
  videoContentType, // Video detection should come before article (more specific)
  articleContentType, // Article is the default/fallback
];

/**
 * Detects the content type for a given URL
 * @param {string} url - The URL to detect
 * @returns {Object|null} The content type object or null if none match
 */
export const detectContentType = (url) => {
  for (const contentType of contentTypes) {
    if (contentType.detect(url)) {
      return contentType;
    }
  }
  return null;
};

/**
 * Processes a URL using the appropriate content type processor
 * @param {string} url - The URL to process
 * @returns {Promise<Object>} The processed content payload
 */
export const processContent = async (url) => {
  const contentType = detectContentType(url);

  if (!contentType) {
    throw new Error("Unable to determine content type for URL");
  }

  console.log("[contentTypes] Detected content type:", {
    url,
    type: contentType.type,
  });

  return contentType.process(url);
};

/**
 * Get all registered content types
 * @returns {Array} Array of content type objects
 */
export const getContentTypes = () => [...contentTypes];

