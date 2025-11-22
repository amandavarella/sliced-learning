import { articleContentType } from "./article/index.js";
import { videoContentType } from "./video/index.js";

/**
 * Registry of all content type renderers
 */
const contentTypes = [
  articleContentType,
  videoContentType,
];

/**
 * Gets a content type renderer by type
 * @param {string} type - The content type (e.g., "article", "video")
 * @returns {Object|null} The content type object or null if not found
 */
export const getContentType = (type) => {
  return contentTypes.find((ct) => ct.type === type) || null;
};

/**
 * Renders a segment using the appropriate content type renderer
 * @param {string} type - The content type
 * @param {Object} segment - The segment to render
 * @param {Object} training - The training object (for context)
 * @returns {JSX.Element|null} The rendered segment
 */
export const renderSegment = (type, segment, training) => {
  const contentType = getContentType(type);
  if (!contentType) {
    console.warn(`Unknown content type: ${type}`);
    return null;
  }
  return contentType.render(segment, training);
};

/**
 * Gets the description for a training based on its content type
 * @param {Object} training - The training object
 * @returns {string} The description
 */
export const getTrainingDescription = (training) => {
  if (!training?.type) {
    return "";
  }
  const contentType = getContentType(training.type);
  if (!contentType) {
    return "";
  }
  return contentType.getDescription ? contentType.getDescription(training) : "";
};

