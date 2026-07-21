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
