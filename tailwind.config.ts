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
      },
      animation: {
        shake: "shake 0.55s ease-in-out",
        "tp-glow-pulse": "tp-glow-pulse 2s ease-in-out infinite",
        "ht-pulse": "ht-pulse 2s ease-in-out infinite",
        "logo-burst": "logo-burst 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
      },
      colors: {
        ht: {
          canvas: "var(--ht-canvas)",
          surface: "var(--ht-surface)",
          elevated: "var(--ht-elevated)",
          "elevated-2": "var(--ht-elevated-2)",
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
          rose: {
            300: "#fda4af",
            400: "#fb7185",
            500: "#f43f5e",
          },
          exit: {
            from: "#a93d3a",
            via: "#c8573e",
            to: "#e9784e",
            text: "#fff7ea",
            border: "#1c2b3a",
          },
        },
      },
      backgroundColor: {
        "ht-canvas": "var(--ht-canvas)",
        "ht-surface": "var(--ht-surface)",
        "ht-elevated": "var(--ht-elevated)",
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
