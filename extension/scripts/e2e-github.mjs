// End-to-end check of the GitHub extractors in a real browser. Not run in CI.
//
//   npm run build
//   npm run e2e:github
//
// For each public page below it opens the page, drives the toolbar click
// through the service worker, waits for the reader, and checks the stored
// training: the extractor's page kind, a title, at least two segments (one
// for the short Vite README), and, where expected, at least one image
// inlined as a data: URL.
//
// Like e2e-smoke.mjs, it loads a temporary copy of dist/ whose manifest adds
// host access to github.com, because a click driven from the service worker
// does not grant activeTab. The manifest's own host permission for
// *.githubusercontent.com is kept, so image inlining (page fetch first, then
// the service worker for hosts without CORS headers) runs as it would after a
// real click.
//
// On the blob page it also opens the segment with the first highlighted code
// block and checks, in the light and dark colour schemes, that a GitHub
// Prettylights keyword span (span.pl-k) gets a colour of its own and that the
// block background follows the theme (src/githubSyntax.css).
//
// Environment: PLAYWRIGHT_MODULE, CHROMIUM_PATH and HEADED=1, as in
// e2e-smoke.mjs. E2E_ONLY=issue,pr runs a subset by kind. SCREENSHOT_DIR=<dir>
// saves code-light.png and code-dark.png of that code block.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PAGES = [
  {
    kind: "blob",
    url: "https://github.com/mozilla/readability/blob/main/README.md",
    ready: "article.markdown-body",
    expectSyntaxColours: true,
  },
  {
    kind: "repo-readme",
    url: "https://github.com/vitejs/vite",
    ready: "article.markdown-body",
    // The Vite README is about 150 words, under one 400-word segment
    minSegments: 1,
    expectDataImage: true,
  },
  {
    kind: "wiki",
    url: "https://github.com/mrdoob/three.js/wiki/Migration-Guide",
    ready: "#wiki-body .markdown-body",
  },
  {
    kind: "issue",
    // Long enough for two segments, with an uploaded screenshot
    url: "https://github.com/vitejs/vite/issues/11804",
    ready: '[data-testid="issue-body"] [data-testid="markdown-body"]',
    expectDataImage: true,
  },
  {
    kind: "pr",
    url: "https://github.com/vitejs/vite/pull/10671",
    ready: '[id^="pullrequest-"] .js-comment-body',
  },
];
const MIN_SEGMENTS = 2;

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
const workDir = mkdtempSync(join(tmpdir(), "sliced-learning-e2e-github-"));
const extensionDir = join(workDir, "extension");
const profileDir = join(workDir, "profile");

