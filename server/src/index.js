import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { processArticle } from "./services/articleService.js";
import { processVideo } from "./services/videoService.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const isYouTubeLink = (url) => /(youtube\.com|youtu\.be)/i.test(url);

const buildResponsePayload = (
  payload,
  shareId,
  sourceUrl,
  request,
  progressOverrides = {},
) => {
  const segments = Array.isArray(payload?.segments) ? payload.segments : [];
  const normalizedCompleted = segments.map((_, index) =>
    Boolean(progressOverrides.completed?.[index]),
  );
  const maxIndex = Math.max(segments.length - 1, 0);
  const rawActiveIndex = Number.isInteger(progressOverrides.activeIndex)
    ? progressOverrides.activeIndex
    : 0;
  const normalizedActiveIndex = Math.min(
    Math.max(rawActiveIndex, 0),
    maxIndex,
  );

  const shareApiUrl = `${request.protocol}://${request.get("host")}/api/training/${shareId}?source=${encodeURIComponent(
    sourceUrl,
  )}`;

  return {
    ...payload,
    shareId,
    shareApiUrl,
    progress: {
      completed: normalizedCompleted,
      activeIndex: normalizedActiveIndex,
    },
  };
};

app.get("/health", (request, response) => {
  response.json({ status: "ok" });
});

app.post("/api/process", async (request, response) => {
  const { url } = request.body || {};

  if (!url) {
    response.status(400).json({ error: "A url field is required." });
    return;
  }

  try {
    const trimmedUrl = String(url).trim();

    console.info(`[api] /api/process request url=${trimmedUrl}`);
    const payload = isYouTubeLink(trimmedUrl)
      ? await processVideo(trimmedUrl)
      : await processArticle(trimmedUrl);

    const shareId = crypto.randomUUID();
    response.json(
      buildResponsePayload(
        payload,
        shareId,
        trimmedUrl,
        request,
        {
          completed: payload.segments.map(() => false),
          activeIndex: 0,
        },
      ),
    );

  } catch (error) {
    console.error("[api] Processing failed", error);
    response.status(500).json({
      error: "Unable to process the provided URL.",
      details: error.message,
    });
  }
});

app.get("/api/training/:id", async (request, response) => {
  const { id } = request.params;
  const source = String(request.query.source || "").trim();

  if (!source) {
    response.status(400).json({ error: "A source query parameter is required." });
    return;
  }

  try {
    console.info(`[api] /api/training/${id} source=${source}`);
    const payload = isYouTubeLink(source)
      ? await processVideo(source)
      : await processArticle(source);

    response.json(
      buildResponsePayload(payload, id, source, request, {
        completed: payload.segments.map(() => false),
        activeIndex: 0,
      }),
    );
  } catch (error) {
    console.error(`Unable to load training for ${id}`, error);
    response.status(500).json({ error: "Unable to load training." });
  }
});

app.use((_, response) => {
  response.status(404).json({ error: "Not found" });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

export default app;
