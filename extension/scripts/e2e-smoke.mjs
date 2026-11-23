// End-to-end smoke test for the unpacked extension. Not run in CI.
//
//   npm run build
//   npm run smoke
//
// It launches Chromium with dist/ loaded, opens a public GitHub README, drives
// the toolbar click through the service worker, and checks that the reader:
// slices the page with its title, kind and Google Fonts; saves progress
// across a reload; lists the training in the Library; on a second click
// reuses the tab and offers Continue (keeps progress) or Re-slice (resets
// it); re-slices on ?reslice=1; deletes from the Library after a confirm;
// shows the unsupported message with a link back; and logs no console errors.
//
// Playwright cannot click the toolbar button, and a click driven from the
// service worker does not grant activeTab. So the test loads a copy of dist/
// whose manifest also has host access to github.com. The real build reaches
// github.com through activeTab only.
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
manifest.host_permissions = [...(manifest.host_permissions || []), "https://github.com/*"];
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
  // Only Confluence trainings get the wide layout
  assert((await reader.locator("main.content.is-wide").count()) === 0, "GitHub training should not use the wide layout");
  results.description = await reader.locator(".segment-meta").first().innerText();
  assert(results.description.startsWith("GitHub file · "), `description lacks the kind: ${results.description}`);
  assert(results.title === (await reader.locator(".segment-header h2").innerText()), "document.title is not the training title");

  // The Google Fonts stylesheet loads under the extension page CSP
  results.fonts = await reader.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts]
      .filter((face) => face.status === "loaded")
      .map((face) => face.family.replace(/"/g, ""));
    return {
      bodyFontFamily: getComputedStyle(document.body).fontFamily,
      bodyFontSize: getComputedStyle(document.body).fontSize,
      loadedFamilies: [...new Set(loaded)],
      stylesheet: [...document.styleSheets].some((sheet) => sheet.href?.startsWith("https://fonts.googleapis.com/")),
    };
  });
  assert(results.fonts.bodyFontFamily.includes("Inter"), `body font is ${results.fonts.bodyFontFamily}`);
  assert(results.fonts.loadedFamilies.includes("Inter"), `Inter did not load: ${results.fonts.loadedFamilies}`);
  // Chrome's default extension stylesheet sets body to system-ui at 75%; reader.css undoes it
  assert(results.fonts.bodyFontSize === "16px", `body font size is ${results.fonts.bodyFontSize}`);

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

  const trainingKey = keys.find((key) => key.startsWith("training:"));
  const storedProgress = async () => {
    const all = await worker.evaluate(() => chrome.storage.local.get(null));
    return {
      completed: all[trainingKey]?.progress?.completed?.filter(Boolean).length ?? null,
      hasCapture: Object.keys(all).some((key) => key.startsWith("capture:")),
    };
  };

  // A second click on the same page focuses and reloads the open reader,
  // which offers to continue the saved training or re-slice the new capture
  const pagesBefore = context.pages().length;
  await clickFor(source.url());
  await reader.waitForSelector(".capture-banner", { timeout: 15000 });
  results.secondClickReusedTab = context.pages().length === pagesBefore;
  assert(results.secondClickReusedTab, "second click opened another tab");
  results.bannerText = await reader.locator(".capture-banner-text").innerText();
  assert(results.bannerText.startsWith("Saved training from "), `banner text: ${results.bannerText}`);
  assert((await storedProgress()).hasCapture, "second click stored no capture");

  await reader.click('.capture-banner button:has-text("Continue")');
  await reader.waitForSelector(".capture-banner", { state: "detached", timeout: 5000 });
  assert(!(await storedProgress()).hasCapture, "Continue left the capture behind");
  await reader.reload();
  await reader.waitForSelector(".segment-item", { timeout: 15000 });
  assert((await reader.locator(".capture-banner").count()) === 0, "banner came back after Continue");
  assert(
    (await reader.locator(".segment-counter").innerText()) === counterBefore,
    "Continue lost progress",
  );
  results.continueKeptProgress = true;

  // A third click, then Re-slice: the training is sliced again from scratch
  await clickFor(source.url());
  await reader.waitForSelector(".capture-banner", { timeout: 15000 });
  await reader.click('.capture-banner button:has-text("Re-slice")');
  await reader.waitForSelector(".capture-banner", { state: "detached", timeout: 15000 });
  await reader.waitForTimeout(300);
  const afterReslice = await storedProgress();
  results.resliceCounter = await reader.locator(".segment-counter").innerText();
  assert(results.resliceCounter.startsWith("Segment 1 /"), `Re-slice kept the position: ${results.resliceCounter}`);
  assert((await reader.locator(".segment-item.completed").count()) === 0, "Re-slice kept completed segments");
  assert(afterReslice.completed === 0 && !afterReslice.hasCapture, `Re-slice storage: ${JSON.stringify(afterReslice)}`);
  results.resliceResetProgress = true;

  // ?reslice=1 re-slices the waiting capture without asking, then drops the flag
  await reader.click(".segment-footer .primary-button");
  await reader.waitForSelector(".segment-item.completed", { timeout: 5000 });
  await reader.waitForTimeout(300);
  await clickFor(source.url());
  await reader.waitForSelector(".capture-banner", { timeout: 15000 });
  await reader.goto(`${reader.url()}&reslice=1`);
  await reader.waitForSelector(".segment-item", { timeout: 15000 });
  await reader.waitForTimeout(300);
  results.resliceParam = {
    banner: await reader.locator(".capture-banner").count(),
    completed: await reader.locator(".segment-item.completed").count(),
    url: new URL(reader.url()).search,
    stored: await storedProgress(),
  };
  assert(
    results.resliceParam.banner === 0 &&
      results.resliceParam.completed === 0 &&
      !results.resliceParam.url.includes("reslice") &&
      results.resliceParam.stored.completed === 0 &&
      !results.resliceParam.stored.hasCapture,
    `?reslice=1 did not re-slice: ${JSON.stringify(results.resliceParam)}`,
  );

  // Progress for the Library check: one segment done
  await reader.click(".segment-footer .primary-button");
  await reader.waitForSelector(".segment-item.completed", { timeout: 5000 });
  await reader.waitForTimeout(300);

  // An older Confluence training, written by hand, to check the order and the badge
  const olderKey = "https://mock.atlassian.net/wiki/spaces/TEST/pages/1";
  await worker.evaluate(
    (key) =>
      chrome.storage.local.set({
        [`training:${key}`]: {
          payload: {
            type: "article",
            title: "Older Confluence page",
            sourceUrl: key,
            sourceKind: "confluence",
            segmentMinutes: 2,
            totalSegments: 2,
            segments: [
              { id: "a", label: "One", html: "<p>One</p>" },
              { id: "b", label: "Two", html: "<p>Two</p>" },
            ],
          },
          progress: { completed: [true, true], activeIndex: 1 },
          capturedAt: "2026-01-01T00:00:00.000Z",
          progressUpdatedAt: "2026-01-02T00:00:00.000Z",
        },
      }),
    olderKey,
  );

  // The brand button goes back to the Library, which lists both, newest first
  await reader.click(".sidebar .brand-button");
  await reader.waitForSelector(".library-item", { timeout: 15000 });
  assert(new URL(reader.url()).search === "", `library URL keeps a query: ${reader.url()}`);
  results.library = await reader.evaluate(() =>
    [...document.querySelectorAll(".library-item")].map((item) => ({
      title: item.querySelector(".library-title")?.textContent,
      badge: item.querySelector(".type-pill")?.textContent,
      kind: item.querySelector(".library-kind")?.textContent,
      stats: item.querySelector(".progress-stats")?.textContent,
      href: item.querySelector(".library-link")?.getAttribute("href"),
    })),
  );
  results.libraryStats = await reader.locator(".library-stat").allInnerTexts();
  const [first, second] = results.library;
  assert(results.library.length === 2, `library rows: ${results.library.length}`);
  assert(first.title === results.title && first.badge === "GitHub" && first.kind === "GitHub file", `first row: ${JSON.stringify(first)}`);
  assert(first.stats.startsWith(`1 of ${segmentCount} done`), `first row stats: ${first.stats}`);
  assert(second.badge === "Confluence" && second.stats.startsWith("2 of 2 done"), `second row: ${JSON.stringify(second)}`);
  assert(results.libraryStats.some((text) => text.startsWith("Storage used")), "no storage figure");

  // A row opens its training
  await reader.click(".library-item .library-link >> nth=0");
  await reader.waitForSelector(".segment-item", { timeout: 15000 });
  assert((await reader.title()) === results.title, "library row opened the wrong training");
  await reader.click(".sidebar .brand-button");
  await reader.waitForSelector(".library-item", { timeout: 15000 });

  // Delete asks first; Cancel keeps the row, Delete removes training and capture
  await clickFor(source.url());
  await reader.waitForTimeout(500);
  const libraryPage = await context.newPage();
  await libraryPage.goto(`chrome-extension://${extensionId}/reader.html`);
  await libraryPage.waitForSelector(".library-item", { timeout: 15000 });
  const deleteButton = libraryPage.locator(`.library-item:has-text("${results.title}") button:has-text("Delete")`);
  await deleteButton.click();
  await libraryPage.click('.library-item button:has-text("Cancel")');
  assert((await libraryPage.locator(".library-item").count()) === 2, "Cancel removed a row");
  await deleteButton.click();
  await libraryPage.click(".library-delete");
  await libraryPage.waitForFunction(() => document.querySelectorAll(".library-item").length === 1, null, {
    timeout: 5000,
  });
  const afterDelete = Object.keys(await worker.evaluate(() => chrome.storage.local.get(null)));
  results.afterDeleteKeys = afterDelete;
  assert(
    !afterDelete.includes(trainingKey) && !afterDelete.some((key) => key.startsWith(`capture:`)),
    `delete left keys behind: ${afterDelete}`,
  );
  await libraryPage.click('.library-item button:has-text("Delete")');
  await libraryPage.click(".library-delete");
  await libraryPage.waitForSelector(".library-empty", { timeout: 5000 });
  results.emptyLibrary = await libraryPage.locator(".library-empty h2").innerText();
  await libraryPage.close();

  // Unsupported pages open the reader with a short message
  const unsupported = await waitForReader(() =>
    worker.evaluate(() => globalThis.__handleActionClick({ id: 1, url: "https://example.com/" })),
  );
  await unsupported.waitForSelector(".error-message", { timeout: 15000 });
  results.unsupportedMessage = await unsupported.locator(".error-message").innerText();
  assert(
    results.unsupportedMessage.includes("github.com") && results.unsupportedMessage.includes("Confluence"),
    `unsupported message: ${results.unsupportedMessage}`,
  );
  await unsupported.click('a:has-text("Back to your library")');
  await unsupported.waitForSelector(".library-empty", { timeout: 15000 });
  results.unsupportedLinksToLibrary = true;

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
