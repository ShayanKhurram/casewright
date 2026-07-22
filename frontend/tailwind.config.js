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
        // rgb(var(--x-rgb) / <alpha-value>) (not a bare `var(--x)` hex string) so that Tailwind
        // opacity modifiers (`bg-accent/40`, `ring-run/10`, ...) actually emit CSS — Tailwind
        // can only vary alpha on a color it can decompose into channels. `border`/`border-strong`
        // are left as bare hex/rgba vars since --hairline is already a fixed-alpha rgba and
        // isn't used with a modifier.
        bg: "rgb(var(--bg-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2-rgb) / <alpha-value>)",
        border: "var(--hairline)",
        "border-strong": "var(--hairline-strong)",
        text: "rgb(var(--text-rgb) / <alpha-value>)",
        "text-dim": "rgb(var(--text-dim-rgb) / <alpha-value>)",
        "text-faint": "rgb(var(--text-faint-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        "accent-hover": "rgb(var(--accent-hover-rgb) / <alpha-value>)",
        met: "rgb(var(--met-rgb) / <alpha-value>)",
        partial: "rgb(var(--partial-rgb) / <alpha-value>)",
        gap: "rgb(var(--gap-rgb) / <alpha-value>)",
        run: "rgb(var(--run-rgb) / <alpha-value>)",
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
        "reveal-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s ease-in-out infinite",
        // References the --duration-reveal/--ease CSS vars directly in the shorthand (Tailwind
        // just inserts this string as the `animation` property value) so it automatically
        // respects tokens.css's prefers-reduced-motion zeroing — no separate media query needed
        // here. Used for progressive-reveal entrances (criterion cards, RFE objections, draft
        // sections) per redesign plan §6.
        "reveal-up": "reveal-up var(--duration-reveal) var(--ease) both",
      },
    },
  },
  plugins: [],
};
