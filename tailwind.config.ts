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
          green: "#94C11C",
          greenDark: "#6F9213",
          greenLight: "#F4F9E7",
          black: "#1C1C1A",
          carbon: "#2C2C2A",
          gray: "#5F5E5A",
          grayLight: "#888780",
          line: "#E5E5DC",
          bg: "#FAFAF7",
          bgAlt: "#F4F3EE",
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
      },
    },
  },
  plugins: [],
};

export default config;
