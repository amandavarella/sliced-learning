// End-to-end check that tables reach the reader as tables and that code
// blocks get a copy button. Not run in CI, needs no network.
//
//   npm run build
//   npm run e2e:tables-copy
//
// Playwright answers three github.com URLs with fixtures and aborts every
// other https request, as e2e-mermaid.mjs does:
//
// - https://github.com/vitejs/vite: fixtures/github/repo-readme.html, a short
//   README with one small table.
// - https://github.com/mozilla/readability/blob/main/README.md:
//   fixtures/github/blob-readme.html, six highlighted code blocks with
//   GitHub's "Copy code to clipboard" buttons.
// - https://github.com/example/glossary: the repo-readme skeleton around a
//   40-row glossary table (bold acronyms, inline code), bigger than one
//   segment, like the private README that rendered as running text.
//
// In each reader it walks every segment and checks: tables render as table
// elements with complete rows (on the glossary, every segment with rows has
// a table with the header, and the rows add up to 40), no "Copy code to
// clipboard" text is shown, and each pre outside a Mermaid figure has a
// button[aria-label="Copy code"]. On the blob page it clicks the first button
// and checks the clipboard holds that block's code and the label turns to
// "Copied", then back to "Copy code" after two seconds.
//
// The temporary copy of dist/ also gets clipboardRead and clipboardWrite in
// its manifest so the check can read the clipboard; the shipped manifest
// needs neither for the button, which writes from a click.
//
// Environment: PLAYWRIGHT_MODULE, CHROMIUM_PATH and HEADED=1, as in
// e2e-smoke.mjs. SCREENSHOT_DIR=<dir> saves code-copy.png (light, button
// shown) plus code-copy-dark.png and code-copy-sepia.png.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const fixture = (name) => readFileSync(new URL(`../fixtures/github/${name}`, import.meta.url), "utf8");
const page = (title, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

const glossaryRows = Array.from(
  { length: 40 },
  (_, index) =>
    `<tr><td><strong>A${index}</strong></td><td>Acronym expansion number ${index}</td>` +
    `<td>Logging in with <code>token-${index}</code> and a short explanation of what it means in one line</td></tr>`,
).join("");
const GLOSSARY =
  `<article class="markdown-body entry-content container-lg" itemprop="text">` +
  `<div class="markdown-heading"><h1 class="heading-element">Glossary</h1></div>` +
  `<p>Terms used across the platform.</p>` +
  `<markdown-accessiblity-table><table><thead><tr><th>Acronym</th><th>Expansion</th><th>In one line</th></tr></thead>` +
  `<tbody>${glossaryRows}</tbody></table></markdown-accessiblity-table>` +
  `<p>End of glossary.</p></article>`;

// Same skeletons as src/extractors/testPages.js
const PAGES = [
  {
    name: "repo-readme",
    url: "https://github.com/vitejs/vite",
    html: page("GitHub - vitejs/vite", `<div id="readme">${fixture("repo-readme.html")}</div>`),
    expectTables: true,
  },
  {
    name: "blob-readme",
    url: "https://github.com/mozilla/readability/blob/main/README.md",
    html: page(
      "readability/README.md at main · mozilla/readability · GitHub",
      `<h1 id="file-name-id-wide">README.md</h1>${fixture("blob-readme.html")}`,
    ),
    expectCode: true,
    clickCopy: true,
  },
  {
    name: "glossary",
    url: "https://github.com/example/glossary",
    html: page("GitHub - example/glossary", `<div id="readme">${GLOSSARY}</div>`),
    expectTables: true,
    expectRows: 40,
    minSegments: 2,
  },
];

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
const workDir = mkdtempSync(join(tmpdir(), "sliced-learning-e2e-tables-copy-"));
const extensionDir = join(workDir, "extension");
const profileDir = join(workDir, "profile");

cpSync(dist, extensionDir, { recursive: true });
const manifestPath = join(extensionDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.host_permissions = [...(manifest.host_permissions || []), "https://github.com/*"];
// Test only: lets the check read back what the copy button wrote
manifest.permissions = [...new Set([...(manifest.permissions || []), "clipboardRead", "clipboardWrite"])];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const chromium = await loadPlaywright();
const context = await chromium.launchPersistentContext(profileDir, {
  headless: process.env.HEADED !== "1",
  executablePath: process.env.CHROMIUM_PATH || undefined,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
});

await context.route("https://**/*", (route) => {
  const match = PAGES.find((candidate) => candidate.url === route.request().url());
  if (match) {
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: match.html });
  }
  return route.abort();
});

