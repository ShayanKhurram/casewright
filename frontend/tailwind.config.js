/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // --- Dark token system (casewright-ui-redesign-plan.md §3) ---
        // "border"/"border-strong" map to the plan's --hairline/--hairline-strong CSS vars.
        // rgb(var(--x-rgb) / <alpha-value>) (not a bare `var(--x)` hex string) so that Tailwind
        // opacity modifiers (`bg-accent/40`, `ring-run/10`, ...) actually emit CSS — Tailwind
        // can only vary alpha on a color it can decompose into channels. `border`/`border-strong`
        // are left as bare hex/rgba vars since --hairline is already a fixed-alpha rgba and
        // isn't used with a modifier.
        //
        // The legacy light-theme tokens (ink/paper/slate/hairline/oxblood/verdict-*) that lived
        // here through the T5.1–T5.7 rollout were removed in T5.8, once a repo-wide grep for
        // every one of them (across src/pages and src/components) came back empty — every
        // screen is now on the dark system, so there was nothing left for them to protect.
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
        // WCAG-safe variants added in T5.8's contrast audit — see tokens.css for the exact
        // ratios each one fixes.
        "accent-text": "rgb(var(--accent-text-rgb) / <alpha-value>)",
        met: "rgb(var(--met-rgb) / <alpha-value>)",
        partial: "rgb(var(--partial-rgb) / <alpha-value>)",
        gap: "rgb(var(--gap-rgb) / <alpha-value>)",
        "gap-fill": "rgb(var(--gap-fill-rgb) / <alpha-value>)",
        run: "rgb(var(--run-rgb) / <alpha-value>)",
        "run-text": "rgb(var(--run-text-rgb) / <alpha-value>)",
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
