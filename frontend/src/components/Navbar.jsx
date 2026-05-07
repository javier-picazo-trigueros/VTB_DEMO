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
      try {
        const stored = localStorage.getItem("vtb-user");
        const parsed = stored ? JSON.parse(stored) : null;
        if (parsed) setUser(parsed);
      } catch { /* ignore */ }
    }
  }, []);

  const handleLogout = () => {
    const keys = ['vtb-token', 'vtb-user', 'vtb-role', 'vtb-user-id', 'vtb-email', 'vtb-name', 'vtb-admin-domain'];
    keys.forEach(k => localStorage.removeItem(k));
    setUser(null);
    navigate("/login");
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
            onClick={() => navigate("/landing")}
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
          <div className="flex items-center space-x-4 sm:space-x-6">
            <a
              href="/pricing"
              className="hidden sm:inline text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 text-sm font-medium transition"
            >
              {t('navbar.pricing')}
            </a>
            <a
              href="/transparency"
              data-tour="transparency-link"
              className="hidden sm:inline text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 text-sm font-medium transition"
            >
              🔗 {t('navbar.publicAudit')}
            </a>

            {/* Theme Toggle */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none"
                    viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none"
                    viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
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
                  Spanish
                </button>
              </div>
            </div>

            {/* User Profile (only shown when authenticated) */}
            {user && (
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

                  {(user.role === "admin" || user.role === "superadmin") && (
                    <Link to="/admin">
                      <button className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                        👨‍💼 {t('navbar.adminPanel')}
                      </button>
                    </Link>
                  )}

                  <Link to="/profile">
                    <button className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                      👤 {t('navbar.myProfile')}
                    </button>
                  </Link>

                  <Link to="/change-password">
                    <button className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                      🔑 {t('navbar.changePassword')}
                    </button>
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-t border-slate-200 dark:border-slate-700"
                  >
                    🚪 {t("logout")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  );
};

export default Navbar;
