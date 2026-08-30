/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // هوية inDrive: أخضر ليموني مميز على أرضية شبه سوداء
        brand: {
          light: "#d7fa4e",
          DEFAULT: "#C1F11D",
          dark: "#9fce0c",
          accent: "#C1F11D",
        },
      },
      fontFamily: {
        cairo: ["Cairo", "sans-serif"],
      },
    },
  },
  plugins: [],
};
