// End-to-end check of the Confluence capture against a local mock. Not run in
// CI, needs no network and no Atlassian account.
//
//   npm run build
//   npm run e2e:confluence
//
// A small Node http server on a free port plays a Confluence Cloud site: a
// rendered page at /wiki/spaces/TEST/pages/<id>/Title, the v2 page endpoint,
// the v1 content search and attachment downloads. Every API and attachment
// request needs the mock session cookie, so a capture that forgets
// `credentials` fails. Playwright routes https://mock.atlassian.net/* to the
// server, so the extension sees a real *.atlassian.net origin.
//
// Three pages, one per route:
//   123  v2 answers with export_view         -> via api-v2, two images inlined
//   124  v2 answers 500, v1 search answers    -> via api-v1
//   125  both answer 500                      -> via dom
//
// Like e2e-github.mjs it loads a temporary copy of dist/ whose manifest adds
// host access to https://mock.atlassian.net/*, because a click driven from the
// service worker does not grant activeTab. The build in dist/ is not changed.
//
// Environment: PLAYWRIGHT_MODULE, CHROMIUM_PATH and HEADED=1, as in
// e2e-smoke.mjs.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SITE = "https://mock.atlassian.net";
const COOKIE_NAME = "cloud.session.token";
const COOKIE_VALUE = "mock-session";
// A 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const fixture = (name) =>
  readFileSync(new URL(`../fixtures/confluence/${name}`, import.meta.url), "utf8");
const EXPORT_VIEW = fixture("export-view.html");
const DOM_PAGE = fixture("dom-page.html");

const PAGES = [
  { id: "123", v2: true, v1: true, via: "api-v2", title: "Onboarding guide", minSegments: 2, minDataImages: 2 },
  { id: "124", v2: false, v1: true, via: "api-v1", title: "Onboarding guide (v1)", minSegments: 2, minDataImages: 2 },
  // The rendered page fixture is short: one segment, no images
  { id: "125", v2: false, v1: false, via: "dom", title: "Onboarding from the rendered page", minSegments: 1, minDataImages: 0 },
];

// ---- mock Confluence ----------------------------------------------------

const requests = [];

const send = (res, status, type, body) => {
  res.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body) });
  res.end(body);
};
const sendJson = (res, status, body) => send(res, status, "application/json", JSON.stringify(body));

const pageHtml = (id) => `<!doctype html><html><head><meta charset="utf-8">
<title>Onboarding guide - Test space - Confluence</title>
<meta property="og:title" content="Onboarding guide"></head>
<body><div id="root" data-page-id="${id}">${DOM_PAGE}</div></body></html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, SITE);
  const cookie = req.headers["x-mock-cookie"] || req.headers.cookie || "";
  const signedIn = cookie.includes(`${COOKIE_NAME}=${COOKIE_VALUE}`);
  requests.push({ path: url.pathname + url.search, signedIn });

  const pagePath = url.pathname.match(/^\/wiki\/spaces\/TEST\/pages\/(\d+)(?:\/|$)/);
  if (pagePath) {
    return send(res, 200, "text/html; charset=utf-8", pageHtml(pagePath[1]));
  }
  if (!signedIn) {
    return sendJson(res, 401, { message: "Unauthorized; scope does not match" });
  }

  const v2 = url.pathname.match(/^\/wiki\/api\/v2\/pages\/(\d+)$/);
  if (v2) {
    const page = PAGES.find((candidate) => candidate.id === v2[1]);
    if (!page?.v2) {
      return sendJson(res, 500, { message: "mock v2 failure" });
    }
    const format = url.searchParams.get("body-format");
    return sendJson(res, 200, {
      id: page.id,
      title: page.title,
      body: { [format]: { value: EXPORT_VIEW, representation: format } },
      _links: { base: `${SITE}/wiki` },
    });
  }

  if (url.pathname === "/wiki/rest/api/content/search") {
    const id = (url.searchParams.get("cql") || "").match(/^id=(\d+)$/)?.[1];
    const page = PAGES.find((candidate) => candidate.id === id);
    if (!page?.v1) {
      return sendJson(res, 500, { message: "mock v1 failure" });
    }
    return sendJson(res, 200, {
      results: [{ id: page.id, title: page.title, body: { export_view: { value: EXPORT_VIEW } } }],
      size: 1,
    });
  }

  if (/^\/wiki\/download\/(attachments|thumbnails)\//.test(url.pathname)) {
    res.writeHead(200, { "content-type": "image/png", "content-length": PNG.length });
    return res.end(PNG);
  }

  return send(res, 404, "text/plain", "not found");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const local = `http://127.0.0.1:${server.address().port}`;

// ---- browser ------------------------------------------------------------

const loadPlaywright = async () => {
  const candidates = [process.env.PLAYWRIGHT_MODULE, "playwright", "@playwright/test"].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const specifier = candidate.startsWith("/") ? pathToFileURL(candidate).href : candidate;
      const module = await import(specifier);
      return module.chromium || module.default?.chromium;
    } catch {
      // try the next one
    }
  }
  throw new Error("Playwright not found. Install it or set PLAYWRIGHT_MODULE.");
};

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const workDir = mkdtempSync(join(tmpdir(), "sliced-learning-e2e-confluence-"));
const extensionDir = join(workDir, "extension");
const profileDir = join(workDir, "profile");

