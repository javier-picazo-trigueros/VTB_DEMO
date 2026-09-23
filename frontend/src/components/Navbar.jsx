import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

export const Navbar = () => {
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Dropdown state
  const [langOpen, setLangOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Refs for click-outside detection
  const langRef = useRef(null);
  const userRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close everything on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        setLangOpen(false);
        setUserOpen(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    // Guardado explícito: i18next-browser-languagedetector ya no cachea solo
    // (config.ts pone caches: []), así que el único sitio donde el idioma se
    // persiste es aquí, en la elección activa del usuario — nunca por detectar
    // el navegador en una visita nueva.
    try {
      localStorage.setItem('i18nextLng', lng);
    } catch {
      // almacenamiento no disponible — el cambio sigue aplicándose en esta sesión
    }
    setLangOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
    setMobileOpen(false);
  };

  const closeMobile = () => setMobileOpen(false);

  const getInitials = (name) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  // Shared focus-ring utility
  const ring = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2";

  // Shared dropdown item class
  const menuItem = `flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300
    hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-150
    focus-visible:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-slate-700`;

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-12">

          {/* ── Logo ── */}
          <button
            onClick={() => navigate("/landing")}
            aria-label={t("appName")}
            className={`flex items-center gap-2.5 rounded transition-opacity duration-100 hover:opacity-80 ${ring}`}
          >
            <div className="w-7 h-7 bg-brand-600 rounded flex items-center justify-center">
              <span className="text-white font-bold text-xs select-none tracking-tight">VTB</span>
            </div>
            <span className="font-semibold text-sm text-slate-900 dark:text-white tracking-tight">
              {t("appName")}
            </span>
          </button>

          {/* ── Desktop controls (sm and up) ── */}
          <div className="hidden sm:flex items-center gap-1 sm:gap-2">
            <a
              href="/pricing"
              className={`px-2 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300
                hover:text-brand-600 dark:hover:text-brand-400 rounded transition-colors duration-150 ${ring}`}
            >
              {t("navbar.pricing")}
            </a>
            <a
              href="/transparency"
              data-tour="transparency-link"
              className={`flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300
                hover:text-brand-600 dark:hover:text-brand-400 rounded transition-colors duration-150 ${ring}`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              {t("navbar.publicAudit")}
            </a>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label={theme === "dark" ? t("navbar.switchToLight") : t("navbar.switchToDark")}
              className={`p-2 rounded-lg text-slate-600 dark:text-slate-400
                hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-150 ${ring}`}
            >
              {theme === "dark" ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Language selector — click-based, keyboard accessible */}
            <div className="relative" ref={langRef}>
              <button
                aria-label={t("navbar.selectLanguage")}
                aria-expanded={langOpen}
                aria-controls="lang-menu"
                onClick={() => { setLangOpen((o) => !o); setUserOpen(false); }}
                className={`px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-300
                  hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-150 ${ring}`}
              >
                {i18n.language.slice(0, 2).toUpperCase()}
              </button>

              <AnimatePresence>
                {langOpen && (
                  <motion.div
                    id="lang-menu"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-slate-800 rounded-lg shadow-lg
                      border border-slate-200 dark:border-slate-700 z-50 py-1 overflow-hidden"
                  >
                    {[
                      { code: "en", label: "English" },
                      { code: "es", label: "Español" },
                    ].map(({ code, label }, i) => (
                      <button
                        key={code}
                        onClick={() => changeLanguage(code)}
                        className={`flex items-center justify-between w-full px-4 py-2 text-sm transition-colors duration-150
                          focus-visible:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-slate-700
                          hover:bg-slate-50 dark:hover:bg-slate-700
                          ${i > 0 ? "border-t border-slate-100 dark:border-slate-700" : ""}
                          ${i18n.language === code
                            ? "font-semibold text-brand-600 dark:text-brand-400"
                            : "text-slate-700 dark:text-slate-300"
                          }`}
                      >
                        {label}
                        {i18n.language === code && (
                          <svg className="w-3.5 h-3.5 text-brand-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* User menu — click-based, keyboard accessible */}
            {user && (
              <div className="relative" ref={userRef}>
                <button
                  aria-label={user.name}
                  aria-expanded={userOpen}
                  aria-controls="user-menu"
                  onClick={() => { setUserOpen((o) => !o); setLangOpen(false); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg
                    hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-150 ${ring}`}
                >
                  <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold select-none flex-shrink-0">
                    {getInitials(user.name)}
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden lg:inline">
                    {user.name}
                  </span>
                  <svg
                    className="w-4 h-4 text-slate-400 hidden lg:block transition-transform duration-150"
                    style={{ transform: userOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <AnimatePresence>
                  {userOpen && (
                    <motion.div
                      id="user-menu"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-800 rounded-lg shadow-lg
                        border border-slate-200 dark:border-slate-700 z-50 overflow-hidden"
                    >
                      {/* User info header */}
                      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 capitalize">
                          {user.role === "admin" || user.role === "superadmin" ? "Administrador" : "Votante"}
                        </p>
                      </div>

                      {(user.role === "admin" || user.role === "superadmin") && (
                        <Link to="/admin" onClick={() => setUserOpen(false)} className={menuItem}>
                          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          {t("navbar.adminPanel")}
                        </Link>
                      )}

                      <Link to="/profile" onClick={() => setUserOpen(false)} className={menuItem}>
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {t("navbar.myProfile")}
                      </Link>

                      <Link to="/change-password" onClick={() => setUserOpen(false)} className={menuItem}>
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        {t("navbar.changePassword")}
                      </Link>

                      <button
                        onClick={handleLogout}
                        className={`${menuItem} text-danger-600 dark:text-danger-400 border-t border-slate-200 dark:border-slate-700`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        {t("logout")}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* ── Mobile: avatar + hamburger (visible only on < sm) ── */}
          <div className="flex sm:hidden items-center gap-2">
            {user && (
              <div aria-hidden="true" className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold select-none">
                {getInitials(user.name)}
              </div>
            )}
            <button
              aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú de navegación"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              onClick={() => setMobileOpen((o) => !o)}
              className={`p-2 rounded-lg text-slate-600 dark:text-slate-400
                hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-150 ${ring}`}
            >
              <AnimatePresence mode="wait" initial={false}>
                {mobileOpen ? (
                  <motion.svg key="x" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 90 }} transition={{ duration: 0.15 }} aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </motion.svg>
                ) : (
                  <motion.svg key="menu" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    initial={{ opacity: 0, rotate: 90 }} animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: -90 }} transition={{ duration: 0.15 }} aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </motion.svg>
                )}
              </AnimatePresence>
            </button>
          </div>

        </div>
      </div>

      {/* ── Mobile menu panel ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            className="sm:hidden border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <div className="px-4 pt-3 pb-5 space-y-1">

              {/* User info */}
              {user && (
                <div className="pb-3 mb-1 border-b border-slate-200 dark:border-slate-700">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{user.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                </div>
              )}

              {/* Nav links */}
              <a href="/pricing" onClick={closeMobile}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {t("navbar.pricing")}
              </a>
              <a href="/transparency" onClick={closeMobile}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {t("navbar.publicAudit")}
              </a>

              {/* Auth-specific links */}
              {user && (
                <>
                  {(user.role === "admin" || user.role === "superadmin") && (
                    <Link to="/admin" onClick={closeMobile}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      {t("navbar.adminPanel")}
                    </Link>
                  )}
                  <Link to="/profile" onClick={closeMobile}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {t("navbar.myProfile")}
                  </Link>
                  <Link to="/change-password" onClick={closeMobile}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    {t("navbar.changePassword")}
                  </Link>
                </>
              )}

              {/* Settings row: theme + language */}
              <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={toggleTheme}
                  aria-label={theme === "dark" ? t("navbar.switchToLight") : t("navbar.switchToDark")}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {theme === "dark" ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                  {theme === "dark" ? t("navbar.switchToLight") : t("navbar.switchToDark")}
                </button>

                <div className="flex gap-1">
                  {[{ code: "en", label: "EN" }, { code: "es", label: "ES" }].map(({ code, label }) => (
                    <button
                      key={code}
                      onClick={() => changeLanguage(code)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        i18n.language === code
                          ? "bg-brand-600 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logout */}
              {user && (
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-slate-800 transition-colors mt-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {t("logout")}
                </button>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
