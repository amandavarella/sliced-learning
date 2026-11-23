// End-to-end check that the reader draws Mermaid diagrams. Not run in CI,
// needs no network.
//
//   npm run build
//   npm run e2e:mermaid
//
// Playwright answers https://github.com/mermaid-js/mermaid/blob/develop/README.md
// with fixtures/github/blob-mermaid.html (10 diagrams) and aborts every other
// https request, so the capture sees a github.com page without GitHub being
// online. The click is driven from the service worker, and, like
// e2e-github.mjs, the script loads a temporary copy of dist/ whose manifest
// adds host access to github.com because that click does not grant activeTab.
//
// In the reader it opens every segment whose stored HTML has a
// code.language-mermaid block and checks that at least one
// figure.mermaid-diagram svg is drawn, that no code.language-mermaid is left,
// and that each figure has a "Diagram source" disclosure. On the first such
// segment it also checks that the figures follow the colour scheme (redrawn
// with Mermaid's dark theme), that no figure overflows the article in the
// normal and the wide layout, and that the page logged no CSP or eval error
// (extension pages have script-src 'self' and no unsafe-eval).
//
// Environment: PLAYWRIGHT_MODULE, CHROMIUM_PATH and HEADED=1, as in
// e2e-smoke.mjs. SCREENSHOT_DIR=<dir> saves mermaid-reader.png (light) and
// mermaid-reader-dark.png of the first figure.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PAGE_URL = "https://github.com/mermaid-js/mermaid/blob/develop/README.md";
const PAGE_TITLE = "mermaid/README.md at develop · mermaid-js/mermaid · GitHub";
const FIXTURE = readFileSync(new URL("../fixtures/github/blob-mermaid.html", import.meta.url), "utf8");
// Same skeleton as the blob-mermaid entry in src/extractors/testPages.js
const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>${PAGE_TITLE}</title></head><body><h1 id="file-name-id-wide">README.md</h1>${FIXTURE}</body></html>`;

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
const workDir = mkdtempSync(join(tmpdir(), "sliced-learning-e2e-mermaid-"));
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
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
});

await context.route("https://**/*", (route) => {
  if (route.request().url() === PAGE_URL) {
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: PAGE_HTML });
  }
  return route.abort();
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

// Counts in the open segment's article body
const segmentCounts = (reader) =>
  reader.locator(".article-segment-content").evaluate((article) => ({
    figures: article.querySelectorAll("figure.mermaid-diagram svg").length,
    codeBlocks: article.querySelectorAll("code.language-mermaid").length,
    sources: article.querySelectorAll("figure.mermaid-diagram + details.mermaid-source").length,
    links: Array.from(article.querySelectorAll("a")).filter((a) => a.textContent === "Diagram rendered on GitHub").length,
    themes: Array.from(article.querySelectorAll("figure.mermaid-diagram")).map((figure) => figure.dataset.mermaidTheme),
  }));

// Every figure and its SVG fit inside the article column
const overflowProblems = (reader, layout) =>
  reader.locator(".article-segment-content").evaluate((article, name) => {
    const limit = article.getBoundingClientRect().right + 1;
    return Array.from(article.querySelectorAll("figure.mermaid-diagram"))
      .map((figure, index) => {
        const figureRight = figure.getBoundingClientRect().right;
        const svgRight = figure.querySelector("svg")?.getBoundingClientRect().right ?? 0;
        return figureRight > limit || svgRight > figure.getBoundingClientRect().right + 1
          ? `${name}: figure ${index} overflows (${Math.round(Math.max(figureRight, svgRight))} > ${Math.round(limit)})`
          : null;
      })
      .filter(Boolean);
  }, layout);

const problems = [];
const pageErrors = [];
const result = { url: PAGE_URL };
try {
  const worker =
    context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));

  const source = await context.newPage();
  await source.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
  await source.waitForSelector("article.markdown-body");

  const reader = await waitForReader(() =>
    worker.evaluate(async (pageUrl) => {
      const [tab] = await chrome.tabs.query({ url: pageUrl });
      await globalThis.__handleActionClick(tab);
    }, PAGE_URL),
  );
  reader.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  reader.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" || /Content Security Policy|unsafe-eval|EvalError/i.test(text)) {
      pageErrors.push(text);
    }
  });
  await reader.waitForSelector(".segment-item", { timeout: 30000 });

  const stored = await worker.evaluate(() => chrome.storage.local.get(null));
  const entry = Object.entries(stored).find(
    ([key, value]) => key.startsWith("training:") && value.payload.sourceUrl === PAGE_URL,
  );
  if (!entry) {
    throw new Error("no training stored for this page");
  }
  const { payload } = entry[1];
  const withDiagrams = payload.segments
    .map((segment, index) => ({ index, blocks: (segment.html?.match(/class="language-mermaid"/g) || []).length }))
    .filter((segment) => segment.blocks > 0);
  result.segments = payload.totalSegments;
  result.storedBlocks = withDiagrams.reduce((sum, segment) => sum + segment.blocks, 0);
  if (!withDiagrams.length) {
    throw new Error("no segment has a code.language-mermaid block");
  }

  result.perSegment = [];
  for (const [position, { index, blocks }] of withDiagrams.entries()) {
    await reader.locator(".segment-item .segment-trigger").nth(index).click();
    await reader
      .locator(".article-segment-content figure.mermaid-diagram svg")
      .first()
      .waitFor({ timeout: 20000 })
      .catch(() => {});
    // Let the queue finish every block in the segment
    await reader
      .waitForFunction(() => !document.querySelector(".article-segment-content code.language-mermaid"), null, {
        timeout: 20000,
      })
      .catch(() => {});
    const counts = await segmentCounts(reader);
    result.perSegment.push({ segment: index + 1, stored: blocks, ...counts, themes: undefined });
    if (counts.figures < 1) problems.push(`segment ${index + 1}: no figure.mermaid-diagram svg`);
    if (counts.codeBlocks > 0) problems.push(`segment ${index + 1}: ${counts.codeBlocks} code.language-mermaid left`);
    if (counts.sources !== counts.figures) {
      problems.push(`segment ${index + 1}: ${counts.sources} source disclosures for ${counts.figures} figures`);
    }

    if (position === 0) {
      if (!counts.themes.every((theme) => theme === "default")) {
        problems.push(`light scheme drew themes ${counts.themes.join(",")}`);
      }
      const figure = reader.locator(".article-segment-content figure.mermaid-diagram").first();
      if (process.env.SCREENSHOT_DIR) {
        await figure.scrollIntoViewIfNeeded();
        await figure.screenshot({ path: join(process.env.SCREENSHOT_DIR, "mermaid-reader.png") });
      }
      problems.push(...(await overflowProblems(reader, "normal")));
      await reader.evaluate(() => document.querySelector("main.content")?.classList.add("is-wide"));
      problems.push(...(await overflowProblems(reader, "wide")));
      await reader.evaluate(() => document.querySelector("main.content")?.classList.remove("is-wide"));

      await reader.emulateMedia({ colorScheme: "dark" });
      const redrawn = await reader
        .waitForFunction(
          () =>
            Array.from(document.querySelectorAll(".article-segment-content figure.mermaid-diagram")).every(
              (node) => node.dataset.mermaidTheme === "dark" && node.querySelector("svg"),
            ),
          null,
          { timeout: 20000 },
        )
        .then(() => true)
        .catch(() => false);
      result.darkRedraw = redrawn;
      if (!redrawn) problems.push("figures were not redrawn for the dark scheme");
      if (process.env.SCREENSHOT_DIR) {
        await figure.screenshot({ path: join(process.env.SCREENSHOT_DIR, "mermaid-reader-dark.png") });
      }
      await reader.emulateMedia({ colorScheme: "light" });
    }
  }

  result.figures = result.perSegment.reduce((sum, segment) => sum + segment.figures, 0);
  result.pageErrors = pageErrors;
  if (pageErrors.length) problems.push(`reader logged ${pageErrors.length} error(s): ${pageErrors[0]}`);
} catch (error) {
  problems.push(String(error?.message || error));
} finally {
  await context.close();
  rmSync(workDir, { recursive: true, force: true });
}

result.ok = problems.length === 0;
if (problems.length) result.problems = problems;
console.log(JSON.stringify(result));
if (result.perSegment) {
  console.table(result.perSegment.map(({ segment, stored, figures, codeBlocks, sources, links }) => ({
    segment,
    stored,
    figures,
    codeBlocks,
    sources,
    links,
  })));
}
if (problems.length) {
  console.error("Mermaid e2e failed");
  process.exitCode = 1;
} else {
  console.log("Mermaid e2e passed");
}
