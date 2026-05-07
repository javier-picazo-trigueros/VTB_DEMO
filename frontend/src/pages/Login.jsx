import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Navbar } from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const voterDemoAccounts = [
  { label: "VTB Demo Student", email: "student@vtb.demo", pwd: "demo123" },
  { label: "VTB Demo Student 2", email: "student2@vtb.demo", pwd: "demo123" },
  { label: "UFV Demo Student", email: "demo.ufv@ufv.es", pwd: "demo123" },
  { label: "UFV EPS Demo", email: "demo.eps@ufv.es", pwd: "demo123" },
  { label: "Highlands Demo", email: "demo.highland@highland.edu", pwd: "demo123" },
  { label: "Universidad Demo", email: "demo.universidad@universidad.edu", pwd: "demo123" },
];

const adminDemoAccounts = [
  { label: "VTB Demo Admin", email: "admin@vtb.demo", pwd: "admin123" },
  { label: "UFV Demo Admin", email: "admin.demo@ufv.es", pwd: "admin123" },
  { label: "Highlands Demo Admin", email: "admin.demo@highland.edu", pwd: "admin123" },
  { label: "Universidad Demo Admin", email: "admin.demo@universidad.edu", pwd: "admin123" },
  { label: "Demo Super Admin", email: "superadmin@vtb.demo", pwd: "superadmin123" },
];

const allDevAccounts = [
  { label: "VTB Demo Student", email: "student@vtb.demo", pwd: "demo123", color: "text-green-400", portal: "voter" },
  { label: "UFV Demo Student", email: "demo.ufv@ufv.es", pwd: "demo123", color: "text-green-400", portal: "voter" },
  { label: "Highlands Demo", email: "demo.highland@highland.edu", pwd: "demo123", color: "text-green-400", portal: "voter" },
  { label: "Universidad Demo", email: "demo.universidad@universidad.edu", pwd: "demo123", color: "text-green-400", portal: "voter" },
  { label: "VTB Demo Admin", email: "admin@vtb.demo", pwd: "admin123", color: "text-blue-400", portal: "admin" },
  { label: "UFV Demo Admin", email: "admin.demo@ufv.es", pwd: "admin123", color: "text-blue-400", portal: "admin" },
  { label: "Highlands Demo Admin", email: "admin.demo@highland.edu", pwd: "admin123", color: "text-blue-400", portal: "admin" },
  { label: "Universidad Demo Admin", email: "admin.demo@universidad.edu", pwd: "admin123", color: "text-blue-400", portal: "admin" },
  { label: "Demo Super Admin", email: "superadmin@vtb.demo", pwd: "superadmin123", color: "text-red-400", portal: "admin" },
];

