// Browser adapter for the slicing core, built on DOMParser. DOMParser exists in
// pages (the extension's reader page, an offscreen document) but not in an MV3
// service worker, so slicing has to run in one of those.
export const createBrowserDom = (DOMParserImpl = globalThis.DOMParser) => {
  if (typeof DOMParserImpl !== "function") {
    throw new Error("DOMParser is not available in this context");
  }

  const parser = new DOMParserImpl();
  return {
    parseHtml: (html) => parser.parseFromString(`<body>${html}</body>`, "text/html"),
  };
};
