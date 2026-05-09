/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ["DM Sans", "sans-serif"],
        body:    ["DM Sans", "sans-serif"],
        tamil:   ["Noto Sans Tamil", "DM Sans", "sans-serif"],
      },
      colors: {
        accent: {
          DEFAULT: "#2563eb",
          hover:   "#1d4ed8",
          soft:    "#eff6ff",
        },
        surface: {
          DEFAULT: "#ffffff",
          secondary: "#f1f5f9",
        }
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      animation: {
        "fade-in":  "fadeIn 0.25s ease-out",
        "slide-in": "slideIn 0.25s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        slideIn: { "0%": { opacity: "0", transform: "translateX(-20px)" }, "100%": { opacity: "1", transform: "translateX(0)" } },
        scaleIn: { "0%": { opacity: "0", transform: "scale(0.97)" }, "100%": { opacity: "1", transform: "scale(1)" } },
      },
    },
  },
  plugins: [],
};
