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
      },
      animation: {
        shake: "shake 0.55s ease-in-out",
      },
      colors: {
        brand: {
          orange: "#FF7E33",
          grass: "#22C55E",
          "grass-light": "#86EFAC",
          text: "#1E293B",
        }
      },
    },
  },
  plugins: [],
};

export default config;
