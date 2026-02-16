import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useState, useEffect } from "react";

/**
 * @title Navbar Component - VTB Frontend
 * @author Senior Web3 Architect
 * @dev Navbar con toggle tema, selector idioma, perfil y navegación
 *
 * FEATURES:
 * - Toggle Dark/Light mode con persistencia
 * - Selector de idioma (EN/ES)
 * - Perfil de usuario con logout cuando está logueado
 * - Avatar de usuario
 * - Responsive design
 * - Animaciones suaves con Framer Motion
 */

export const Navbar = () => {
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  // Cargar usuario del localStorage
  useEffect(() => {
    const token = localStorage.getItem("vtb-token");
    if (token) {
      const email = localStorage.getItem("vtb-email");
      const name = localStorage.getItem("vtb-name");
      const role = localStorage.getItem("vtb-role");
      setUser({ email, name, role });
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("vtb-token");
    localStorage.removeItem("vtb-email");
    localStorage.removeItem("vtb-name");
    localStorage.removeItem("vtb-role");
    localStorage.removeItem("vtb-user-id");
    setUser(null);
    navigate("/");
  };

  // Obtener inicial del nombre para el avatar
  const getInitials = (name) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="sticky top-0 z-50 backdrop-blur-lg border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo */}
          <button
            onClick={() => {
              if (user) {
                navigate("/dashboard");
              } else {
                navigate("/");
              }
            }}
            className="flex items-center space-x-2 hover:opacity-80 transition"
          >
            <motion.div
              whileHover={{ scale: 1.1 }}
              className="w-8 h-8 bg-gradient-hero rounded-lg flex items-center justify-center"
            >
              <span className="text-white font-bold">V</span>
            </motion.div>
            <span className="font-bold text-xl text-slate-900 dark:text-white">
              {t("appName")}
            </span>
          </button>

          {/* Controles Derechos */}
          <div className="flex items-center space-x-6">
            {/* Theme Toggle */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              aria-label="Toggle theme"
            >
              {theme === "light" ? (
                <svg
                  className="w-5 h-5 text-yellow-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5 text-yellow-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.536l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.828-2.828a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414l.707.707zm.707 5.657a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 1.414l-.707.707zM9 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm-4.536-.464a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414l.707.707zm2.828 2.828a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM3 12a1 1 0 110-2 1 1 0 010 2zm16 0a1 1 0 110-2 1 1 0 010 2z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </motion.button>

            {/* Language Selector */}
            <div className="relative group">
              <motion.button
                whileHover={{ scale: 1.05 }}
                className="px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {i18n.language.toUpperCase()}
              </motion.button>

              {/* Dropdown */}
              <div className="absolute right-0 mt-0 w-32 bg-white dark:bg-slate-800 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition invisible group-hover:visible">
                <button
                  onClick={() => changeLanguage("en")}
                  className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  English
                </button>
                <button
                  onClick={() => changeLanguage("es")}
                  className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border-t border-slate-200 dark:border-slate-700"
                >
                  Español
                </button>
              </div>
            </div>

            {/* User Profile / Login */}
            {user ? (
              <div className="relative group">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  className="flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-gradient-hero flex items-center justify-center text-white text-sm font-bold">
                    {getInitials(user.name)}
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:inline">
                    {user.name}
                  </span>
                </motion.button>

                {/* Dropdown */}
                <div className="absolute right-0 mt-0 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition invisible group-hover:visible">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {user.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {user.email}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {user.role === "admin" ? "👨‍💼 Admin" : "🎓 Student"}
                    </p>
                  </div>

                  {user.role === "admin" && (
                    <Link to="/admin">
                      <button className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                        👨‍💼 Admin Panel
                      </button>
                    </Link>
                  )}

                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-t border-slate-200 dark:border-slate-700"
                  >
                    🚪 {t("logout")}
                  </button>
                </div>
              </div>
            ) : (
              <Link to="/login">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-4 py-2 rounded-lg bg-gradient-hero text-white font-medium text-sm hover:shadow-lg transition"
                >
                  {t("login.login")}
                </motion.button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  );
};

export default Navbar;