cpSync(dist, extensionDir, { recursive: true });
const manifestPath = join(extensionDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.host_permissions = [...(manifest.host_permissions || []), `${SITE}/*`];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const chromium = await loadPlaywright();
const context = await chromium.launchPersistentContext(profileDir, {
  headless: process.env.HEADED !== "1",
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
});

await context.addCookies([
  { name: COOKIE_NAME, value: COOKIE_VALUE, domain: "mock.atlassian.net", path: "/", secure: true, httpOnly: true },
]);

// Rewrite the mock site to the local server. The browser's own Cookie header
// is passed on as x-mock-cookie, since route.fetch to another host would not
// carry it, so the server sees exactly what the page sent.
await context.route(`${SITE}/**`, async (route) => {
  const request = route.request();
  const headers = await request.allHeaders();
  const target = local + new URL(request.url()).pathname + new URL(request.url()).search;
  const response = await route.fetch({
    url: target,
    headers: { ...headers, "x-mock-cookie": headers.cookie || "" },
  });
  await route.fulfill({ response });
});

const isReader = (page) => Boolean(page?.url().startsWith("chrome-extension://"));

const waitForReader = async (open) => {
  const known = new Set(context.pages());
  await open();
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const page = context.pages().find((candidate) => !known.has(candidate) && isReader(candidate));
    if (page) {
      return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The reader tab did not open");
};

const results = [];
let failed = false;
try {
  const worker =
    context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));

  for (const page of PAGES) {
    const url = `${SITE}/wiki/spaces/TEST/pages/${page.id}/Onboarding+guide`;
    const result = { id: page.id, expectedVia: page.via };
    results.push(result);
    try {
      const source = await context.newPage();
      await source.goto(url, { waitUntil: "load" });
      const reader = await waitForReader(() =>
        worker.evaluate(async (pageUrl) => {
          const [tab] = await chrome.tabs.query({ url: pageUrl });
          await globalThis.__handleActionClick(tab);
        }, url),
      );
      await reader.waitForSelector(".segment-item", { timeout: 30000 });

      const stored = await worker.evaluate(() => chrome.storage.local.get(null));
      const entry = Object.entries(stored).find(
        ([key, value]) => key.startsWith("training:") && value.payload.sourceUrl === url,
      );
      if (!entry) {
        throw new Error("no training stored for this page");
      }
      const [key, { payload, stats, extraction }] = entry;
      const html = payload.segments.map((segment) => segment.html || "").join("");

      Object.assign(result, {
        key,
        sourceKind: payload.sourceKind,
        via: extraction?.via,
        title: payload.title,
        segments: payload.totalSegments,
        dataImages: (html.match(/<img[^>]+src="data:/g) || []).length,
        images: (html.match(/<img/g) || []).length,
        details: (html.match(/<details/g) || []).length,
        stats,
      });

      const problems = [];
      if (payload.sourceKind !== "confluence") problems.push(`kind ${payload.sourceKind}, expected confluence`);
      if (result.via !== page.via) problems.push(`via ${result.via}, expected ${page.via}`);
      if (payload.title !== page.title) problems.push(`title "${payload.title}", expected "${page.title}"`);
      if (payload.totalSegments < page.minSegments) problems.push(`${payload.totalSegments} segments, expected ${page.minSegments}+`);
      if (result.dataImages < page.minDataImages) problems.push(`${result.dataImages} data: images, expected ${page.minDataImages}+`);
      if (key !== `training:${SITE}/wiki/spaces/TEST/pages/${page.id}`) problems.push(`key ${key} keeps the slug`);
      if (/emoticon|toc-macro|status-macro|jira-issue/.test(html)) problems.push("Confluence macro markup left in the training");
      result.ok = problems.length === 0;
      if (problems.length) {
        result.problems = problems;
        failed = true;
      }

      await reader.close();
      await source.close();
    } catch (error) {
      result.ok = false;
      result.error = String(error?.message || error);
      failed = true;
    }
    console.log(JSON.stringify(result));
  }

  // Every API and attachment request reached the mock with the session cookie
  const unsigned = requests.filter((request) => !request.signedIn && !request.path.startsWith("/wiki/spaces/"));
  if (unsigned.length) {
    console.error("Requests without the session cookie:", unsigned);
    failed = true;
  }
  console.log(`mock saw ${requests.length} requests, ${unsigned.length} without the session cookie`);
} finally {
  await context.close();
  server.close();
  rmSync(workDir, { recursive: true, force: true });
}

console.table(
  results.map(({ id, expectedVia, via, sourceKind, title, segments, dataImages, images, ok }) => ({
    id,
    expectedVia,
    via,
    sourceKind,
    title,
    segments,
    images: `${dataImages ?? 0}/${images ?? 0} inlined`,
    ok,
  })),
);
if (failed) {
  console.error("Confluence mock e2e failed");
  process.exitCode = 1;
} else {
  console.log("Confluence mock e2e passed");
}
