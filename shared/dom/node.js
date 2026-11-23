// Node adapter for the slicing core. The caller passes in its own JSDOM class
// instead of this file importing "jsdom": shared/ has no runtime dependencies,
// so a bare import here would resolve from shared/node_modules, which neither
// the server nor its Vercel bundle has.
export const createNodeDom = (JSDOM) => ({
  parseHtml: (html) => new JSDOM(`<body>${html}</body>`).window.document,
});
