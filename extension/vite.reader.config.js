// App build for the reader page. It imports the React client from
// ../client/src, which would otherwise resolve react from client/node_modules.
// The aliases pin react and react-dom (and their subpaths, such as
// react/jsx-runtime) to this package's copy so the bundle holds one React.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("./src"),
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      react: here("./node_modules/react"),
      "react-dom": here("./node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: here("./dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: here("./src/reader.html"),
    },
  },
});