cpSync(dist, extensionDir, { recursive: true });
const manifestPath = join(extensionDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.host_permissions = [...(manifest.host_permissions || []), "https://github.com/*"];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const chromium = await loadPlaywright();
const context = await chromium.launchPersistentContext(profileDir, {
  headless: process.env.HEADED !== "1",
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
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

// GitHub sometimes answers a heavy page with its "Unicorn!" error page; retry
const openSource = async (page, { url, ready }) => {
  const tab = await context.newPage();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await tab.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    try {
      await tab.waitForSelector(ready, { timeout: 30000 });
      await tab.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      return tab;
    } catch (error) {
      console.log(`  ${url}: attempt ${attempt} found no "${ready}" (${await tab.title()})`);
      if (attempt === 3) {
        throw error;
      }
      await tab.waitForTimeout(3000 * attempt);
    }
  }
  return tab;
};

// Opens the first segment with a highlighted block and compares computed
// colours in each scheme. Returns problems, and the colours for the log.
const checkSyntaxColours = async (reader, segments) => {
  const index = segments.findIndex((segment) => /class="pl-k"/.test(segment.html || ""));
  if (index < 0) {
    return { problems: ["no span.pl-k in any segment"] };
  }
  await reader.locator(".segment-item .segment-trigger").nth(index).click();
  const block = reader.locator(".article-segment-content div.highlight").filter({ has: reader.locator("span.pl-k") }).first();
  await block.waitFor({ timeout: 10000 });

  const problems = [];
  const colours = {};
  for (const colorScheme of ["light", "dark"]) {
    await reader.emulateMedia({ colorScheme });
    const sample = await block.evaluate((node) => {
      const pre = node.querySelector("pre");
      const keyword = pre.querySelector("span.pl-k");
      const preStyle = getComputedStyle(pre);
      return {
        text: preStyle.color,
        background: preStyle.backgroundColor,
        keyword: getComputedStyle(keyword).color,
      };
    });
    colours[colorScheme] = sample;
    if (sample.keyword === sample.text) {
      problems.push(`${colorScheme}: span.pl-k has the code text colour ${sample.text}`);
    }
    if (process.env.SCREENSHOT_DIR) {
      await block.scrollIntoViewIfNeeded();
      await block.screenshot({ path: join(process.env.SCREENSHOT_DIR, `code-${colorScheme}.png`) });
    }
  }
  if (colours.light.keyword === colours.dark.keyword) {
    problems.push(`span.pl-k is ${colours.light.keyword} in both schemes`);
  }
  if (colours.light.background === colours.dark.background) {
    problems.push(`code background is ${colours.light.background} in both schemes`);
  }
  await reader.emulateMedia({ colorScheme: null });
  return { problems, colours };
};

const only = (process.env.E2E_ONLY || "").split(",").filter(Boolean);
const pages = only.length ? PAGES.filter((page) => only.includes(page.kind)) : PAGES;

const results = [];
let failed = false;
try {
  const worker =
    context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));

  for (const page of pages) {
    const result = { kind: page.kind, url: page.url };
    results.push(result);
    try {
      const source = await openSource(context, page);
      const reader = await waitForReader(() =>
        worker.evaluate(async (pageUrl) => {
          const [tab] = await chrome.tabs.query({ url: pageUrl });
          await globalThis.__handleActionClick(tab);
        }, source.url()),
      );
      await reader.waitForSelector(".segment-item", { timeout: 30000 });

      const stored = await worker.evaluate(() => chrome.storage.local.get(null));
      const entry = Object.entries(stored).find(
        ([key, value]) => key.startsWith("training:") && value.payload.sourceUrl === source.url(),
      );
      if (!entry) {
        throw new Error("no training stored for this page");
      }
      const { payload, stats } = entry[1];
      const html = payload.segments.map((segment) => segment.html || "").join("");

      Object.assign(result, {
        sourceKind: payload.sourceKind,
        title: payload.title,
        segments: payload.totalSegments,
        readerSegments: await reader.locator(".segment-item").count(),
        dataImages: (html.match(/<img[^>]+src="data:/g) || []).length,
        images: (html.match(/<img/g) || []).length,
        stats,
      });

      const problems = [];
      if (payload.sourceKind !== page.kind) problems.push(`kind ${payload.sourceKind}, expected ${page.kind}`);
      if (!payload.title?.trim()) problems.push("empty title");
      const minSegments = page.minSegments ?? MIN_SEGMENTS;
      if (payload.totalSegments < minSegments) problems.push(`${payload.totalSegments} segments, expected ${minSegments}+`);
      if (page.expectDataImage && result.dataImages < 1) problems.push("no data: image in the training");
      if (page.expectSyntaxColours) {
        const syntax = await checkSyntaxColours(reader, payload.segments);
        result.syntaxColours = syntax.colours;
        problems.push(...syntax.problems);
      }
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
} finally {
  await context.close();
  rmSync(workDir, { recursive: true, force: true });
}

console.table(
  results.map(({ kind, sourceKind, title, segments, dataImages, images, ok }) => ({
    kind,
    sourceKind,
    title,
    segments,
    images: `${dataImages ?? 0}/${images ?? 0} inlined`,
    ok,
  })),
);
if (failed) {
  console.error("GitHub e2e failed");
  process.exitCode = 1;
} else {
  console.log("GitHub e2e passed");
}
