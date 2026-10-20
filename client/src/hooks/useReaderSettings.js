import { useCallback, useEffect, useState } from "react";

// Keep in sync with the pre-paint script in index.html
export const READER_SETTINGS_KEY = "sliced-learning:reader-settings";

export const THEMES = ["system", "light", "sepia", "dark"];
export const READING_FONTS = ["sans", "serif"];
export const TEXT_SIZES = ["Small", "Medium", "Large", "Extra large"];

const DEFAULT_SETTINGS = {
  theme: "system",
  font: "sans",
  size: 1,
};

const THEME_COLORS = {
  light: "#f6f5fb",
  sepia: "#f4ecd8",
  dark: "#0f0d16",
};

const sanitize = (value = {}) => ({
  theme: THEMES.includes(value.theme) ? value.theme : DEFAULT_SETTINGS.theme,
  font: READING_FONTS.includes(value.font) ? value.font : DEFAULT_SETTINGS.font,
  size:
    Number.isInteger(value.size) && value.size >= 0 && value.size < TEXT_SIZES.length
      ? value.size
      : DEFAULT_SETTINGS.size,
});

const readSettings = () => {
  try {
    const raw = window.localStorage.getItem(READER_SETTINGS_KEY);
    return sanitize(raw ? JSON.parse(raw) : undefined);
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const writeSettings = (settings) => {
  try {
    window.localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); settings still apply for this visit
  }
};

const applySettings = ({ theme, font, size }) => {
  const root = document.documentElement;

  if (theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  root.dataset.readingFont = font;
  root.dataset.textSize = String(size);

  // Keep the mobile browser chrome in step with the chosen theme
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const media = meta.getAttribute("media") || "";
    const systemColor = media.includes("dark") ? THEME_COLORS.dark : THEME_COLORS.light;
    meta.setAttribute("content", theme === "system" ? systemColor : THEME_COLORS[theme]);
  });
};

/**
 * Reader display preferences (theme, reading font, text size), persisted per device.
 */
export const useReaderSettings = () => {
  const [settings, setSettings] = useState(readSettings);

  useEffect(() => {
    applySettings(settings);
    writeSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((patch) => {
    setSettings((previous) => sanitize({ ...previous, ...patch }));
  }, []);

  return [settings, updateSettings];
};
