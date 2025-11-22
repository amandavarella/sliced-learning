/**
 * Detects if a URL is a YouTube video
 */
export const detectVideo = (url) => {
  try {
    return /(youtube\.com|youtu\.be)/i.test(url);
  } catch (error) {
    return false;
  }
};

