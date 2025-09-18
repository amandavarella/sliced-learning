# Sliced Learning

Transform long-form content (articles and YouTube videos) into digestible, trackable training segments with embedded media and progress sharing.

- **server/**: Express API that processes articles and YouTube videos into optimized learning segments
- **client/**: React interface with embedded video players, rich article rendering, and shareable progress tracking

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

## Features

### Content Processing
- **Articles**: Preserves HTML formatting with smart segmentation (~400 words per 2-minute segment)
- **YouTube Videos**: Creates 10-minute segments with embedded players and timestamp controls
- **Rich Media Support**: Handles images, code blocks, lists, and other formatting elements

### Learning Experience
- **Embedded Video Playback**: YouTube videos play directly in the interface with automatic start/end times
- **Progress Tracking**: Visual progress bar and segment completion status
- **Shareable Sessions**: Generate links to share training progress with others
- **Responsive Design**: Optimized layout for focused learning

## How It Works

1. **Submit Content**: Paste an article or YouTube URL into the interface
2. **Automatic Processing**: Backend intelligently segments content based on type and optimal reading/viewing times
3. **Interactive Learning**: Progress through segments with embedded media, complete tracking, and easy navigation
4. **Share Progress**: Generate shareable links to collaborate or continue sessions across devices

## Testing

### Article Processing
- Test with long-form articles to verify HTML preservation and ~400-word segmentation
- Verify rich content handling (images, code blocks, lists, blockquotes)
- Check responsive layout with various content types

### Video Processing
- Try various YouTube links to confirm 10-minute segmentation
- Test embedded video playback with start/end timestamps
- Verify video fallback handling for edge cases

### Progress Features
- Test progress persistence across browser sessions
- Verify shareable link generation and loading
- Check progress synchronization between shared sessions

## Folder Scripts

- `server`: `npm run dev` (nodemon) and `npm start` for production.
- `client`: `npm run dev` for Vite, `npm run build` to create a production bundle.
