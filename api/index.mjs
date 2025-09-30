import path from "path";
import { fileURLToPath } from "url";
import Module from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverNodeModules = path.resolve(__dirname, "../server/node_modules");

if (!Module._nodeModulePaths(process.cwd()).includes(serverNodeModules)) {
  process.env.NODE_PATH = [
    serverNodeModules,
    process.env.NODE_PATH || "",
  ]
    .filter(Boolean)
    .join(path.delimiter);
  Module._initPaths();
}

const appModule = await import("../server/src/index.js");

export default appModule.default;
