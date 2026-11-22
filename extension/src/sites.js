// Hosts the extension knows how to capture. Public articles and YouTube stay
// with the web app, so every other page gets the "unsupported" reader.
export const SUPPORTED_HOSTS = ["github.com", "envato.atlassian.net"];

export const isSupportedUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return url.protocol === "https:" && SUPPORTED_HOSTS.includes(url.hostname);
};
