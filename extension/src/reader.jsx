import { createReaderApp } from "../../client/src/ReaderRoot.jsx";
import { extensionTrainingSource } from "./extensionTrainingSource.js";
import "./reader.css";
import "./githubSyntax.css";

// The web app applies saved display settings with an inline script before
// first paint. Extension pages forbid inline scripts, so do it here instead.
try {
  const saved = JSON.parse(localStorage.getItem("sliced-learning:reader-settings") || "{}");
  const root = document.documentElement;
  if (saved.theme && saved.theme !== "system") root.dataset.theme = saved.theme;
  if (saved.font) root.dataset.readingFont = saved.font;
  if (saved.size !== undefined) root.dataset.textSize = saved.size;
} catch {
  // Unreadable settings fall back to the defaults
}

createReaderApp(extensionTrainingSource, document.getElementById("root"));