export const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthUser } = useAuth();
  const { theme } = useTheme();

  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [logoClicks, setLogoClicks] = useState(0);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [showDemoVoters, setShowDemoVoters] = useState(false);
  const [showDemoAdmins, setShowDemoAdmins] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });

  useEffect(() => {
    if (searchParams.get("reason") === "expired") {
      setSessionExpired(true);
      setTimeout(() => setSessionExpired(false), 8000);
    }
  }, [searchParams]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
    setError("");
    if (name === "email" && value.includes("@vtb.demo")) {
      setShowDevPanel(true);
    }
  };

  const handleTitleClick = () => {
    const nextClicks = logoClicks + 1;
    setLogoClicks(nextClicks);
    if (nextClicks >= 5) {
      setShowDevPanel(true);
      setLogoClicks(0);
    }
  };

  const fillCredentials = (email, password) => {
    setFormData({ email, password });
    setError("");
  };

  const handleBackToSelector = () => {
    setPortal(null);
    setError("");
    setFormData({ email: "", password: "" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await axios.post(
        `${API_URL}/auth/login`,
        {
          email: formData.email,
          password: formData.password,
        },
        { timeout: 15000 }
      );

      const { token, user } = response.data;

      if (portal === "admin" && user.role !== "admin" && user.role !== "superadmin") {
        setError(t("login.notAdmin"));
        setLoading(false);
        return;
      }

      localStorage.setItem("vtb-token", token);
      localStorage.setItem("vtb-role", user.role);
      localStorage.setItem("vtb-user-id", user.id);
      localStorage.setItem("vtb-email", user.email);
      localStorage.setItem("vtb-name", user.name);
      localStorage.setItem("vtb-admin-domain", user.adminDomain || "");

      setAuthUser({ id: user.id, email: user.email, name: user.name, role: user.role });

      if (portal === "admin" && (user.role === "admin" || user.role === "superadmin")) {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      console.error("Login error:", err);
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

  if (portal === null) {
    return (
      <div
        className={`relative flex min-h-screen flex-col items-center justify-center p-6 transition-colors duration-500 ${
          theme === "dark"
            ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
            : "bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"
        }`}
        style={{
          backgroundImage:
            theme === "dark"
              ? "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)"
              : "radial-gradient(circle at 1px 1px, rgba(51,65,85,0.08) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      >
        <div className="absolute left-6 top-6">
          <button
            onClick={() => navigate("/landing")}
            className={`flex items-center gap-1.5 text-sm transition ${
              theme === "dark" ? "text-slate-500 hover:text-slate-300" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t("login.backToVtb")}
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 text-center select-none"
          onClick={handleTitleClick}
        >
          <button
            type="button"
            className={`mb-2 text-5xl font-black tracking-tight transition ${
              theme === "dark" ? "text-white hover:text-blue-400" : "text-slate-900 hover:text-blue-600"
            }`}
            onClick={() => navigate("/landing")}
          >
            VTB
          </button>
          <p className={`text-lg ${theme === "dark" ? "text-slate-400" : "text-slate-600"}`}>{t("appTagline")}</p>
        </motion.div>

        {sessionExpired && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 w-full max-w-2xl rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-4 text-center text-sm text-amber-700 dark:text-amber-300"
          >
            {t("login.sessionExpired")}
          </motion.div>
        )}

        <div className="grid w-full max-w-2xl grid-cols-1 gap-6 md:grid-cols-2">
          <PortalButton
            theme={theme}
            tone="blue"
            label={t("login.voterPortalTitle")}
            description={t("login.voterPortalDesc")}
            cta={t("login.enterAsVoter")}
            icon="V"
            onClick={() => setPortal("voter")}
          />
          <PortalButton
            theme={theme}
            tone="emerald"
            label={t("login.adminPortalTitle")}
            description={t("login.adminPortalDesc")}
            cta={t("login.enterAsAdmin")}
            icon="A"
            onClick={() => setPortal("admin")}
          />
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className={`mt-8 text-sm ${theme === "dark" ? "text-slate-500" : "text-slate-600"}`}
        >
          {t("login.newUser")}{" "}
          <button
            onClick={() => navigate("/register-request")}
            className={`ml-1 underline ${
              theme === "dark" ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"
            }`}
          >
            {t("login.registerHere")}
          </button>
        </motion.p>

        <p className={`mt-12 text-center text-xs ${theme === "dark" ? "text-slate-600" : "text-slate-500"}`}>
          {t("login.footerText")}
        </p>

        {showDevPanel && (
          <DevPanel
            accounts={allDevAccounts}
            onClose={() => setShowDevPanel(false)}
            onSelect={(account) => {
              setFormData({ email: account.email, password: account.pwd });
              setPortal(account.portal);
              setShowDevPanel(false);
            }}
            description={t("login.devPanelSelectorDesc")}
          />
        )}
      </div>
    );
  }

  const isVoter = portal === "voter";
  const accentBg = isVoter ? "from-blue-600 to-blue-700" : "from-emerald-600 to-emerald-700";
  const accentRing = isVoter ? "focus:ring-blue-500" : "focus:ring-emerald-500";
  const accentDemoBtn = isVoter
    ? "border-blue-200 bg-blue-50 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
    : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40";
  const accentDemoText = isVoter ? "text-blue-700 dark:text-blue-300" : "text-emerald-700 dark:text-emerald-300";
  const demoAccounts = isVoter ? voterDemoAccounts : adminDemoAccounts;
  const showDemo = isVoter ? showDemoVoters : showDemoAdmins;
  const setShowDemo = isVoter ? setShowDemoVoters : setShowDemoAdmins;

  return (
    <div
      className={`min-h-screen transition-colors duration-500 ${
        theme === "dark" ? "bg-gradient-to-b from-slate-900 to-slate-800" : "bg-gradient-to-b from-slate-50 to-slate-100"
      }`}
    >
      <Navbar />

      <div className="mx-auto max-w-md px-4 py-20 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className={`rounded-lg border p-8 shadow-lg ${
            theme === "dark" ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"
          }`}
        >
          <button
            onClick={handleBackToSelector}
            className={`mb-4 flex items-center gap-1.5 text-sm transition ${
              theme === "dark" ? "text-slate-500 hover:text-slate-300" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t("login.back")}
          </button>

          <h2
            className={`mb-1 cursor-default select-none text-2xl font-bold ${
              theme === "dark" ? "text-white" : "text-slate-900"
            }`}
            onClick={handleTitleClick}
          >
            {isVoter ? t("login.voterAccess") : t("login.adminAccess")}
          </h2>
          <p className={`mb-6 text-sm ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
            {isVoter ? t("login.voterAccessDesc") : t("login.adminAccessDesc")}
          </p>

          <div className="mb-4">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                isVoter
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              }`}
            >
              {isVoter ? t("login.voterPortalBadge") : t("login.adminPortalBadge")}
            </span>
          </div>

          {sessionExpired && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400"
            >
              {t("login.sessionExpired")}
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("login.email")}</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                className={`w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white ${accentRing}`}
                placeholder="user@domain.edu"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{t("login.password")}</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
                className={`w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white ${accentRing}`}
                placeholder="••••••••"
              />
            </div>

            <motion.button
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              type="submit"
              disabled={loading}
              className={`w-full rounded-lg bg-gradient-to-r py-3 text-sm font-semibold text-white transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 ${accentBg}`}
            >
              {loading ? t("login.signingIn") : t("login.login")}
            </motion.button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button
              onClick={() => setShowDemo((previous) => !previous)}
              className="flex w-full items-center gap-1 text-xs text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
            >
              {isVoter ? t("login.demoVoterAccounts") : t("login.demoAdminAccounts")} {showDemo ? "▲" : "▼"}
            </button>
            {showDemo && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {demoAccounts.map((account) => (
                  <button
                    key={account.email}
                    onClick={() => fillCredentials(account.email, account.pwd)}
                    className={`rounded-lg border p-2 text-left transition ${accentDemoBtn}`}
                  >
                    <p className={`text-xs font-bold ${accentDemoText}`}>{account.label}</p>
                    <p className="truncate text-xs text-slate-500">{account.email}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {showDevPanel && (
            <DevPanel
              accounts={allDevAccounts}
              onClose={() => setShowDevPanel(false)}
              onSelect={(account) => {
                fillCredentials(account.email, account.pwd);
                setShowDevPanel(false);
              }}
              description={t("login.devPanelDesc")}
              hint={t("login.devPanelHint")}
            />
          )}

          <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            {t("login.noAccount")}{" "}
            <button
              type="button"
              onClick={() => navigate("/register-request")}
              className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              {t("login.registerHere")}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

function PortalButton({ theme, tone, label, description, cta, icon, onClick }) {
  const isBlue = tone === "blue";
  return (
    <motion.button
      initial={{ opacity: 0, x: isBlue ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: isBlue ? 0.1 : 0.2 }}
      onClick={onClick}
      className={`group rounded-2xl border p-8 text-left transition-all duration-300 hover:scale-105 ${
        theme === "dark"
          ? isBlue
            ? "border-white/10 bg-white/5 hover:border-blue-500/50 hover:bg-blue-600/20 hover:shadow-2xl hover:shadow-blue-500/20"
            : "border-white/10 bg-white/5 hover:border-emerald-500/50 hover:bg-emerald-600/20 hover:shadow-2xl hover:shadow-emerald-500/20"
          : isBlue
            ? "border-slate-300/40 bg-white/60 hover:border-blue-400/60 hover:bg-blue-100/60 hover:shadow-lg hover:shadow-blue-300/20"
            : "border-slate-300/40 bg-white/60 hover:border-emerald-400/60 hover:bg-emerald-100/60 hover:shadow-lg hover:shadow-emerald-300/20"
      }`}
    >
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-black ${
          isBlue ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
        }`}
      >
        {icon}
      </div>
      <h2 className={`mb-2 text-2xl font-bold ${theme === "dark" ? "text-white" : "text-slate-900"}`}>{label}</h2>
      <p className={`text-sm leading-relaxed ${theme === "dark" ? "text-slate-400" : "text-slate-700"}`}>{description}</p>
      <div
        className={`mt-6 flex items-center gap-2 text-sm font-medium transition-all group-hover:gap-3 ${
          isBlue ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        {cta} <span>→</span>
      </div>
    </motion.button>
  );
}

function DevPanel({ accounts, onClose, onSelect, description, hint }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 w-full max-w-2xl rounded-xl border border-slate-600 bg-slate-900 p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-sm text-green-400">$ vtb --dev-mode</span>
        <button onClick={onClose} className="ml-auto text-xs text-slate-500 hover:text-slate-300">
          [close]
        </button>
      </div>
      <p className="mb-3 font-mono text-xs text-slate-400">{description}</p>
      <div className="grid grid-cols-2 gap-2">
        {accounts.map((account) => (
          <button
            key={account.email}
            onClick={() => onSelect(account)}
            className="rounded border border-slate-700 bg-slate-800 p-2 text-left transition hover:bg-slate-700"
          >
            <p className={`${account.color} font-mono text-xs font-bold`}>{account.label}</p>
            <p className="truncate font-mono text-xs text-slate-400">{account.email}</p>
          </button>
        ))}
      </div>
      {hint && <p className="mt-3 font-mono text-xs text-slate-600">{hint}</p>}
    </motion.div>
  );
}

export default Login;
