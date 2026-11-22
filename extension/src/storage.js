// chrome.storage.local layout:
//
//   capture:<key>   { title, html, sourceUrl, capturedAt }
//                   Written by the service worker on a toolbar click, read
//                   and deleted by the reader once it has sliced it.
//   training:<key>  { payload, progress, capturedAt }
//                   The sliced training (the same shape the server returns
//                   from POST /api/process) plus the learner's progress.
//
// <key> is the normalised page URL from urlKey.js.
export const captureKey = (key) => `capture:${key}`;
export const trainingKey = (key) => `training:${key}`;

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
