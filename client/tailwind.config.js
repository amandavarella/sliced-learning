/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Fallbacks ensure good rendering without external fonts
        serif: ['"Source Serif Pro"', "Georgia", "Cambria", "Times New Roman", "Times", "serif"],
        sans: ['Inter', "system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ['"JetBrains Mono"', "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      colors: {
        ink: {
          DEFAULT: "#e6e6e6", // light text for dark UI
          soft: "#c9c9c9",
          faint: "#a5a5a5",
        },
        paper: {
          DEFAULT: "#0f172a", // slate-900 backdrop
          inset: "#111827",
        },
        accent: {
          link: "#93c5fd",     // calm blue
          linkHover: "#bfdbfe",
          quote: "#94a3b8",    // slate-400
          hr: "#1f2937",       // gray-800
        },
      },
      typography: ({ theme }) => ({
        substack: {
          css: {
            // container
            maxWidth: "72ch",
            color: theme("colors.ink.DEFAULT"),
            a: {
              color: theme("colors.accent.link"),
              textDecoration: "none",
              fontWeight: "500",
            },
            "a:hover": {
              textDecoration: "underline",
              color: theme("colors.accent.linkHover"),
            },
            h1: {
              fontFamily: theme("fontFamily.sans").join(","),
              fontWeight: "800",
              letterSpacing: "-0.02em",
              lineHeight: "1.15",
              marginTop: "0",
              marginBottom: "0.75em",
            },
            h2: {
              fontFamily: theme("fontFamily.sans").join(","),
              fontWeight: "700",
              marginTop: "2em",
              marginBottom: "0.75em",
            },
            h3: { fontWeight: "700", marginTop: "1.75em" },
            p: {
              fontFamily: theme("fontFamily.serif").join(","),
              lineHeight: "1.85",
              fontSize: "1.05rem",
            },
            strong: { fontWeight: "700" },
            em: { fontStyle: "italic" },
            code: {
              fontFamily: theme("fontFamily.mono").join(","),
              backgroundColor: "#0b1220",
              padding: "0.1em 0.35em",
              borderRadius: "0.25rem",
              fontSize: "0.95em",
            },
            pre: {
              backgroundColor: "#0b1220",
              borderRadius: "0.5rem",
              padding: "1rem 1.25rem",
              overflowX: "auto",
            },
            "pre code": {
              backgroundColor: "transparent",
              padding: "0",
            },
            blockquote: {
              fontStyle: "italic",
              borderLeftColor: theme("colors.accent.quote"),
              borderLeftWidth: "4px",
              paddingLeft: "1rem",
              color: theme("colors.ink.soft"),
            },
            hr: {
              borderColor: theme("colors.accent.hr"),
              marginTop: "2rem",
              marginBottom: "2rem",
            },
            ul: { paddingLeft: "1.25rem" },
            ol: { paddingLeft: "1.25rem" },
            "ul > li::marker, ol > li::marker": { color: theme("colors.ink.faint") },
            img: {
              borderRadius: "0.5rem",
              marginTop: "1.25rem",
              marginBottom: "0.75rem",
            },
            "figure img": { marginTop: "1.5rem", marginBottom: "0.5rem" },
            figcaption: {
              textAlign: "center",
              color: theme("colors.ink.faint"),
              fontSize: "0.9rem",
              marginBottom: "1rem",
            },
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
