# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sliced Learning is a full-stack application that transforms long-form content (articles and YouTube videos) into digestible training segments. The system consists of:

- **Client**: React/Vite frontend that displays segmented content with progress tracking
- **Server**: Express API that fetches and processes external content into timed segments

## Development Commands

### Getting Started
```bash
# Start backend server (must start first)
cd server
npm install
npm run dev  # Runs on port 4000

# Start frontend (in separate terminal)
cd client
npm install
npm run dev  # Runs on port 5173, proxies /api to port 4000
```

### Build & Lint
```bash
# Client
cd client
npm run build    # Production build
npm run lint     # ESLint check (required before commits)

# Server
cd server
npm start        # Production server
```

## Architecture

### Client Structure (`client/`)
- `src/App.jsx`: Main component handling URL input, content display, and progress tracking
- `src/App.css`: Primary styling for the UI components
- Uses React 19 with Vite for development and building

### Server Structure (`server/`)
- `src/index.js`: Express server with main `/api/process` endpoint that routes to appropriate service
- `src/services/articleService.js`: Processes articles using Mozilla Readability and segments by ~600 words (3-minute reads)
- `src/services/videoService.js`: Processes YouTube videos using ytdl-core and segments into 10-minute chunks
- `src/utils/`: Utility functions for content processing

### Key Dependencies
- **Client**: React 19, Vite, ESLint
- **Server**: Express, ytdl-core, @mozilla/readability, jsdom, axios

## Content Processing Flow

1. User submits URL via client interface
2. Server determines content type (YouTube vs article) using regex pattern matching
3. Appropriate service processes content:
   - Articles: Fetched, cleaned with Readability, segmented by word count
   - Videos: Metadata extracted, segmented by duration
4. Client receives structured segments and displays them with progress tracking

## Development Notes

- Server must run on port 4000 for client proxy configuration
- API endpoint: `POST /api/process` expects `{ url: string }`
- Health check available at `/health`
- No automated testing currently implemented - verify manually with sample URLs
- ESLint configuration enforces React best practices and hooks rules