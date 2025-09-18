# Sliced Learning

This project provides a two-part experience for turning long-form content into a modular training journey.

- **server/**: Express API that fetches articles or YouTube metadata and slices them into 3-minute (articles) or 10-minute (videos) segments.
- **client/**: React interface where learners progress through segments, mark them as complete, and track progress.

## Getting Started

Open two terminals and run the following commands from the project root:

```bash
cd server
npm install
npm run dev
```

```bash
cd client
npm install
npm run dev
```

The client dev server proxies `/api` calls to `http://localhost:4000`, so start the backend first. Visit `http://localhost:5173` to load the UI.

> **Note:** The server fetches external content. Provide valid URLs and ensure outbound network access is allowed in your environment.

## How It Works

1. Paste an article or YouTube URL.
2. The backend classifies the link and slices the content into timed segments.
3. The UI displays each segment as a training module with progress indicators and a "Next" workflow.

## Testing

- Use long-form articles to verify segmentation around every ~600 words.
- Try a variety of YouTube links to confirm the 10-minute segmenting behavior.

## Folder Scripts

- `server`: `npm run dev` (nodemon) and `npm start` for production.
- `client`: `npm run dev` for Vite, `npm run build` to create a production bundle.
