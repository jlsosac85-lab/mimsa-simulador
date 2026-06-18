import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        mimsa: {
          green: "#94C11E",
          greenDark: "#6F9213",
          greenSoft: "#C6E07F",
          greenLight: "#F4F9E7",
          black: "#1C1C1A",
          carbon: "#2C2C2A",
          gray: "#5F5E5A",
          grayLight: "#888780",
          line: "#E5E5DC",
          bg: "#FAFAF7",
          bgAlt: "#F4F3EE",
          // Capas HUD (modo oscuro futurista, manteniendo el verde MIMSA)
          deep: "#0E100B",
          panel: "#15170F",
          panelHi: "#1C1F15",
          edge: "#2E3322",
        },
        alert: {
          red: "#A32D2D",
          redLight: "#FCEBEB",
          amber: "#EF9F27",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "var(--font-inter)", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(148,193,30,0.25), 0 0 18px -2px rgba(148,193,30,0.35)",
        "glow-sm": "0 0 10px -1px rgba(148,193,30,0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
