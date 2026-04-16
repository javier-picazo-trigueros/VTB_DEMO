import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Navbar } from "../components/Navbar";
import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  useEffect(() => {
    const reason = searchParams.get("reason");
    if (reason === "expired") {
      setSessionExpired(true);
      setTimeout(() => setSessionExpired(false), 8000);
    }
  }, [searchParams]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError("");
  };

  const fillCredentials = (email, password) => {
    setFormData({ email, password });
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email: formData.email,
        password: formData.password,
      });

      const { token, user } = response.data;

      localStorage.setItem("vtb-token", token);
      localStorage.setItem("vtb-role", user.role);
      localStorage.setItem("vtb-user-id", user.id);
      localStorage.setItem("vtb-email", user.email);
      localStorage.setItem("vtb-name", user.name);
      localStorage.setItem("vtb-admin-domain", user.adminDomain || "");

      setAuthUser({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });

      if (user.role === "admin" || user.role === "superadmin") {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(err.response?.data?.error || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />

      <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-200 dark:border-slate-700"
        >
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {t("login.title")}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm">
            {t("login.subtitle")}
          </p>

          {sessionExpired && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm"
            >
              {t("login.sessionExpired")}
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t("login.email")}
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blockchain-500 disabled:opacity-50"
                placeholder="user@domain.edu"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t("login.password")}
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blockchain-500 disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>

            <motion.button
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold text-sm hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t("login.signingIn") : t("login.login")}
            </motion.button>
          </form>

            <div className="relative mt-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300 dark:border-slate-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-slate-800 text-slate-500">
                  {t("login.or")}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGoogleModal(true)}
              className="mt-4 w-full flex justify-center items-center py-3 px-4 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:shadow-md transition"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C8.36,19.27 5,16.25 5,12C5,7.9 8.2,4.73 12.2,4.73C15.29,4.73 17.1,6.7 17.1,6.7L19,4.72C19,4.72 16.56,2 12.1,2C6.42,2 2.03,6.8 2.03,12C2.03,17.05 6.16,22 12.25,22C17.6,22 21.5,18.33 21.5,12.91C21.5,11.76 21.35,11.1 21.35,11.1V11.1Z" />
              </svg>
              {t("login.continueWithGoogle")}
            </button>

          {/* ====== DEMO ACCOUNTS ====== */}
          <div className="mt-6 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 mb-3">
              {t("login.demoAccounts")}
            </p>

            {/* Super Admin */}
            <div className="mb-3">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">{t("login.superAdmin")}</p>
              <button
                type="button"
                onClick={() => fillCredentials("superadmin@vtb.system", "superadmin123")}
                className="w-full text-left px-3 py-1.5 rounded bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-xs text-slate-700 dark:text-slate-300 transition font-mono"
              >
                superadmin@vtb.system / superadmin123
              </button>
            </div>

            {/* UFV Domain */}
            <div className="mb-3">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                {t("login.ufvAdmin")}
              </p>
              <button
                type="button"
                onClick={() => fillCredentials("admin@ufv.es", "admin123")}
                className="w-full text-left px-3 py-1.5 rounded bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-xs text-slate-700 dark:text-slate-300 transition font-mono"
              >
                admin@ufv.es / admin123
              </button>
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mt-2 mb-1">
                {t("login.ufvStudent")}
              </p>
              <button
                type="button"
                onClick={() => fillCredentials("carlos@ufv.es", "demo123")}
                className="w-full text-left px-3 py-1.5 rounded bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-xs text-slate-700 dark:text-slate-300 transition font-mono"
              >
                carlos@ufv.es / demo123
              </button>
            </div>

            {/* EDU Domain */}
            <div>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
                {t("login.eduAdmin")}
              </p>
              <button
                type="button"
                onClick={() => fillCredentials("admin@universidad.edu", "admin123")}
                className="w-full text-left px-3 py-1.5 rounded bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs text-slate-700 dark:text-slate-300 transition font-mono"
              >
                admin@universidad.edu / admin123
              </button>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mt-2 mb-1">
                {t("login.eduStudent")}
              </p>
              <button
                type="button"
                onClick={() => fillCredentials("juan@universidad.edu", "demo123")}
                className="w-full text-left px-3 py-1.5 rounded bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs text-slate-700 dark:text-slate-300 transition font-mono"
              >
                juan@universidad.edu / demo123
              </button>
            </div>
          </div>

          <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            {t("login.noAccount")}{" "}
            <button
              type="button"
              onClick={() => navigate("/register-request")}
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              {t("login.registerHere")}
            </button>
          </div>
        </motion.div>
      </div>

      {/* Google OAuth Simulation Modal */}
      {showGoogleModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-sm w-full shadow-xl"
          >
            <div className="text-center mb-4 text-4xl">
              <svg className="w-12 h-12 mx-auto mb-2 text-slate-700 dark:text-slate-300" viewBox="0 0 24 24">
                <path fill="currentColor" d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C8.36,19.27 5,16.25 5,12C5,7.9 8.2,4.73 12.2,4.73C15.29,4.73 17.1,6.7 17.1,6.7L19,4.72C19,4.72 16.56,2 12.1,2C6.42,2 2.03,6.8 2.03,12C2.03,17.05 6.16,22 12.25,22C17.6,22 21.5,18.33 21.5,12.91C21.5,11.76 21.35,11.1 21.35,11.1V11.1Z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-2">{t("login.ssoTitle")}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-6">
              {t("login.ssoDesc")}
            </p>
            <button
              onClick={() => setShowGoogleModal(false)}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
            >
              {t("login.gotIt")}
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Login;
