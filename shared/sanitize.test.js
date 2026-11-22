import assert from "node:assert/strict";
import test from "node:test";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

import { createSanitizer, SANITIZE_CONFIG } from "./sanitize.js";

const sanitize = createSanitizer(createDOMPurify(new JSDOM("").window));

test("keeps details, summary and kbd from GitHub Markdown", () => {
  const html = sanitize(
    `<details><summary>More</summary><p>Inside</p></details><p>Press <kbd>Ctrl</kbd></p>`,
  );
  assert.equal(html, `<details><summary>More</summary><p>Inside</p></details><p>Press <kbd>Ctrl</kbd></p>`);
});

test("strips event handlers from the newly allowed tags", () => {
  const html = sanitize(`<details ontoggle="alert(1)"><summary onclick="alert(1)">S</summary></details><kbd onmouseover="x()">K</kbd>`);
  assert.equal(html, `<details><summary>S</summary></details><kbd>K</kbd>`);
});

test("keeps GitHub alert blocks as classed divs without their SVG icon", () => {
  const html = sanitize(
    `<div class="markdown-alert markdown-alert-note"><p class="markdown-alert-title"><svg class="octicon"><path d="M0 0"></path></svg>Note</p><p>Body</p></div>`,
  );
  assert.equal(html, `<div class="markdown-alert markdown-alert-note"><p class="markdown-alert-title">Note</p><p>Body</p></div>`);
});

test("still drops inputs, scripts and SVG", () => {
  const html = sanitize(
    `<ul><li class="task-list-item"><input type="checkbox" disabled checked> done</li></ul><script>alert(1)</script><svg><circle r="1"></circle></svg><iframe src="https://x.test"></iframe>`,
  );
  assert.equal(html, `<ul><li class="task-list-item"> done</li></ul>`);
});

test("keeps data: image sources and blocks javascript: links", () => {
  const html = sanitize(`<img src="data:image/png;base64,AAAA"><a href="javascript:alert(1)">x</a>`);
  assert.equal(html, `<img src="data:image/png;base64,AAAA"><a>x</a>`);
});

test("does not allow form controls", () => {
  for (const tag of ["input", "button", "form", "textarea", "select", "svg", "iframe", "script", "style"]) {
    assert.ok(!SANITIZE_CONFIG.ALLOWED_TAGS.includes(tag), `${tag} should not be allowed`);
  }
});
