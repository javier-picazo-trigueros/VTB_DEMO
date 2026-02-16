/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html",
  ],
  darkMode: "class", // Habilitar dark mode con clase CSS
  theme: {
    extend: {
      // COLORES PERSONALIZADOS PARA VTB
      colors: {
        // Primarios (Blockchain)
        blockchain: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          900: "#082f49",
        },
        // Votación (Verde)
        voting: {
          50: "#f0fdf4",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
        },
        // Neutrales (Gris oscuro para tema)
        slate: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
      },

      // FONDOS DE GRADIENTE
      backgroundImage: {
        "gradient-vtb": "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        "gradient-voting": "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
        "gradient-hero": "linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)",
      },

      // ANIMACIONES PERSONALIZADAS
      animation: {
        "fade-in": "fadeIn 0.5s ease-in",
        "slide-in": "slideIn 0.6s ease-out",
        "pulse-soft": "pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: ".8" },
        },
      },

      // ESPACIADO EXTENDIDO
      spacing: {
        "128": "32rem",
        "144": "36rem",
      },
    },
  },
  plugins: [],
}
