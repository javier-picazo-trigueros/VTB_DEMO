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

const getInitialTheme = () => {
  if (typeof window === "undefined") return "light";

  const savedTheme = localStorage.getItem("vtb-theme");
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  // Aplicar clase al DOM. Sin guardar aquí: si no hay elección previa,
  // getInitialTheme() recalcula desde prefers-color-scheme en cada visita en
  // vez de fijarla — el sistema puede cambiar de tema sin que eso cuente como
  // una elección del usuario. Solo toggleTheme() (acción explícita) persiste.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("dark", theme === "dark");
    html.style.colorScheme = theme;
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem("vtb-theme", next);
      } catch {
        // almacenamiento no disponible — el cambio sigue aplicándose en esta sesión
      }
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
