/**
 * Detects if a URL is an article (text-based content)
 * This is the default/fallback content type
 */
export const detectArticle = (url) => {
  // Articles are the default type - any URL that isn't explicitly
  // detected as another type will be treated as an article
  return true;
};

