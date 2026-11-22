// chrome.storage.local layout:
//
//   capture:<key>   { title, html, sourceUrl, capturedAt, kind, stats, extraction }
//                   Written by the service worker on a toolbar click. The
//                   reader slices it into a training, or, when a training
//                   already exists, asks first and deletes it on "Continue".
//   training:<key>  { payload, progress, capturedAt, progressUpdatedAt, stats, extraction }
//                   The sliced training (the same shape the server returns
//                   from POST /api/process) plus the learner's progress.
//                   payload.sourceKind is the extractor's page kind
//                   (blob, wiki, issue...); stats are the image inlining
//                   counts from the capture. progressUpdatedAt is set on
//                   every progress save and orders the library.
//
// <key> is the normalised page URL from urlKey.js.
export const CAPTURE_PREFIX = "capture:";
export const TRAINING_PREFIX = "training:";

export const captureKey = (key) => `${CAPTURE_PREFIX}${key}`;
export const trainingKey = (key) => `${TRAINING_PREFIX}${key}`;

const area = () => chrome.storage.local;

const readOne = async (storageKey) => {
  const result = await area().get(storageKey);
  return result[storageKey] ?? null;
};

export const readCapture = (key) => readOne(captureKey(key));
export const writeCapture = (key, capture) => area().set({ [captureKey(key)]: capture });
export const deleteCapture = (key) => area().remove(captureKey(key));

export const readTraining = (key) => readOne(trainingKey(key));
export const writeTraining = (key, training) => area().set({ [trainingKey(key)]: training });
export const hasTraining = async (key) => Boolean(await readTraining(key));

// Every stored training as [key, value] pairs. Reads the whole area, which
// is fine for a personal library of tens of trainings.
export const readAllTrainings = async () => {
  const all = await area().get(null);
  return Object.entries(all)
    .filter(([storageKey]) => storageKey.startsWith(TRAINING_PREFIX))
    .map(([storageKey, value]) => [storageKey.slice(TRAINING_PREFIX.length), value]);
};

// Removes the training and any capture still waiting for it
export const deleteTrainingAndCapture = (key) => area().remove([trainingKey(key), captureKey(key)]);

// Bytes used by everything the extension stores (trainings, captures)
export const bytesInUse = () => area().getBytesInUse(null);
