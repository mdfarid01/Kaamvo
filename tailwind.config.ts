import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F1EFE8",
        // One step up from the canvas, for cards sitting on it.
        surface: "#F7F6F1",
        ink: "#2C2C2A",
        muted: "#6E6C64",
        // Lighter than muted — placeholders and other non-essential text.
        faint: "#9A978D",
        line: "#B4B2A9",
        // Hairline variant for internal dividers.
        "line-soft": "#D8D5CB",
        accent: "#D85A30",
        "accent-hover": "#C34D26",
        // Darkened accent for small text on an accent tint — #D85A30 and even
        // #C34D26 fall under 4.5:1 on a light tint; this clears it.
        "accent-deep": "#A33F1E",
        // Per-category icon tints. Deliberately desaturated and warm-leaning so
        // they read as a family with the canvas rather than a rainbow icon set —
        // each one is roughly canvas lightness with a single hue nudge.
        "category-pdf-bg": "#E4D3CA",
        "category-image-bg": "#CFDCD7",
        "category-text-bg": "#D4D9DE",
        "category-convert-bg": "#D9D5E0",
        "category-generate-bg": "#E5DCC3",
        "category-finance-bg": "#D6DCC9",
        "category-everyday-bg": "#DFD8CD",
      },
      borderRadius: {
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "8px",
        "2xl": "8px",
        "3xl": "8px",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderWidth: {
        hairline: "0.5px",
      },
      maxWidth: {
        content: "1100px",
      },
    },
  },
  plugins: [],
};

export default config;
