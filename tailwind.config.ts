import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "15%": { transform: "translateX(-8px)" },
          "30%": { transform: "translateX(8px)" },
          "45%": { transform: "translateX(-6px)" },
          "60%": { transform: "translateX(6px)" },
          "75%": { transform: "translateX(-4px)" },
          "90%": { transform: "translateX(4px)" },
        },
        "tp-glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(6, 182, 212, 0.45)" },
          "50%": { boxShadow: "0 0 0 6px rgba(6, 182, 212, 0)" },
        },
        "ht-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "logo-burst": {
          "0%": { transform: "scale(0.02)" },
          "70%": { transform: "scale(1.1)" },
          "100%": { transform: "scale(1)" },
        },
        "logo-press": {
          "0%": { transform: "scale(1)" },
          "100%": { transform: "scale(1.18)" },
        },
        "logo-release": {
          "0%": { transform: "scale(1.18)" },
          "35%": { transform: "scale(0.91)" },
          "60%": { transform: "scale(1.06)" },
          "80%": { transform: "scale(0.97)" },
          "100%": { transform: "scale(1)" },
        },
        // HightopLoader (docs/partner-dashboard-merch-button-loader-speed-plan.md, Phase 3).
        // Entrance (`logo-arrive*`, 0.95s, runs once) then an endless two-hop loop
        // (`logo-hop*`/`logo-spin`, 2.6s) whose spin alternates direction: one full
        // clockwise turn on the first hop, a held pause on landing, one full
        // counter-clockwise turn on the second. Transform/opacity only (compositor-only,
        // smooth on phones); per-keyframe `animationTimingFunction` supplies the gravity.
        // `logo-hop*` is applied to an `origin-bottom` element (the squash anchors to the
        // ground) and `logo-spin` to an `origin-center` child, so the two never fight.
        "logo-arrive": {
          "0%": {
            opacity: "0",
            transform: "translateY(-105%) scaleX(0.55) scaleY(0.78)",
            animationTimingFunction: "cubic-bezier(0.5, 0, 0.8, 0.35)",
          },
          "38%": {
            opacity: "1",
            transform: "translateY(0) scaleX(1) scaleY(1)",
            animationTimingFunction: "cubic-bezier(0.25, 0, 0.5, 1)",
          },
          "46%": { transform: "translateY(0) scaleX(1.22) scaleY(0.74)" },
          "60%": { transform: "translateY(-22%) scaleX(0.94) scaleY(1.1)" },
          "74%": { transform: "translateY(0) scaleX(1.12) scaleY(0.9)" },
          "86%": { transform: "translateY(-7%) scaleX(0.98) scaleY(1.03)" },
          "100%": { opacity: "1", transform: "translateY(0) scaleX(1) scaleY(1)" },
        },
        "logo-arrive-spin": {
          "0%": { transform: "rotate(-320deg)", animationTimingFunction: "cubic-bezier(0.3, 0, 0.45, 1)" },
          "38%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
        "logo-arrive-shadow": {
          "0%": { opacity: "0", transform: "scaleX(0.3)" },
          "30%": { opacity: "0.12", transform: "scaleX(0.62)" },
          "46%": { opacity: "0.5", transform: "scaleX(1.15)" },
          "60%": { opacity: "0.2", transform: "scaleX(0.72)" },
          "74%": { opacity: "0.45", transform: "scaleX(1.08)" },
          "100%": { opacity: "0.32", transform: "scaleX(1)" },
        },
        "logo-hop": {
          "0%": { transform: "translateY(0) scaleX(1) scaleY(1)" },
          "5%": { transform: "translateY(0) scaleX(1.16) scaleY(0.82)" },
          "9%": {
            transform: "translateY(-7%) scaleX(0.92) scaleY(1.12)",
            animationTimingFunction: "cubic-bezier(0.18, 0.7, 0.35, 1)",
          },
          "24%": {
            transform: "translateY(-45%) scaleX(1) scaleY(1)",
            animationTimingFunction: "cubic-bezier(0.55, 0, 0.85, 0.4)",
          },
          "36%": { transform: "translateY(0) scaleX(0.95) scaleY(1.06)" },
          "39%": { transform: "translateY(0) scaleX(1.18) scaleY(0.8)" },
          "42%": { transform: "translateY(-4%) scaleX(0.99) scaleY(1.02)" },
          "44%": { transform: "translateY(0) scaleX(1) scaleY(1)" },
          "50%": { transform: "translateY(0) scaleX(1) scaleY(1)" },
          "55%": { transform: "translateY(0) scaleX(1.16) scaleY(0.82)" },
          "59%": {
            transform: "translateY(-7%) scaleX(0.92) scaleY(1.12)",
            animationTimingFunction: "cubic-bezier(0.18, 0.7, 0.35, 1)",
          },
          "74%": {
            transform: "translateY(-45%) scaleX(1) scaleY(1)",
            animationTimingFunction: "cubic-bezier(0.55, 0, 0.85, 0.4)",
          },
          "86%": { transform: "translateY(0) scaleX(0.95) scaleY(1.06)" },
          "89%": { transform: "translateY(0) scaleX(1.18) scaleY(0.8)" },
          "92%": { transform: "translateY(-4%) scaleX(0.99) scaleY(1.02)" },
          "94%": { transform: "translateY(0) scaleX(1) scaleY(1)" },
          "100%": { transform: "translateY(0) scaleX(1) scaleY(1)" },
        },
        "logo-spin": {
          "0%, 9%": { transform: "rotate(0deg)", animationTimingFunction: "cubic-bezier(0.3, 0, 0.4, 1)" },
          "36%, 59%": { transform: "rotate(360deg)", animationTimingFunction: "cubic-bezier(0.3, 0, 0.4, 1)" },
          "86%, 100%": { transform: "rotate(0deg)" },
        },
        "logo-hop-shadow": {
          "0%": { opacity: "0.32", transform: "scaleX(1)" },
          "5%": { opacity: "0.4", transform: "scaleX(1.12)" },
          "9%": { opacity: "0.36", transform: "scaleX(1.05)" },
          "24%": { opacity: "0.1", transform: "scaleX(0.5)" },
          "36%": { opacity: "0.32", transform: "scaleX(1)" },
          "39%": { opacity: "0.42", transform: "scaleX(1.15)" },
          "44%, 50%": { opacity: "0.32", transform: "scaleX(1)" },
          "55%": { opacity: "0.4", transform: "scaleX(1.12)" },
          "59%": { opacity: "0.36", transform: "scaleX(1.05)" },
          "74%": { opacity: "0.1", transform: "scaleX(0.5)" },
          "86%": { opacity: "0.32", transform: "scaleX(1)" },
          "89%": { opacity: "0.42", transform: "scaleX(1.15)" },
          "94%, 100%": { opacity: "0.32", transform: "scaleX(1)" },
        },
        "logo-pulse": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        shake: "shake 0.55s ease-in-out",
        "tp-glow-pulse": "tp-glow-pulse 2s ease-in-out infinite",
        "ht-pulse": "ht-pulse 2s ease-in-out infinite",
        "logo-burst": "logo-burst 1.1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "logo-press": "logo-press 0.15s ease-out forwards",
        "logo-release": "logo-release 0.55s ease-out forwards",
        // HightopLoader: entrance once, then the hop/spin loop takes over at 0.95s.
        // The loop is listed last so it wins the composite transform once it starts.
        "logo-loader-body": "logo-arrive 0.95s ease-out both, logo-hop 2.6s linear 0.95s infinite",
        "logo-loader-spin": "logo-arrive-spin 0.95s ease-out both, logo-spin 2.6s linear 0.95s infinite",
        "logo-loader-shadow": "logo-arrive-shadow 0.95s ease-out both, logo-hop-shadow 2.6s linear 0.95s infinite",
        "logo-pulse": "logo-pulse 1.6s ease-in-out infinite",
      },
      colors: {
        ht: {
          canvas: "var(--ht-canvas)",
          surface: "var(--ht-surface)",
          elevated: "var(--ht-elevated)",
          "elevated-2": "var(--ht-elevated-2)",
          "store-paper": "var(--ht-store-paper)",
          "border-hairline": "var(--ht-border-hairline)",
          "border-soft": "var(--ht-border-soft)",
          "border-strong": "var(--ht-border-strong)",
          "fg-primary": "var(--ht-fg-primary)",
          "fg-secondary": "var(--ht-fg-secondary)",
          "fg-muted": "var(--ht-fg-muted)",
          "fg-dim": "var(--ht-fg-dim)",
          cyan: {
            50: "#ecfeff",
            200: "#a5f3fc",
            300: "#67e8f9",
            400: "#22d3ee",
            500: "#06b6d4",
            600: "#0891b2",
          },
          emerald: {
            200: "#a7f3d0",
            300: "#6ee7b7",
            400: "#34d399",
            500: "#10b981",
            600: "#059669",
          },
          amber: {
            200: "#fde68a",
            300: "#fcd34d",
            400: "#fbbf24",
            500: "#f59e0b",
          },
          fuchsia: {
            200: "#f5d0fe",
            300: "#f0abfc",
            400: "#e879f9",
            500: "#d946ef",
          },
          indigo: {
            300: "#a5b4fc",
            400: "#818cf8",
            500: "#6366f1",
          },
          rose: {
            300: "#fda4af",
            400: "#fb7185",
            500: "#f43f5e",
          },
        },
      },
      backgroundColor: {
        "ht-canvas": "var(--ht-canvas)",
        "ht-surface": "var(--ht-surface)",
        "ht-elevated": "var(--ht-elevated)",
        "ht-store-paper": "var(--ht-store-paper)",
      },
      backgroundImage: {
        "ht-game-live": "var(--ht-game-live)",
        "ht-game-blitz": "var(--ht-game-blitz)",
        "ht-game-billing": "var(--ht-game-billing)",
        "ht-game-display": "var(--ht-game-display)",
      },
      borderColor: {
        "ht-hairline": "var(--ht-border-hairline)",
        "ht-soft": "var(--ht-border-soft)",
        "ht-strong": "var(--ht-border-strong)",
      },
      textColor: {
        "ht-primary": "var(--ht-fg-primary)",
        "ht-secondary": "var(--ht-fg-secondary)",
        "ht-muted": "var(--ht-fg-muted)",
      },
      boxShadow: {
        "ht-card": "var(--ht-shadow-card)",
        "ht-modal": "var(--ht-shadow-modal)",
        "ht-glow-cyan": "var(--ht-shadow-glow-cyan)",
      },
      borderRadius: {
        "ht-sm": "var(--ht-radius-sm)",
        "ht-md": "var(--ht-radius-md)",
        "ht-lg": "var(--ht-radius-lg)",
        "ht-xl": "var(--ht-radius-xl)",
        "ht-2xl": "var(--ht-radius-2xl)",
        "ht-pill": "var(--ht-radius-pill)",
      },
    },
  },
  plugins: [],
};

export default config;
