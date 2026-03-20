import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Playfair Display'", "Georgia", "serif"],
        body: ["'Source Serif 4'", "Georgia", "serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        ink: {
          950: "#0d0f14",
          900: "#131620",
          800: "#1b1f2e",
          700: "#242840",
          600: "#2e3352",
        },
        amber: {
          gold: "#c9922a",
          warm: "#e8b86d",
          pale: "#f5dfa8",
        },
        slate: {
          muted: "#8892a4",
          light: "#b8c2d4",
        },
      },
    },
  },
  plugins: [],
};

export default config;
