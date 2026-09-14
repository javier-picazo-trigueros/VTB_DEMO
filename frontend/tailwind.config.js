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
      //
      // Nota: las paletas `blockchain` y `voting`, los gradientes
      // (gradient-vtb / gradient-voting / gradient-hero), las animaciones
      // fade-in / slide-in / pulse-soft y el spacing 128/144 se eliminaron
      // tras el rediseño. Estaban marcados como "kept for backwards compat"
      // y no los usaba ningún componente (verificado en todo src/ e index.html).
      colors: {
        // Design system — brand tokens (petrol #1B4D6A)
        brand: {
          50:  "#EBF4FA",
          100: "#C8E0EF",
          200: "#9EC5DF",
          300: "#6EA9CE",
          400: "#4090BD",
          500: "#2572A0",
          600: "#1B4D6A", // primary — petrol
          700: "#153E55",
          800: "#0F2E3E",
          900: "#091F2B",
        },
        // Warm neutral scale for borders, backgrounds
        warm: {
          50:  "#F5F3EF",
          100: "#EDE9E4",
          200: "#E2DDD8",
          300: "#C8C2BC",
          400: "#908A84",
          500: "#6B6560",
        },
        success: {
          50:  "#ECFDF5",
          100: "#D1FAE5",
          400: "#34D399",
          500: "#10B981", // primary
          600: "#059669",
          700: "#047857",
        },
        danger: {
          50:  "#FEF2F2",
          100: "#FEE2E2",
          400: "#F87171",
          500: "#EF4444", // primary
          600: "#DC2626",
          700: "#B91C1C",
          800: "#991B1B",
        },
        warn: {
          50:  "#FFFBEB",
          100: "#FEF3C7",
          400: "#FBBF24",
          500: "#F59E0B", // primary
          600: "#D97706",
          700: "#B45309",
        },
        // Neutrales
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
    },
  },
  plugins: [],
}
