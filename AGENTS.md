# Repository Guidelines

## Project Structure & Module Organization
The repo is split between a Vite-driven client (`client/`) and an Express API (`server/`). React views live in `client/src` with UI assets under `client/src/assets` and shared styles in `client/src/App.css` and `client/src/index.css`. Backend request logic sits in `server/src/services/`, while reusable helpers belong in `server/src/utils/`; keep HTTP handlers slim inside `server/src/index.js`.

## Build, Test, and Development Commands
Run `npm install` separately in `client/` and `server/` after cloning. Use `npm run dev` inside `server/` to launch the API on port 4000, then `npm run dev` inside `client/` to start the Vite frontend on port 5173 with API proxying. For production assets, run `npm run build` in `client/`; start the API with `npm start` in `server/`. Run `npm run lint` in `client/` before submitting a change to catch JSX or hooks issues early.

## Coding Style & Naming Conventions
Follow the ESLint config shipped in `client/eslint.config.js`; lint errors block builds. Use two-space indentation, `PascalCase` component files (`SegmentList.jsx`), and `camelCase` hooks and utilities (`renderArticle`). Prefer small, pure functions and derived state via React hooks, mirroring existing patterns in `App.jsx`. Server modules should export async functions named for their intent (`processArticle`, `processVideo`) so they wire cleanly to the router.

## Testing Guidelines
Automated tests are not yet present; rely on linting plus manual verification. After code changes, hit `/health` to confirm the server responds, then process a long-form article and a YouTube URL to validate slicing. When adding tests, colocate them next to the code (`client/src/Feature.test.jsx` or `server/src/services/videoService.test.js`) and name them after the module under test.

## Commit & Pull Request Guidelines
Write imperative, concise commit subjects (~60 chars) that describe the change, e.g., `Add video segment progress bar`. Group related client and server edits into separate commits for easier review. PRs should include a short summary, testing notes (lint, manual URLs), and screenshots or GIFs when the UI shifts. Link back to tracker issues with `Closes #123` and call out configuration changes or new env vars explicitly.
