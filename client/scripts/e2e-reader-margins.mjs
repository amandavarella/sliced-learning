// End-to-end check for the draggable reading margins. Not run in CI.
//
//   cd server && npm run dev     (port 4000)
//   cd client && npm run dev     (port 5173)
//   cd client && npm run e2e:margins
//
// It opens an article training, drags the left handle 200px right and the
// right handle 150px left, and checks that: the card edges moved by those
// amounts; the card got narrower and its text reflowed onto more lines; the
// margins survive a reload; the keyboard moves an edge by 16px; a
// double-click on a handle and the "Reset margins" button both restore the
// default layout; and the handles are hidden on a narrow viewport.
//
// Environment:
//   PLAYWRIGHT_MODULE  path to playwright's index.mjs when it is not resolvable
//                      from here (for example the repo root's node_modules)
//   CHROMIUM_PATH      Chromium or Chrome for Testing binary (optional)
//   BASE_URL           client URL (default http://localhost:5173)
//   ARTICLE_URL        article to slice (default: Wikipedia, Photosynthesis)
//   SCREENSHOT         path for a screenshot taken after the drag (optional)
//   HEADED=1           show the browser
import { pathToFileURL } from "node:url";

const BASE_URL = process.env.BASE_URL || "http://localhost:5173";
const ARTICLE_URL = process.env.ARTICLE_URL || "https://en.wikipedia.org/wiki/Photosynthesis";
const SETTINGS_KEY = "sliced-learning:reader-settings";
const TOLERANCE = 2;

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
  console.log(`ok - ${message}`);
};

const near = (actual, expected) => Math.abs(actual - expected) <= TOLERANCE;

const measure = (page) =>
  page.evaluate(() => {
    const card = document.querySelector(".segment-view").getBoundingClientRect();
    const paragraph = document.querySelector(".article-segment-content p");
    return {
      left: card.left,
      right: card.right,
      width: card.width,
      paragraphHeight: paragraph?.getBoundingClientRect().height ?? 0,
      hasMargins: document.querySelector("main.content").classList.contains("has-margins"),
    };
  });

const storedMargins = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").margins ?? null, SETTINGS_KEY);

const drag = async (page, selector, dx) => {
  const box = await page.locator(selector).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 300);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(x + (dx * step) / 10, y);
  }
  await page.mouse.up();
};

const chromium = await loadPlaywright();
const browser = await chromium.launch({
  headless: !process.env.HEADED,
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${BASE_URL}/?source=${encodeURIComponent(ARTICLE_URL)}&segment=0`);
  await page.waitForSelector(".segment-view .article-segment-content p", { timeout: 60000 });
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...saved, margins: null }));
  }, SETTINGS_KEY);
  await page.reload();
  await page.waitForSelector(".segment-view .article-segment-content p", { timeout: 60000 });
  await page.waitForSelector(".margin-handle.is-left");

  const before = await measure(page);
  assert(!before.hasMargins, "default layout has no margins class");
  assert(
    (await page.locator(".margin-handle").count()) === 2,
    "two margin handles are rendered",
  );

  await drag(page, ".margin-handle.is-left", 200);
  await drag(page, ".margin-handle.is-right", -150);
  const after = await measure(page);
  console.log("before", before, "after", after);

  assert(after.hasMargins, "content gets the has-margins class after a drag");
  assert(near(after.left, before.left + 200), `left edge moved 200px right (${before.left} -> ${after.left})`);
  assert(near(after.right, before.right - 150), `right edge moved 150px left (${before.right} -> ${after.right})`);
  assert(near(after.width, before.width - 350), `card is 350px narrower (${before.width} -> ${after.width})`);
  assert(
    after.paragraphHeight > before.paragraphHeight,
    `text reflowed onto more lines (paragraph ${before.paragraphHeight}px -> ${after.paragraphHeight}px)`,
  );
  const saved = await storedMargins(page);
  assert(saved && Number.isInteger(saved.left) && Number.isInteger(saved.right), `margins saved ${JSON.stringify(saved)}`);

  if (process.env.SCREENSHOT) {
    await page.screenshot({ path: process.env.SCREENSHOT });
    console.log(`screenshot: ${process.env.SCREENSHOT}`);
  }

  await page.reload();
  await page.waitForSelector(".segment-view .article-segment-content p", { timeout: 60000 });
  const reloaded = await measure(page);
  assert(
    near(reloaded.left, after.left) && near(reloaded.right, after.right),
    `margins survive a reload (${reloaded.left}, ${reloaded.right})`,
  );

  await page.locator(".margin-handle.is-left").focus();
  await page.keyboard.press("ArrowRight");
  const keyed = await measure(page);
  assert(near(keyed.left, reloaded.left + 16), "ArrowRight on the left handle moves the edge 16px");
  assert(
    (await page.locator(".segment-counter").textContent()).includes("Segment 1 /"),
    "arrow key on a handle does not change segment",
  );

  await page.locator(".margin-handle.is-right").dblclick();
  const reset = await measure(page);
  assert(!reset.hasMargins, "double-click removes the margins class");
  assert(near(reset.left, before.left) && near(reset.right, before.right), "double-click restores the default card position");
  assert((await storedMargins(page)) === null, "double-click stores margins as null");

  await drag(page, ".margin-handle.is-left", 120);
  await page.locator(".sidebar .reader-settings-trigger").click();
  const resetButton = page.getByRole("button", { name: "Reset margins" });
  assert(await resetButton.isEnabled(), "Reset margins is enabled when margins are set");
  await resetButton.click();
  assert((await storedMargins(page)) === null, "Reset margins clears the stored margins");
  assert(await resetButton.isDisabled(), "Reset margins is disabled once margins are cleared");
  await page.keyboard.press("Escape");

  await drag(page, ".margin-handle.is-left", 2000);
  const clamped = await measure(page);
  assert(clamped.width >= 360 - TOLERANCE, `card never narrower than 360px (${clamped.width})`);

  await page.setViewportSize({ width: 700, height: 900 });
  await page.waitForTimeout(200);
  assert((await page.locator(".margin-handle").count()) === 0, "handles are hidden under 720px");
  assert(!(await measure(page)).hasMargins, "stored margins are ignored under 720px");

  assert(errors.length === 0, `no page errors (${errors.join("; ")})`);
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
