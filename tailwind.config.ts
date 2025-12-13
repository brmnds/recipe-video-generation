import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        hfGreen: "#7AC143",
        hfDark: "#1E2B20",
        hfLight: "#F7FAF5",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(30, 43, 32, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
