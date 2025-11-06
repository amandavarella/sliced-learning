/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Fallbacks ensure good rendering without external fonts
        serif: ['"Source Serif Pro"', "Georgia", "Cambria", '"Times New Roman"', "Times", "serif"],
        sans: ['Inter', "system-ui", '"Segoe UI"', "Roboto", '"Helvetica Neue"', "Arial", "sans-serif"],
        mono: ['"JetBrains Mono"', "Menlo", "Consolas", "monospace"],
      },
      typography: ({ theme }) => ({
        mediumReader: {
          css: {
            maxWidth: "72ch",
            color: "#0f172a",                        /* slate-900 */
            a: {
              color: "#1d4ed8",
              textDecoration: "none",
              fontWeight: "500",
            },
            "a:hover": { textDecoration: "underline" },
            p: {
              fontFamily: theme("fontFamily.serif").join(","),
              lineHeight: "1.85",
              fontSize: "1.0625rem",
              marginBottom: "1.5rem",
            },
            h1: {
              fontFamily: theme("fontFamily.sans").join(","),
              fontWeight: "800",
              fontSize: "2.5rem",
              lineHeight: "1.2",
              letterSpacing: "-0.01em",
              marginTop: "0",
              marginBottom: "0.75rem",
            },
            h2: {
              fontFamily: theme("fontFamily.sans").join(","),
              fontWeight: "700",
              fontSize: "1.625rem",
              marginTop: "2.25rem",
              marginBottom: "0.75rem",
            },
            h3: {
              fontWeight: "700",
              marginTop: "1.75rem",
              marginBottom: "0.5rem",
            },
            strong: { fontWeight: "700" },
            em: { fontStyle: "italic" },
            blockquote: {
              fontStyle: "italic",
              color: "#334155",                    /* slate-700 */
              borderLeft: "4px solid #e5e7eb",     /* gray-200 */
              paddingLeft: "1rem",
              marginTop: "1.5rem",
              marginBottom: "1.5rem",
            },
            ul: { paddingLeft: "1.25rem" },
            ol: { paddingLeft: "1.25rem" },
            "ul > li::marker, ol > li::marker": { color: "#64748b" },  /* slate-500 */
            img: {
              marginTop: "1rem",
              marginBottom: "0.5rem",
              borderRadius: "0",
            },
            "figure img": { width: "100%" },
            figcaption: {
              textAlign: "center",
              color: "#64748b",                    /* slate-500 */
              fontSize: "0.95rem",
              marginBottom: "1rem",
            },
            hr: {
              borderColor: "#e5e7eb",              /* gray-200 */
              marginTop: "2rem",
              marginBottom: "2rem",
            },
            code: {
              fontFamily: theme("fontFamily.mono").join(","),
              backgroundColor: "#f8fafc",          /* slate-50 */
              color: "#0f172a",                    /* slate-900 */
              padding: "0.1em 0.35em",
              borderRadius: "0.25rem",
              fontSize: "0.95em",
            },
            pre: {
              backgroundColor: "#f8fafc",          /* slate-50 */
              color: "#0f172a",                    /* slate-900 */
              padding: "1rem 1.25rem",
              borderRadius: "0.5rem",
              overflowX: "auto",
            },
            "pre code": {
              backgroundColor: "transparent",
              padding: "0",
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
