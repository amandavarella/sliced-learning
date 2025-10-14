import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";

import { processArticle } from "./articleService.js";

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Sample Article</title>
  </head>
  <body>
    <main>
      <article>
        <header>
          <h1>Sample Article With Images</h1>
        </header>
        <figure>
          <img src="/images/hero.jpg" alt="Hero" />
          <figcaption>Hero caption</figcaption>
        </figure>
        <p>
          This is the introduction paragraph for the article body. It provides a
          handful of sentences so the readability heuristic has something
          substantial to work with when scoring the main content.
        </p>
        <p>
          <img
            data-src="https://cdn.example.com/photos/inline.png"
            alt="Inline"
            loading="lazy"
          />
          Inline image content continues here with additional context. The text
          continues for a while to ensure the paragraph has enough weight to be
          treated as primary content by the parser.
        </p>
        <p>
          <picture>
            <source srcset="/images/figure.webp 1x, /images/figure@2x.webp 2x" type="image/webp" />
            <img
              src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
              data-src="/images/figure.jpg"
              data-srcset="/images/figure.jpg 1x, /images/figure@2x.jpg 2x"
              alt="Lazy"
            />
          </picture>
          Captioned image content is included below the picture element. Even
          more narrative follows, padding the example so the resulting DOM looks
          closer to a real article layout that mixes prose and media.
        </p>
        <p>
          Additional supporting text ensures the article is longer than a single
          screenful. That helps verify that segmenting logic still works once we
          introduce richer image handling for lazy-loaded content.
        </p>
        <figure>
          <div role="button" tabindex="0">
            <span>Press enter or click to view image in full size</span>
            <div>
              <picture>
                <source srcset="/images/agentic.webp 1x, /images/agentic@2x.webp 2x" type="image/webp" />
                <source srcset="/images/agentic.png 1x, /images/agentic@2x.png 2x" />
                <img src="" alt="Agentic diagram" width="700" height="326" loading="lazy" />
              </picture>
            </div>
          </div>
          <figcaption>Agentic workflow diagram</figcaption>
        </figure>
      </article>
    </main>
  </body>
</html>`;

test("processArticle normalizes image sources", async (t) => {
  const originalGet = axios.get;
  axios.get = async () => ({ data: FIXTURE_HTML });

  t.after(() => {
    axios.get = originalGet;
  });

  const result = await processArticle("https://example.com/articles/sample");

  assert.equal(result.type, "article");
  assert.ok(result.segments.length > 0, "expected at least one segment");

  const combinedHtml = result.segments
    .map((segment) => segment.html || "")
    .join("");

  assert.match(
    combinedHtml,
    /<img[^>]+src="https:\/\/example.com\/images\/hero.jpg"/,
    "hero image should use absolute src",
  );

  assert.match(
    combinedHtml,
    /<img[^>]+src="https:\/\/cdn.example.com\/photos\/inline.png"/,
    "inline image should retain remote url",
  );

  assert.match(
    combinedHtml,
    /<img[^>]+src="https:\/\/example.com\/images\/figure.jpg"/,
    "lazy image should promote data-src to src",
  );

  assert.match(
    combinedHtml,
    /srcset="https:\/\/example.com\/images\/figure.jpg 1x, https:\/\/example.com\/images\/figure@2x.jpg 2x"/,
    "lazy image srcset should be normalized",
  );

  assert.match(
    combinedHtml,
    /<figure>[\s\S]*<img[^>]+src="https:\/\/example.com\/images\/agentic\.(?:png|webp)"/,
    "picture-wrapped image should receive a usable src",
  );

  assert.match(
    combinedHtml,
    /Agentic workflow diagram/,
    "figure caption should be retained",
  );

  assert.match(
    combinedHtml,
    /<figcaption>Hero caption<\/figcaption>/,
    "figure caption should remain in output",
  );
});
