/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // --- Legacy light-theme tokens (casewright-implementation-plan.md §9) ---
        // Kept in place, untouched, until every screen that still uses them is re-skinned
        // per casewright-ui-redesign-plan.md's screen-at-a-time migration (§10/§11). Do not
        // delete until Phase 5 (T5.5–T5.7) has migrated every consumer — remove in T5.8.
        ink: "#16233A",
        paper: "#FBFBF9",
        slate: "#5B6B7F",
        hairline: "#E3E7EC",
        oxblood: "#7A1F2B",
        "verdict-met": "#1E7A4F",
        "verdict-partial": "#B0770A",
        "verdict-partial-text": "#8F6208",
        "verdict-gap": "#B3372F",

        // --- Dark token system (casewright-ui-redesign-plan.md §3) ---
        // "border"/"border-strong" map to the plan's --hairline/--hairline-strong CSS vars —
        // renamed only at the Tailwind-class level to avoid colliding with the legacy
        // "hairline" key above (which stays light for as-yet-unmigrated screens). The CSS
        // variables themselves are named --hairline/--hairline-strong exactly as spec'd.
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--hairline)",
        "border-strong": "var(--hairline-strong)",
        text: "var(--text)",
        "text-dim": "var(--text-dim)",
        "text-faint": "var(--text-faint)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        met: "var(--met)",
        partial: "var(--partial)",
        gap: "var(--gap)",
        run: "var(--run)",
      },
      fontFamily: {
        display: ["Source Serif 4", "serif"],
        sans: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      borderRadius: {
        card: "var(--radius-card)",
        control: "var(--radius-control)",
        pill: "var(--radius-pill)",
      },
      spacing: {
        18: "4.5rem", // 72px — used for the collapsed 56px+ paddings around the icon rail
      },
      boxShadow: {
        elevated: "var(--shadow-elevated)",
      },
      transitionTimingFunction: {
        casewright: "var(--ease)",
      },
      transitionDuration: {
        hover: "120ms",
        reveal: "200ms",
        panel: "320ms",
      },
      keyframes: {
        shimmer: {
          "0%, 100%": { opacity: "0.03" },
          "50%": { opacity: "0.07" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
