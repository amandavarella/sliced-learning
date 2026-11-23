// Copies the manifest and toolbar icons into dist/ after the Vite builds.
import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const dist = here("../dist/");

mkdirSync(dist, { recursive: true });
cpSync(here("../src/manifest.json"), `${dist}manifest.json`);
cpSync(here("../src/icons"), `${dist}icons`, { recursive: true });
console.log("Copied manifest.json and icons into dist/");
