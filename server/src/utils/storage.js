import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const isVercel = Boolean(process.env.VERCEL);

const directoryName = path.dirname(fileURLToPath(import.meta.url));
const TRAINING_DIR = path.resolve(directoryName, "../../data/trainings");

const ensureDirectory = async () => {
  if (isVercel) {
    return;
  }
  await fs.mkdir(TRAINING_DIR, { recursive: true });
};

const trainingPath = (id) => {
  return path.join(TRAINING_DIR, `${id}.json`);
};

const memoryStore = (() => {
  if (!isVercel) {
    return null;
  }

  if (!globalThis.__trainingMemoryStore) {
    globalThis.__trainingMemoryStore = new Map();
  }

  return globalThis.__trainingMemoryStore;
})();

const writeRecord = async (record) => {
  if (isVercel) {
    memoryStore.set(record.id, record);
    return;
  }

  await ensureDirectory();
  await fs.writeFile(trainingPath(record.id), JSON.stringify(record, null, 2), "utf-8");
};

const readRecord = async (id) => {
  if (isVercel) {
    return memoryStore.get(id) || null;
  }

  try {
    const raw = await fs.readFile(trainingPath(id), "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

export const saveTraining = async (id, sourceUrl, payload, progress) => {
  const record = {
    id,
    sourceUrl,
    payload,
    progress: {
      ...progress,
      updatedAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
  };

  await writeRecord(record);
};

export const loadTraining = async (id) => {
  return readRecord(id);
};

export const updateTrainingProgress = async (id, sourceUrl, progressUpdate) => {
  const record = await readRecord(id);

  if (!record) {
    return null;
  }

  if (record.sourceUrl !== sourceUrl) {
    const mismatchError = new Error("Source URL mismatch");
    mismatchError.code = "SOURCE_MISMATCH";
    throw mismatchError;
  }

  const segments = Array.isArray(record.payload?.segments)
    ? record.payload.segments
    : [];

  const completedUpdate = Array.isArray(progressUpdate?.completed)
    ? progressUpdate.completed
    : record.progress?.completed || [];
  const normalizedCompleted = segments.map((_, index) =>
    Boolean(completedUpdate[index]),
  );

  const rawActiveIndex = Number.isInteger(progressUpdate?.activeIndex)
    ? progressUpdate.activeIndex
    : Number.isInteger(record.progress?.activeIndex)
    ? record.progress.activeIndex
    : 0;

  const maxIndex = Math.max(segments.length - 1, 0);
  const normalizedActiveIndex = Math.min(
    Math.max(rawActiveIndex, 0),
    maxIndex,
  );

  const nextRecord = {
    ...record,
    progress: {
      completed: normalizedCompleted,
      activeIndex: normalizedActiveIndex,
      updatedAt: new Date().toISOString(),
    },
  };

  await writeRecord(nextRecord);

  return nextRecord;
};