const isReader = (candidate) => Boolean(candidate?.url().startsWith("chrome-extension://"));

const waitForReader = async (open) => {
  const known = new Set(context.pages());
  await open();
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const found = context.pages().find((candidate) => !known.has(candidate) && isReader(candidate));
    if (found) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The reader tab did not open");
};

// What the open segment shows
const inspectSegment = (reader) =>
  reader.locator(".article-segment-content").evaluate((article) => {
    const tables = Array.from(article.querySelectorAll("table"));
    const pres = Array.from(article.querySelectorAll("pre")).filter(
      (pre) => !pre.closest("figure.mermaid-diagram, details.mermaid-source"),
    );
    return {
      tables: tables.length,
      headers: tables.filter((table) => table.querySelector("thead th")).length,
      rows: tables.reduce((sum, table) => sum + table.querySelectorAll("tbody tr").length, 0),
      brokenRows: tables.reduce(
        (sum, table) =>
          sum +
          Array.from(table.querySelectorAll("tbody tr")).filter(
            (row) => row.children.length !== table.querySelector("tr").children.length,
          ).length,
        0,
      ),
      pres: pres.length,
      buttons: pres.filter((pre) => pre.parentElement.querySelector(':scope > button[aria-label="Copy code"]')).length,
      copyText: article.textContent.includes("Copy code to clipboard"),
    };
  });

const clickCopy = async (reader, problems) => {
  const block = reader.locator(".article-segment-content .code-block").first();
  const button = block.locator("button.code-copy-button");
  const expected = await block.locator("pre").evaluate((pre) => pre.textContent.replace(/\n$/, ""));
  await block.scrollIntoViewIfNeeded();
  const hidden = await button.evaluate((node) => getComputedStyle(node).opacity);
  if (Number(hidden) !== 0) problems.push(`button opacity ${hidden} before hover`);
  await block.hover();
  // Past the 0.15 s fade in
  await reader.waitForTimeout(250);
  const shown = await button.evaluate((node) => getComputedStyle(node).opacity);
  if (Number(shown) < 1) problems.push(`button opacity ${shown} on hover`);
  if (process.env.SCREENSHOT_DIR) {
    await block.screenshot({ path: join(process.env.SCREENSHOT_DIR, "code-copy.png") });
  }

  await button.click();
  await reader.waitForFunction(
    () => document.querySelector(".article-segment-content .code-copy-button")?.getAttribute("aria-label") === "Copied",
    null,
    { timeout: 3000 },
  ).catch(() => {});
  const after = await button.evaluate((node) => ({
    label: node.getAttribute("aria-label"),
    title: node.title,
    copiedClass: node.classList.contains("is-copied"),
    status: node.parentElement.querySelector(".code-copy-status")?.textContent,
  }));
  const clipboard = await reader.evaluate(() => navigator.clipboard.readText());
  if (clipboard !== expected) problems.push(`clipboard has ${JSON.stringify(clipboard)}, expected ${JSON.stringify(expected)}`);
  if (after.label !== "Copied" || after.title !== "Copied" || after.status !== "Copied") {
    problems.push(`after click: ${JSON.stringify(after)}`);
  }
  if (process.env.SCREENSHOT_DIR) {
    await block.screenshot({ path: join(process.env.SCREENSHOT_DIR, "code-copy-copied.png") });
  }
  await reader.waitForTimeout(2300);
  const reset = await button.getAttribute("aria-label");
  if (reset !== "Copy code") problems.push(`label after 2 s is ${reset}`);

  if (process.env.SCREENSHOT_DIR) {
    for (const theme of ["dark", "sepia"]) {
      await reader.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await block.hover();
      await reader.waitForTimeout(250);
      await block.screenshot({ path: join(process.env.SCREENSHOT_DIR, `code-copy-${theme}.png`) });
    }
    await reader.evaluate(() => delete document.documentElement.dataset.theme);
  }
  return { clipboard, label: after.label, reset };
};

