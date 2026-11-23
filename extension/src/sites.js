// Hosts the extension knows how to capture. Public articles and YouTube stay
// with the web app, so every other page gets the "unsupported" reader.
//
// Confluence Cloud sites live on <site>.atlassian.net. Any site is accepted
// (phase 6 generalised this from envato.atlassian.net so the mock e2e can use
// mock.atlassian.net); the page is still only read on a toolbar click, and the
// manifest grants no host permission on atlassian.net.
export const SUPPORTED_HOSTS = ["github.com"];

export const isConfluenceHost = (hostname) =>
  typeof hostname === "string" && /^[a-z0-9][a-z0-9-]*\.atlassian\.net$/i.test(hostname);

export const isSupportedUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return url.protocol === "https:" && (SUPPORTED_HOSTS.includes(url.hostname) || isConfluenceHost(url.hostname));
};
