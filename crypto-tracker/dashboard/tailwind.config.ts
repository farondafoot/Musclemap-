import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0b",
        s1: "#111113",
        s2: "#19191c",
        s3: "#222226",
        b1: "#2a2a30",
        b2: "#38383f",
        b3: "#52525c",
        t1: "#ededef",
        t2: "#8b8b96",
        t3: "#4a4a54",
        hi: "#5b8def",
        success: "#30c48a",
        warn: "#f0a030",
        danger: "#e05050",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
