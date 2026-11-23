// Reading pace and slice size for articles. The server and the extension both
// read these so a training sliced in either place has the same sections.
export const WORDS_PER_MINUTE = 200;
export const SEGMENT_MINUTES = 2;
export const MAX_WORDS_PER_SEGMENT = WORDS_PER_MINUTE * SEGMENT_MINUTES;
