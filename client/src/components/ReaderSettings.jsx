import { useEffect, useId, useRef, useState } from "react";
import { TEXT_SIZES } from "../hooks/useReaderSettings.js";
import { BookIcon, MonitorIcon, MoonIcon, SunIcon } from "./Icons.jsx";

const THEME_OPTIONS = [
  { value: "system", label: "Auto", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "sepia", label: "Sepia", Icon: BookIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
];

const FONT_OPTIONS = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
];

const ReaderSettings = ({ settings, onChange, showTypography = true }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const ActiveThemeIcon =
    THEME_OPTIONS.find((option) => option.value === settings.theme)?.Icon ?? MonitorIcon;

  return (
    <div className="reader-settings" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="reader-settings-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Display settings"
        title="Display settings"
        onClick={() => setOpen((value) => !value)}
      >
        {showTypography ? <span className="reader-settings-aa">Aa</span> : <ActiveThemeIcon />}
      </button>

      {open && (
        <div className="reader-settings-panel" id={panelId} role="dialog" aria-label="Display settings">
          <fieldset className="reader-settings-group">
            <legend>Theme</legend>
            <div className="segmented is-4">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`segmented-option theme-swatch is-${option.value}`}
                  aria-pressed={settings.theme === option.value}
                  onClick={() => onChange({ theme: option.value })}
                >
                  <option.Icon />
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          {showTypography && (
            <>
              <fieldset className="reader-settings-group">
                <legend>Font</legend>
                <div className="segmented">
                  {FONT_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      className={`segmented-option font-option is-${value}`}
                      aria-pressed={settings.font === value}
                      onClick={() => onChange({ font: value })}
                    >
                      <span className="font-sample" aria-hidden="true">
                        Ag
                      </span>
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="reader-settings-group">
                <legend>Text size</legend>
                <div className="size-stepper">
                  <button
                    type="button"
                    className="size-button is-smaller"
                    aria-label="Smaller text"
                    disabled={settings.size === 0}
                    onClick={() => onChange({ size: settings.size - 1 })}
                  >
                    A
                  </button>
                  <div className="size-track" aria-live="polite">
                    <span className="size-label">{TEXT_SIZES[settings.size]}</span>
                    <span className="size-dots" aria-hidden="true">
                      {TEXT_SIZES.map((label, index) => (
                        <span key={label} className={index <= settings.size ? "is-filled" : ""} />
                      ))}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="size-button is-larger"
                    aria-label="Larger text"
                    disabled={settings.size === TEXT_SIZES.length - 1}
                    onClick={() => onChange({ size: settings.size + 1 })}
                  >
                    A
                  </button>
                </div>
              </fieldset>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ReaderSettings;
