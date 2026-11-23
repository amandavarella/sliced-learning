// Library builds for the service worker and the injected capture script, one
// entry per run (`vite build --mode background` or `--mode capture`). IIFE
// output has no import statements and no shared chunks, which the capture
// script needs because chrome.scripting injects it as a classic script.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

const ENTRIES = {
  background: "./src/background.js",
  capture: "./src/capture.js",
};

export default defineConfig(({ mode }) => {
  const entry = ENTRIES[mode];
  if (!entry) {
    throw new Error(`Unknown script build "${mode}". Use --mode background or --mode capture.`);
  }

  return {
    publicDir: false,
    build: {
      outDir: here("./dist"),
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      lib: {
        entry: here(entry),
        formats: ["iife"],
        name: `slicedLearning_${mode}`,
        fileName: () => `${mode}.js`,
      },
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    },
  };
});
