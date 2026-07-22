/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16233A",
        paper: "#FBFBF9",
        slate: "#5B6B7F",
        hairline: "#E3E7EC",
        oxblood: "#7A1F2B",
        "verdict-met": "#1E7A4F",
        "verdict-partial": "#B0770A",
        "verdict-partial-text": "#8F6208",
        // #B0770A on paper is 3.7:1 — fine for borders/badges (3:1 threshold) but fails
        // WCAG AA for body text (4.5:1). Use verdict-partial-text (5.2:1) for actual
        // paragraph/list text; keep verdict-partial for borders, pills, and chips.
        "verdict-gap": "#B3372F",
      },
      fontFamily: {
        display: ["Source Serif 4", "serif"],
        sans: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
