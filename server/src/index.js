import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { processArticle } from "./services/articleService.js";
import { processVideo } from "./services/videoService.js";
import {
  saveTraining,
  loadTraining,
  updateTrainingProgress,
} from "./utils/storage.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const isYouTubeLink = (url) => /(youtube\.com|youtu\.be)/i.test(url);

const buildResponsePayload = (record, request) => {
  const segments = Array.isArray(record.payload?.segments)
    ? record.payload.segments
    : [];
  const progress = record.progress || {};

  const normalizedCompleted = segments.map((_, index) =>
    Boolean(progress.completed?.[index]),
  );
  const maxIndex = Math.max(segments.length - 1, 0);
  const rawActiveIndex = Number.isInteger(progress.activeIndex)
    ? progress.activeIndex
    : 0;
  const normalizedActiveIndex = Math.min(
    Math.max(rawActiveIndex, 0),
    maxIndex,
  );

  const shareApiUrl = `${request.protocol}://${request.get("host")}/api/training/${record.id}?source=${encodeURIComponent(record.sourceUrl)}`;

  return {
    ...record.payload,
    shareId: record.id,
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
    const payload = isYouTubeLink(trimmedUrl)
      ? await processVideo(trimmedUrl)
      : await processArticle(trimmedUrl);

    const progress = {
      completed: payload.segments.map(() => false),
      activeIndex: 0,
    };

    const shareId = crypto.randomUUID();
    const record = {
      id: shareId,
      sourceUrl: trimmedUrl,
      payload,
      progress,
    };

    await saveTraining(record.id, record.sourceUrl, record.payload, record.progress);

    response.json(buildResponsePayload(record, request));

  } catch (error) {
    console.error("Processing failed", error.message);
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
    const record = await loadTraining(id);

    if (!record) {
      response.status(404).json({ error: "Training not found." });
      return;
    }

    if (record.sourceUrl !== source) {
      response.status(403).json({ error: "Source URL mismatch." });
      return;
    }

    response.json(buildResponsePayload(record, request));
  } catch (error) {
    console.error("Unable to load training", error.message);
    response.status(500).json({ error: "Unable to load training." });
  }
});

app.patch("/api/training/:id/progress", async (request, response) => {
  const { id } = request.params;
  const source = String(request.query.source || "").trim();
  const { completed, activeIndex } = request.body || {};

  if (!source) {
    response.status(400).json({ error: "A source query parameter is required." });
    return;
  }

  try {
    const updated = await updateTrainingProgress(id, source, {
      completed,
      activeIndex,
    });

    if (!updated) {
      response.status(404).json({ error: "Training not found." });
      return;
    }

    response.json(buildResponsePayload(updated, request));
  } catch (error) {
    if (error.code === "SOURCE_MISMATCH") {
      response.status(403).json({ error: "Source URL mismatch." });
      return;
    }

    console.error("Unable to update training", error.message);
    response.status(500).json({ error: "Unable to update training." });
  }
});

app.use((_, response) => {
  response.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
