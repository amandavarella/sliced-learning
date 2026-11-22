// End-to-end smoke test for the unpacked extension. Not run in CI.
//
//   npm run build
//   npm run smoke
//
// It launches Chromium with dist/ loaded, opens a public GitHub README, drives
// the toolbar click through the service worker, and checks the reader slices
// the page, saves progress across a reload, reuses the reader tab on a second
// click, shows the unsupported message, and logs no console errors.
//
// Playwright cannot click the toolbar button, and a click driven from the
// service worker does not grant activeTab. So the test loads a copy of dist/
// whose manifest also has host access to github.com. The real build keeps
// activeTab only.
//
// Environment:
//   PLAYWRIGHT_MODULE  path to playwright's index.js when it is not resolvable
//                      from here (for example the repo root's node_modules)
//   CHROMIUM_PATH      Chromium or Chrome for Testing binary (optional)
//   HEADED=1           show the browser
//   SMOKE_URL          page to capture (default: the Readability README)
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SMOKE_URL =
  process.env.SMOKE_URL || "https://github.com/mozilla/readability/blob/main/README.md";
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

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const workDir = mkdtempSync(join(tmpdir(), "sliced-learning-smoke-"));
const extensionDir = join(workDir, "extension");
const profileDir = join(workDir, "profile");

cpSync(dist, extensionDir, { recursive: true });
const manifestPath = join(extensionDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.host_permissions = ["https://github.com/*"];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const chromium = await loadPlaywright();
const context = await chromium.launchPersistentContext(profileDir, {
  headless: process.env.HEADED !== "1",
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
  ],
});

const isReader = (page) => Boolean(page?.url().startsWith("chrome-extension://"));

// A new tab's page event can fire before it has navigated, so wait for the
// reader URL rather than filtering the event
const waitForReader = async (open) => {
  const known = new Set(context.pages());
  await open();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const page = context.pages().find((candidate) => !known.has(candidate) && isReader(candidate));
    if (page) {
      return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The reader tab did not open");
};
const readerErrors = [];
context.on("console", (message) => {
  if (message.type() === "error" && isReader(message.page())) {
    readerErrors.push(message.text());
  }
});
context.on("weberror", (error) => {
  if (isReader(error.page())) {
    readerErrors.push(String(error.error()));
  }
});

const results = {};
try {
  const worker =
    context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const extensionId = new URL(worker.url()).host;
  console.log(`Extension loaded: ${extensionId}`);

  const clickFor = (url) =>
    worker.evaluate(async (pageUrl) => {
      const [tab] = await chrome.tabs.query({ url: pageUrl });
      const opened = await globalThis.__handleActionClick(tab);
      return opened?.id ?? null;
    }, url);

  const source = await context.newPage();
  await source.goto(SMOKE_URL, { waitUntil: "domcontentloaded" });
  await source.waitForSelector("article.markdown-body", { timeout: 30000 });

  const reader = await waitForReader(() => clickFor(source.url()));
  console.log(`Reader opened: ${reader.url()}`);

  await reader.waitForSelector(".segment-item", { timeout: 15000 });
  const segmentCount = await reader.locator(".segment-item").count();
  results.segmentCount = segmentCount;
  results.title = await reader.title();
  assert(segmentCount >= MIN_SEGMENTS, `expected at least ${MIN_SEGMENTS} segments, got ${segmentCount}`);
  const bodyChars = (await reader.locator(".segment-body").innerText()).length;
  assert(bodyChars > 200, `segment body has only ${bodyChars} characters`);
  assert((await reader.locator('a[aria-label="Open original"]').count()) === 1, "Open original link missing");
  assert((await reader.locator("#url-input").count()) === 0, "URL form should be hidden");

  const stored = await worker.evaluate(() => chrome.storage.local.get(null));
  const keys = Object.keys(stored);
  results.storageKeys = keys;
  assert(keys.some((key) => key.startsWith("training:")), "no training:<key> stored");
  assert(!keys.some((key) => key.startsWith("capture:")), "capture:<key> should be deleted after slicing");

  await reader.click(".segment-footer .primary-button");
  await reader.waitForSelector(".segment-item.completed", { timeout: 5000 });
  await reader.waitForTimeout(500);
  const counterBefore = await reader.locator(".segment-counter").innerText();

  await reader.reload();
  await reader.waitForSelector(".segment-item", { timeout: 15000 });
  const counterAfter = await reader.locator(".segment-counter").innerText();
  const firstClass = await reader.locator(".segment-item").first().getAttribute("class");
  results.progressPersisted = counterAfter === counterBefore && firstClass.includes("completed");
  results.counter = counterAfter;
  assert(results.progressPersisted, `progress lost on reload (${counterBefore} vs ${counterAfter}, ${firstClass})`);

  // A second click on the same page focuses the open reader and keeps progress
  const pagesBefore = context.pages().length;
  await clickFor(source.url());
  await reader.waitForTimeout(500);
  results.secondClickReusedTab = context.pages().length === pagesBefore;
  assert(results.secondClickReusedTab, "second click opened another tab");
  await reader.reload();
  await reader.waitForSelector(".segment-item", { timeout: 15000 });
  assert(
    (await reader.locator(".segment-counter").innerText()) === counterBefore,
    "second click reset progress",
  );

  // Unsupported pages open the reader with a short message
  const unsupported = await waitForReader(() =>
    worker.evaluate(() => globalThis.__handleActionClick({ id: 1, url: "https://example.com/" })),
  );
  await unsupported.waitForSelector(".error-message", { timeout: 15000 });
  results.unsupportedMessage = await unsupported.locator(".error-message").innerText();

  results.consoleErrors = readerErrors;
  assert(readerErrors.length === 0, `reader console errors: ${readerErrors.join(" | ")}`);

  console.log(JSON.stringify(results, null, 2));
  console.log("Smoke test passed");
} catch (error) {
  console.error(JSON.stringify({ ...results, consoleErrors: readerErrors }, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await context.close();
  rmSync(workDir, { recursive: true, force: true });
}
