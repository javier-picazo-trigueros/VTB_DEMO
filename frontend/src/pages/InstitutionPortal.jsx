/**
 * InstitutionPortal.jsx — VTB Multi-Tenant Portal
 * =================================================
 * Branded login portal per institution identified by :domain.
 * Respects Tailwind dark mode. The institution's primary_color is used
 * only as an accent (button bg, top border, highlights) — not as the
 * whole-page background.
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ─── Loading spinner ──────────────────────────────────────────────────────────
const LoadingSpinner = ({ color = "#3b82f6" }) => (
  <div className="flex flex-col items-center justify-center gap-4 py-16">
    <div
      className="w-12 h-12 rounded-full border-4 border-gray-200 dark:border-gray-700 animate-spin"
      style={{ borderTopColor: color }}
    />
    <p className="text-gray-500 dark:text-gray-400 text-sm tracking-wide">
      Loading portal…
    </p>
  </div>
);

// ─── Demo accounts list (all known demos, filtered by domain) ─────────────────
const ALL_VOTER_DEMOS = [
  { label: "UFV Student 1",      email: "carlos@ufv.es",           pwd: "demo123" },
  { label: "UFV Student 2",      email: "laura@ufv.es",            pwd: "demo123" },
  { label: "Highland Student 1", email: "student5@highland.edu",   pwd: "demo123" },
  { label: "Highland Student 2", email: "student6@highland.edu",   pwd: "demo123" },
];

const ALL_ADMIN_DEMOS = [
  { label: "Super Admin",     email: "superadmin@vtb.system", pwd: "superadmin123" },
  { label: "UFV Admin",       email: "admin@ufv.es",           pwd: "admin123" },
  { label: "EPS Admin",       email: "admin@eps.ufv.es",       pwd: "admin123" },
  { label: "Highland Admin",  email: "admin@highland.edu",     pwd: "admin123" },
];

// ─── Inline login form ────────────────────────────────────────────────────────
const PortalLoginForm = ({ primaryColor, domain }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { setAuthUser } = useAuth();

  const [portal, setPortal]   = useState(null); // null | 'voter' | 'admin'
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [showDemoVoters, setShowDemoVoters] = useState(false);
  const [showDemoAdmins, setShowDemoAdmins] = useState(false);

  // Filter demos to the current domain (or vtb.system special case)
  const voterDemos = ALL_VOTER_DEMOS.filter(
    (a) => a.email.endsWith(`@${domain}`) || a.email.endsWith(`.${domain}`)
  );
  const adminDemos = ALL_ADMIN_DEMOS.filter(
    (a) => a.email.endsWith(`@${domain}`) || a.email.endsWith(`.${domain}`)
  );

  const handleChange = (e) => {
    setFormData((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data } = await axios.post(
        `${API_URL}/auth/login`,
        {
          email: formData.email,
          password: formData.password,
        },
        { timeout: 15000 }
      );

      const { token, user } = data;

      if (portal === "admin" && user.role !== "admin" && user.role !== "superadmin") {
        setError(t("login.notAdmin"));
        setLoading(false);
        return;
      }

      localStorage.setItem("vtb-token",        token);
      localStorage.setItem("vtb-role",          user.role);
      localStorage.setItem("vtb-user-id",       user.id);
      localStorage.setItem("vtb-email",         user.email);
      localStorage.setItem("vtb-name",          user.name);
      localStorage.setItem("vtb-admin-domain",  user.adminDomain || "");

      setAuthUser({ id: user.id, email: user.email, name: user.name, role: user.role });

      if (portal === "admin" && (user.role === "admin" || user.role === "superadmin")) {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      if (err.code === "ECONNABORTED") {
        setError(t("login.timeoutError"));
      } else if (!err.response) {
        setError(t("login.networkError", { apiUrl: API_URL }));
      } else {
        setError(err.response?.data?.error || t("login.loginError"));
      }
    } finally {
      setLoading(false);
    }
  };

  const fill = (email, pwd) => {
    setFormData({ email, password: pwd });
    setError("");
  };

  const resetPortal = () => {
    setPortal(null);
    setError("");
    setFormData({ email: "", password: "" });
  };

  // ── Portal selector ──────────────────────────────────────────────────────
  if (portal === null) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        {/* Voter card */}
        <motion.button
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.05 }}
          onClick={() => setPortal("voter")}
          id="portal-voter-btn"
          className="group text-left p-6 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <div className="text-3xl mb-3">🗳️</div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
            {t("login.voterPortalTitle")}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
            {t("login.voterAccessDesc")}
          </p>
          <div
            className="mt-4 flex items-center gap-1 text-sm font-semibold group-hover:gap-2 transition-all"
            style={{ color: primaryColor }}
          >
            {t("login.enterAsVoter")} <span>-&gt;</span>
          </div>
        </motion.button>

        {/* Admin card */}
        <motion.button
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => setPortal("admin")}
          id="portal-admin-btn"
          className="group text-left p-6 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <div className="text-3xl mb-3">⚙️</div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
            {t("login.adminPortalTitle")}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
            {t("login.adminPortalDesc")}
          </p>
          <div
            className="mt-4 flex items-center gap-1 text-sm font-semibold group-hover:gap-2 transition-all"
            style={{ color: primaryColor }}
          >
            {t("login.enterAsAdmin")} <span>-&gt;</span>
          </div>
        </motion.button>
      </div>
    );
  }

  // ── Login form ───────────────────────────────────────────────────────────
  const isVoter    = portal === "voter";
  const demoAccounts = isVoter ? voterDemos : adminDemos;
  const showDemo   = isVoter ? showDemoVoters : showDemoAdmins;
  const setShowDemo = isVoter ? setShowDemoVoters : setShowDemoAdmins;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      {/* Card with brand top border */}
      <div
        className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden"
        style={{ borderTop: `4px solid ${primaryColor}` }}
      >
        <div className="p-6 sm:p-8">
          {/* Back + badge row */}
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={resetPortal}
              id="portal-back-btn"
              className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition"
            >
              {t("login.back")}
            </button>
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {isVoter ? t("login.voterPortalBadge") : t("login.adminPortalBadge")}
            </span>
          </div>

          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-5">
            {isVoter ? t("login.voterAccess") : t("login.adminAccess")}
          </h2>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" id="portal-login-form">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t("login.email")}
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                placeholder={`user@${domain}`}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 disabled:opacity-50 transition"
                style={{ "--tw-ring-color": primaryColor, focusRingColor: primaryColor }}
                onFocus={(e) => (e.target.style.boxShadow = `0 0 0 2px ${primaryColor}55`)}
                onBlur={(e)  => (e.target.style.boxShadow = "")}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t("login.password")}
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 disabled:opacity-50 transition"
                onFocus={(e) => (e.target.style.boxShadow = `0 0 0 2px ${primaryColor}55`)}
                onBlur={(e)  => (e.target.style.boxShadow = "")}
              />
            </div>

            {/* CTA button — branded color only here */}
            <motion.button
              whileHover={{ scale: loading ? 1 : 1.02, opacity: loading ? 1 : 0.92 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              type="submit"
              disabled={loading}
              id="portal-login-submit"
              className="w-full py-3 rounded-xl font-semibold text-white text-sm shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: primaryColor }}
            >
              {loading ? t("login.signingIn") : t("login.login")}
            </motion.button>
          </form>

          {/* Demo accounts */}
          {demoAccounts.length > 0 && (
            <div className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4">
              <button
                onClick={() => setShowDemo((p) => !p)}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition"
              >
                {isVoter ? t("login.demoVoterAccounts") : t("login.demoAdminAccounts")} {showDemo ? t("login.hide") : t("login.show")}
              </button>
              {showDemo && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {demoAccounts.map((acc) => (
                    <button
                      key={acc.email}
                      onClick={() => fill(acc.email, acc.pwd)}
                      className="text-left p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                    >
                      <p
                        className="text-xs font-bold truncate"
                        style={{ color: primaryColor }}
                      >
                        {acc.label}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                        {acc.email}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Register */}
          <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("login.newUser")}{" "}
            <button
              onClick={() => navigate(`/register-request${domain ? `?domain=${domain}` : ''}`)}
              className="font-semibold underline transition hover:opacity-70"
              style={{ color: primaryColor }}
            >
              {t("login.registerHere")}
            </button>
          </p>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Shared error/empty page shell ────────────────────────────────────────────
const SimpleShell = ({ emoji, title, message, domain, onBack }) => (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-8">
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-md text-center"
    >
      <div className="text-6xl mb-6">{emoji}</div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{title}</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">{message}</p>
      {domain && (
        <p className="mb-6">
          <span className="font-mono text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
            {domain}
          </span>
        </p>
      )}
      <button
        onClick={onBack}
        className="px-6 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold transition"
      >
        ← Back to Home
      </button>
    </motion.div>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
export const InstitutionPortal = () => {
  const { domain }   = useParams();
  const navigate     = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  const [status,  setStatus]  = useState("loading"); // loading | found | not_found | error
  const [orgData, setOrgData] = useState(null);

  // Redirect already-logged-in users
  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated, navigate]);

  // Fetch institution branding
  useEffect(() => {
    if (!domain) { setStatus("not_found"); return; }

    const ctrl = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/organizations/${encodeURIComponent(domain)}`,
          { signal: ctrl.signal }
        );
        if (res.status === 404) { setStatus("not_found"); return; }
        if (!res.ok)            { setStatus("error");     return; }
        setOrgData(await res.json());
        setStatus("found");
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Portal fetch error:", err);
          setStatus("error");
        }
      }
    })();

    return () => ctrl.abort();
  }, [domain]);

  // ── Early render states ────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <LoadingSpinner color="#3b82f6" />
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <SimpleShell
        emoji="🏛️"
        title="Institution Not Found"
        message="We couldn't find an institution registered for this domain. Please check the URL and try again."
        domain={domain}
        onBack={() => navigate("/landing")}
      />
    );
  }

  if (status === "error") {
    return (
      <SimpleShell
        emoji="⚠️"
        title="Something went wrong"
        message="Failed to load the institutional portal. Please try again later."
        onBack={() => navigate("/landing")}
      />
    );
  }

  // ── Derived theming ────────────────────────────────────────────────────────
  const primaryColor = orgData?.primary_color || "#3b82f6";
  const logoUrl      = orgData?.logo_url;
  const orgName      = orgData?.name || domain;

  // ── Success render ─────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col"
      id={`institutional-portal-${domain}`}
      // Expose brand color as a CSS variable for potential future use
      style={{ "--color-brand": primaryColor }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <button
          onClick={() => navigate("/landing")}
          id="portal-home-link"
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition"
        >
          {t("login.backToVtb")}
        </button>

        {/* Brand color pill — only accent usage in top bar */}
        <div
          className="h-1 w-16 rounded-full"
          style={{ backgroundColor: primaryColor }}
        />
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-16">

        {/* Institution identity block */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center mb-8 text-center"
        >
          {/* Logo */}
          {logoUrl ? (
            <div className="mb-5 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md">
              <img
                src={logoUrl}
                alt={`${orgName} logo`}
                className="h-20 w-auto object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  if (e.currentTarget.nextSibling) {
                    e.currentTarget.nextSibling.style.display = "flex";
                  }
                }}
              />
              {/* Emoji fallback (hidden by default, shown via onError) */}
              <div className="hidden text-5xl items-center justify-center h-20 w-20">🏛️</div>
            </div>
          ) : (
            <div className="mb-5 text-6xl">🏛️</div>
          )}

          {/* Name */}
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mb-1">
            {orgName}
          </h1>

          {/* Subtitle with accent color */}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Welcome to the{" "}
            <span className="font-semibold" style={{ color: primaryColor }}>
              secure voting portal
            </span>
          </p>

          {/* Accent divider */}
          <div
            className="mt-4 h-0.5 w-20 rounded-full"
            style={{ backgroundColor: primaryColor }}
          />
        </motion.div>

        {/* Login form card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <PortalLoginForm primaryColor={primaryColor} domain={domain} />
        </motion.div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="py-5 text-center border-t border-gray-200 dark:border-gray-800">
        <p className="text-xs text-gray-400 dark:text-gray-600">
          Powered by{" "}
          <span className="font-semibold text-gray-500 dark:text-gray-500">
            VTB — Vote Through Blockchain
          </span>
        </p>
      </div>
    </div>
  );
};

export default InstitutionPortal;


