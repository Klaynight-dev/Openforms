/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        // Violet Google Forms
        brand: {
          DEFAULT: "#673ab7",
          50: "#f3eefb",
          100: "#e9e2f8",
          200: "#d3c5f0",
          500: "#673ab7",
          600: "#5c33a4",
          700: "#4d2a8a",
          900: "#311b5f",
        },
        // Gris de la surface Material / Google
        surface: {
          bg: "#f0ebf8",
          line: "#dadce0",
          muted: "#5f6368",
        },
      },
      fontFamily: {
        sans: ["Google Sans", "Roboto", "Segoe UI", "system-ui", "sans-serif"],
      },
      boxShadow: {
        gform: "0 1px 3px rgba(60,64,67,0.15), 0 1px 2px rgba(60,64,67,0.1)",
        "gform-hover": "0 1px 3px rgba(60,64,67,0.2), 0 4px 8px rgba(60,64,67,0.15)",
      },
    },
  },
  plugins: [],
};
