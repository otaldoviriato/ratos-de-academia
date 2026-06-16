import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        coal: "#07090d",
        graphite: "#10141d",
        iron: "#1a202c",
        acid: "#b6f348",
        ember: "#ff6b35",
        cyan: "#52d6ff"
      },
      boxShadow: {
        glow: "0 0 70px rgba(182, 243, 72, 0.14)",
        ember: "0 0 45px rgba(255, 107, 53, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
