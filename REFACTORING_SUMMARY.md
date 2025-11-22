# Content Type Refactoring Summary

## Overview

This refactoring reorganizes the codebase around content types (text/articles and YouTube videos) to make it easy to add new content types in the future. The architecture uses a registry pattern that allows new content types to be added by simply creating a new directory and registering it.

## Architecture

### Server-Side Structure

```
server/src/contentTypes/
├── index.js                    # Main registry and processing functions
├── article/
│   ├── detector.js            # Detects if URL is an article
│   ├── processor.js           # Processes article URLs
│   └── index.js               # Exports article content type
└── video/
    ├── detector.js            # Detects if URL is a YouTube video
    ├── processor.js           # Processes video URLs
    └── index.js               # Exports video content type
```

### Client-Side Structure

```
client/src/contentTypes/
├── index.js                    # Main registry and rendering functions
├── article/
│   ├── renderer.jsx           # Renders article segments
│   └── index.js               # Exports article content type
└── video/
    ├── renderer.jsx           # Renders video segments
    └── index.js               # Exports video content type
```

## Key Changes

### Server (`server/src/index.js`)

- Removed direct imports of `processArticle` and `processVideo`
- Now uses `processContent()` from the content type registry
- Content type detection is handled automatically by the registry

### Client (`client/src/App.jsx`)

- Removed inline `renderArticle` and `renderVideo` functions
- Now uses `renderSegment()` and `getTrainingDescription()` from the content type registry
- All content-type-specific logic is now in the registry

### API (`api/html.mjs`)

- Updated to use `processContent()` from the content type registry
- Simplified content type detection logic

## How to Add a New Content Type

### 1. Create Server-Side Content Type

Create a new directory under `server/src/contentTypes/`:

```javascript
// server/src/contentTypes/podcast/detector.js
export const detectPodcast = (url) => {
  return /podcast\.example\.com/i.test(url);
};

// server/src/contentTypes/podcast/processor.js
export const processPodcast = async (url) => {
  // Your processing logic here
  return {
    type: "podcast",
    title: "...",
    sourceUrl: url,
    segments: [...],
    // ... other fields
  };
};

// server/src/contentTypes/podcast/index.js
import { detectPodcast } from "./detector.js";
import { processPodcast } from "./processor.js";

export const podcastContentType = {
  type: "podcast",
  detect: detectPodcast,
  process: processPodcast,
};
```

### 2. Register the Content Type

Add it to `server/src/contentTypes/index.js`:

```javascript
import { podcastContentType } from "./podcast/index.js";
// ... other imports

const contentTypes = [
  podcastContentType, // Add before article (more specific first)
  videoContentType,
  articleContentType, // Default/fallback should be last
];
```

### 3. Create Client-Side Renderer

Create a new directory under `client/src/contentTypes/`:

```javascript
// client/src/contentTypes/podcast/renderer.jsx
export const renderPodcast = (segment, training) => {
  return (
    <div className="podcast-segment">
      {/* Your rendering logic here */}
    </div>
  );
};

// client/src/contentTypes/podcast/index.js
import { renderPodcast } from "./renderer.jsx";

export const podcastContentType = {
  type: "podcast",
  render: renderPodcast,
  getDescription: (training) => {
    return `Podcast · ${training.segments.length} episodes`;
  },
};
```

### 4. Register the Client-Side Renderer

Add it to `client/src/contentTypes/index.js`:

```javascript
import { podcastContentType } from "./podcast/index.js";
// ... other imports

const contentTypes = [
  articleContentType,
  videoContentType,
  podcastContentType,
];
```

That's it! The new content type will automatically work with all existing functionality.

## Benefits

1. **Separation of Concerns**: Each content type is self-contained
2. **Easy Extension**: Adding new content types requires minimal changes
3. **Maintainability**: Content type logic is organized and easy to find
4. **Testability**: Each content type can be tested independently
5. **No Breaking Changes**: All existing functionality continues to work

## Migration Notes

- Old service files (`articleService.js`, `videoService.js`, `videoService.v2.js`) are still present but no longer used by the main application
- The test file has been updated to import from the new location
- The API endpoint (`api/html.mjs`) has been updated to use the new system

## Testing

All existing functionality should continue to work:
- Processing articles
- Processing YouTube videos
- Rendering segments
- Progress tracking
- Share links

Run the linter to verify:
```bash
npm run lint --prefix client
```

