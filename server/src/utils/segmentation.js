const WORD_PATTERN = /\s+/g;

const splitIntoParagraphs = (text) => {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
};

const wordsIn = (text) => {
  if (!text) {
    return 0;
  }
  return text.trim().split(WORD_PATTERN).filter(Boolean).length;
};

const toSegment = (parts, wordCount) => ({
  text: parts.join("\n\n"),
  wordCount,
});

const chunkList = (items, maxWordsPerSegment) => {
  const segments = [];
  let currentParts = [];
  let currentCount = 0;

  for (const item of items) {
    const itemWordCount = wordsIn(item);

    if (currentCount && currentCount + itemWordCount > maxWordsPerSegment) {
      segments.push(toSegment(currentParts, currentCount));
      currentParts = [];
      currentCount = 0;
    }

    currentParts.push(item);
    currentCount += itemWordCount;
  }

  if (currentParts.length) {
    segments.push(toSegment(currentParts, currentCount));
  }

  if (!segments.length && items.length) {
    const joined = items.join(" ");
    segments.push(toSegment([joined], wordsIn(joined)));
  }

  return segments;
};

export const chunkByWordGoal = (text, maxWordsPerSegment) => {
  const paragraphs = splitIntoParagraphs(text);

  if (!paragraphs.length) {
    const sentences = text
      .split(/[\.!?]\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    return chunkList(sentences, maxWordsPerSegment);
  }

  return chunkList(paragraphs, maxWordsPerSegment);
};

export const buildTimingSegments = (totalSeconds, secondsPerSegment) => {
  const segments = [];
  const totalSegments = Math.max(1, Math.ceil(totalSeconds / secondsPerSegment));

  for (let index = 0; index < totalSegments; index += 1) {
    const startSeconds = index * secondsPerSegment;
    const endSeconds = Math.min(totalSeconds, startSeconds + secondsPerSegment);

    segments.push({
      id: `segment-${index + 1}`,
      label: `Module ${index + 1}`,
      startSeconds,
      endSeconds,
      durationSeconds: endSeconds - startSeconds,
    });
  }

  return segments;
};
