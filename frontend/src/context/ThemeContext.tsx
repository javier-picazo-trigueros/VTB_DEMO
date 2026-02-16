import { createContext, useContext, useEffect, useState } from "react";

/**
 * @title ThemeContext - Dark/Light Mode
 * @author Senior Web3 Architect
 * @dev Context para gestionar tema global (Dark/Light) con persistencia
 *
 * ARQUITECTURA:
 * - Provider wrappea toda la app
 * - Toggle disponible en navbar
 * - Valores persistidos en localStorage
 * - CSS personalizado vía Tailwind classes
 */

const ThemeContext = createContext(undefined);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("light");
  const [mounted, setMounted] = useState(false);

  // Cargar tema de localStorage al iniciar
  useEffect(() => {
    const savedTheme = localStorage.getItem("vtb-theme");
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      // Detectar preferencia del sistema
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      setTheme(prefersDark ? "dark" : "light");
    }
    setMounted(true);
  }, []);

  // Aplicar clase al DOM
  useEffect(() => {
    if (mounted) {
      const html = document.documentElement;
      if (theme === "dark") {
        html.classList.add("dark");
      } else {
        html.classList.remove("dark");
      }
      localStorage.setItem("vtb-theme", theme);
    }
  }, [theme, mounted]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme debe ser usado dentro de ThemeProvider");
  }
  return context;
}