const results = [];
let failed = false;
try {
  const worker =
    context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  // Chrome refuses a permission grant for a chrome-extension: origin, so grant
  // for every origin; the temporary manifest also asks for clipboard access
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  for (const target of PAGES) {
    const problems = [];
    const result = { page: target.name };
    results.push(result);
    try {
      const source = await context.newPage();
      await source.goto(target.url, { waitUntil: "domcontentloaded" });
      await source.waitForSelector("article.markdown-body");
      const reader = await waitForReader(() =>
        worker.evaluate(async (pageUrl) => {
          const [tab] = await chrome.tabs.query({ url: pageUrl });
          await globalThis.__handleActionClick(tab);
        }, target.url),
      );
      await reader.waitForSelector(".segment-item", { timeout: 30000 });

      const segmentCount = await reader.locator(".segment-item").count();
      const totals = { segments: segmentCount, tables: 0, headers: 0, rows: 0, brokenRows: 0, pres: 0, buttons: 0, copyText: false };
      for (let index = 0; index < segmentCount; index += 1) {
        await reader.locator(".segment-item .segment-trigger").nth(index).click();
        await reader.waitForTimeout(200);
        const counts = await inspectSegment(reader);
        totals.tables += counts.tables;
        totals.headers += counts.headers;
        totals.rows += counts.rows;
        totals.brokenRows += counts.brokenRows;
        totals.pres += counts.pres;
        totals.buttons += counts.buttons;
        totals.copyText ||= counts.copyText;
        if (target.expectRows && counts.rows && counts.tables !== counts.headers) {
          problems.push(`segment ${index + 1}: ${counts.tables} tables, ${counts.headers} with a header`);
        }
      }
      Object.assign(result, totals);

      if (target.expectTables && totals.tables < 1) problems.push("no table element in the reader");
      if (target.expectRows && totals.rows !== target.expectRows) problems.push(`${totals.rows} rows, expected ${target.expectRows}`);
      if (target.minSegments && segmentCount < target.minSegments) problems.push(`${segmentCount} segments, expected ${target.minSegments}+`);
      if (totals.brokenRows) problems.push(`${totals.brokenRows} rows with missing cells`);
      if (totals.copyText) problems.push('"Copy code to clipboard" shown in the reader');
      if (totals.buttons !== totals.pres) problems.push(`${totals.buttons} copy buttons for ${totals.pres} code blocks`);
      if (target.expectCode && totals.pres < 1) problems.push("no code block in the reader");

      if (target.clickCopy) {
        await reader.locator(".segment-item .segment-trigger").first().click();
        await reader.locator(".article-segment-content .code-block").first().waitFor({ timeout: 10000 });
        Object.assign(result, await clickCopy(reader, problems));
      }

      await reader.close();
      await source.close();
    } catch (error) {
      problems.push(String(error?.message || error));
    }
    result.ok = problems.length === 0;
    if (problems.length) {
      result.problems = problems;
      failed = true;
    }
    console.log(JSON.stringify(result));
  }
} finally {
  await context.close();
  rmSync(workDir, { recursive: true, force: true });
}

console.table(
  results.map(({ page: name, segments, tables, rows, pres, buttons, copyText, ok }) => ({
    page: name,
    segments,
    tables,
    rows,
    pres,
    buttons,
    copyText,
    ok,
  })),
);
if (failed) {
  console.error("Tables and copy e2e failed");
  process.exitCode = 1;
} else {
  console.log("Tables and copy e2e passed");
}
