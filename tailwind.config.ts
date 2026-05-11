import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        farm: {
          DEFAULT: "#3B6D11",
          50: "#F1F7EB",
          100: "#DDECCC",
          200: "#BBD89A",
          300: "#99C467",
          400: "#77AF35",
          500: "#5B8E20",
          600: "#3B6D11",
          700: "#2F5A0E",
          800: "#22420A",
          900: "#162B06",
        },
      },
    },
  },
  plugins: [],
};

export default config;
