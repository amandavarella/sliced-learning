import express from "express";
import cors from "cors";
import { processArticle } from "./services/articleService.js";
import { processVideo } from "./services/videoService.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const isYouTubeLink = (url) => /(youtube\.com|youtu\.be)/i.test(url);

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

    response.json(payload);
  } catch (error) {
    console.error("Processing failed", error.message);
    response.status(500).json({
      error: "Unable to process the provided URL.",
      details: error.message,
    });
  }
});

app.use((_, response) => {
  response.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
