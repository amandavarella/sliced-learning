// "23 Nov 2026" for an ISO date, or "" when it is missing or invalid
export const formatShortDate = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

// "23 Nov 2026, 14:05"
export const formatShortDateTime = (value) => {
  const day = formatShortDate(value);
  if (!day) {
    return "";
  }
  const time = new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
};
