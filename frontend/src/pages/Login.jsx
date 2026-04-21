import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Navbar } from "../components/Navbar";
import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const voterDemoAccounts = [
  { label: "UFV Student 1",      email: "carlos@ufv.es",           pwd: "demo123" },
  { label: "UFV Student 2",      email: "laura@ufv.es",            pwd: "demo123" },
  { label: "UFV Student 3",      email: "miguel@ufv.es",           pwd: "demo123" },
  { label: "UFV Student 4",      email: "sofia@ufv.es",            pwd: "demo123" },
  { label: "Highland Student 1", email: "student5@highland.edu",   pwd: "demo123" },
  { label: "Highland Student 2", email: "student6@highland.edu",   pwd: "demo123" },
  { label: "Universidad Student",email: "juan@universidad.edu",    pwd: "demo123" },
];

const adminDemoAccounts = [
  { label: "Super Admin",       email: "superadmin@vtb.system",  pwd: "superadmin123" },
  { label: "UFV Admin",         email: "admin@ufv.es",           pwd: "admin123" },
  { label: "EPS Admin",         email: "admin@eps.ufv.es",       pwd: "admin123" },
  { label: "Highland Admin",    email: "admin@highland.edu",     pwd: "admin123" },
  { label: "Universidad Admin", email: "admin@universidad.edu",  pwd: "admin123" },
];

const allDevAccounts = [
  { label: "Super Admin",       email: "superadmin@vtb.system", pwd: "superadmin123", color: "text-red-400" },
  { label: "UFV Admin",         email: "admin@ufv.es",          pwd: "admin123",      color: "text-blue-400" },
  { label: "EPS Admin",         email: "admin@eps.ufv.es",      pwd: "admin123",      color: "text-blue-300" },
  { label: "Highland Admin",    email: "admin@highland.edu",    pwd: "admin123",      color: "text-purple-400" },
  { label: "UFV Student 1",     email: "carlos@ufv.es",         pwd: "demo123",       color: "text-green-400" },
  { label: "UFV Student 2",     email: "miguel@ufv.es",         pwd: "demo123",       color: "text-green-400" },
  { label: "Highland Student",  email: "student5@highland.edu", pwd: "demo123",       color: "text-yellow-400" },
  { label: "EDU Student",       email: "juan@universidad.edu",  pwd: "demo123",       color: "text-emerald-400" },
];

export const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthUser } = useAuth();

  // portal: null = selector, 'voter' = voter form, 'admin' = admin form
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [logoClicks, setLogoClicks] = useState(0);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [showDemoVoters, setShowDemoVoters] = useState(false);
  const [showDemoAdmins, setShowDemoAdmins] = useState(false);

  const [formData, setFormData] = useState({ email: "", password: "" });

  useEffect(() => {
    const reason = searchParams.get("reason");
    if (reason === "expired") {
      setSessionExpired(true);
      setTimeout(() => setSessionExpired(false), 8000);
    }
  }, [searchParams]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
    if (name === "email" && value.includes("@vtb.system")) {
      setShowDevPanel(true);
    }
  };

  const handleTitleClick = () => {
    const newCount = logoClicks + 1;
    setLogoClicks(newCount);
    if (newCount >= 5) {
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

      // Admin portal: reject non-admins
      if (portal === "admin" && user.role !== "admin" && user.role !== "superadmin") {
        setError("This account does not have admin access. Please use the Voter portal.");
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
      setError(err.response?.data?.error || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  // ── Portal selector ───────────────────────────────────────────────────
  if (portal === null) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6 relative"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
          backgroundSize: '32px 32px'
        }}
      >
        {/* Back to VTB link */}
        <div className="absolute top-6 left-6">
          <button
            onClick={() => navigate('/landing')}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm transition"
          >
            ← Back to VTB
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12 select-none"
          onClick={handleTitleClick}
        >
          <div
            className="text-5xl font-black text-white mb-2 tracking-tight cursor-pointer hover:text-blue-400 transition"
            onClick={() => navigate('/landing')}
          >
            VTB
          </div>
          <p className="text-slate-400 text-lg">Vote Through Blockchain</p>
        </motion.div>

        {sessionExpired && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 max-w-2xl w-full p-4 rounded-xl bg-amber-900/30 border border-amber-700 text-amber-300 text-sm text-center">
            {t("login.sessionExpired")}
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          {/* Voter portal */}
          <motion.button
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => setPortal("voter")}
            className="group bg-white/5 hover:bg-blue-600/20 border border-white/10 hover:border-blue-500/50 rounded-2xl p-8 text-left transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/20"
          >
            <div className="text-4xl mb-4">🗳️</div>
            <h2 className="text-2xl font-bold text-white mb-2">I want to Vote</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Access your assigned elections and cast your anonymous vote on the blockchain.
            </p>
            <div className="mt-6 flex items-center gap-2 text-blue-400 text-sm font-medium group-hover:gap-3 transition-all">
              Enter as voter <span>→</span>
            </div>
          </motion.button>

          {/* Admin portal */}
          <motion.button
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            onClick={() => setPortal("admin")}
            className="group bg-white/5 hover:bg-emerald-600/20 border border-white/10 hover:border-emerald-500/50 rounded-2xl p-8 text-left transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-emerald-500/20"
          >
            <div className="text-4xl mb-4">⚙️</div>
            <h2 className="text-2xl font-bold text-white mb-2">Administration</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Manage elections, approve registrations, and view statistics for your institution.
            </p>
            <div className="mt-6 flex items-center gap-2 text-emerald-400 text-sm font-medium group-hover:gap-3 transition-all">
              Enter as admin <span>→</span>
            </div>
          </motion.button>
        </div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="mt-8 text-slate-500 text-sm">
          New user?{" "}
          <button onClick={() => navigate("/register-request")}
            className="text-blue-400 hover:text-blue-300 underline ml-1">
            Request access
          </button>
        </motion.p>

        <p className="mt-12 text-slate-600 text-xs text-center">
          VTB — Vote Through Blockchain · Universidad Francisco de Vitoria
        </p>

        {/* Dev panel (5 logo clicks) */}
        {showDevPanel && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mt-8 w-full max-w-2xl p-4 bg-slate-900 rounded-xl border border-slate-600">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-green-400 font-mono text-sm">$ vtb --dev-mode</span>
              <button onClick={() => setShowDevPanel(false)} className="ml-auto text-slate-500 hover:text-slate-300 text-xs">[close]</button>
            </div>
            <p className="text-slate-400 font-mono text-xs mb-3">Developer access portal — click to fill then pick a portal</p>
            <div className="grid grid-cols-2 gap-2">
              {allDevAccounts.map(({ label, email, pwd, color }) => (
                <button key={email}
                  onClick={() => { setFormData({ email, password: pwd }); setPortal(["admin","superadmin"].some(r => email.includes("admin") || email.includes("superadmin")) ? "admin" : "voter"); setShowDevPanel(false); }}
                  className="text-left p-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 transition">
                  <p className={`${color} font-mono text-xs font-bold`}>{label}</p>
                  <p className="text-slate-400 font-mono text-xs truncate">{email}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  // ── Shared login form (voter or admin) ────────────────────────────────
  const isVoter = portal === "voter";
  const accentBg = isVoter ? "from-blue-600 to-blue-700" : "from-emerald-600 to-emerald-700";
  const accentRing = isVoter ? "focus:ring-blue-500" : "focus:ring-emerald-500";
  const accentDemoBtn = isVoter
    ? "bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 border-blue-200 dark:border-blue-800"
    : "bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800";
  const accentDemoText = isVoter ? "text-blue-700 dark:text-blue-300" : "text-emerald-700 dark:text-emerald-300";
  const demoAccounts = isVoter ? voterDemoAccounts : adminDemoAccounts;
  const showDemo = isVoter ? showDemoVoters : showDemoAdmins;
  const setShowDemo = isVoter ? setShowDemoVoters : setShowDemoAdmins;
  const portalTitle = isVoter ? "Voter Access" : "Administration Portal";
  const portalSubtitle = isVoter
    ? "Sign in to access your elections and cast your vote."
    : "Sign in with your administrator credentials.";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />

      <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-200 dark:border-slate-700"
        >
          {/* Back button */}
          <button
            onClick={handleBackToSelector}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition"
          >
            ← Back
          </button>

          {/* Title */}
          <h2
            className="text-2xl font-bold text-slate-900 dark:text-white mb-1 cursor-default select-none"
            onClick={handleTitleClick}
          >
            {portalTitle}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">{portalSubtitle}</p>

          {/* Portal badge */}
          <div className="mb-4">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${
              isVoter
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
            }`}>
              {isVoter ? "🗳️ Voter Portal" : "⚙️ Admin Portal"}
            </span>
          </div>

          {sessionExpired && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm">
              {t("login.sessionExpired")}
            </motion.div>
          )}

          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t("login.email")}
              </label>
              <input
                type="email" name="email" value={formData.email} onChange={handleChange}
                disabled={loading}
                className={`w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 ${accentRing} disabled:opacity-50`}
                placeholder="user@domain.edu"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t("login.password")}
              </label>
              <input
                type="password" name="password" value={formData.password} onChange={handleChange}
                disabled={loading}
                className={`w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 ${accentRing} disabled:opacity-50`}
                placeholder="••••••••"
              />
            </div>

            <motion.button
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              type="submit" disabled={loading}
              className={`w-full py-3 rounded-lg bg-gradient-to-r ${accentBg} text-white font-semibold text-sm hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading ? t("login.signingIn") : t("login.login")}
            </motion.button>
          </form>

          {/* Demo accounts (collapsible) */}
          <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
            <button
              onClick={() => setShowDemo(p => !p)}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 w-full transition"
            >
              Demo {isVoter ? "voter" : "admin"} accounts {showDemo ? "▲" : "▼"}
            </button>
            {showDemo && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                {demoAccounts.map(acc => (
                  <button key={acc.email}
                    onClick={() => fillCredentials(acc.email, acc.pwd)}
                    className={`text-left p-2 rounded-lg border ${accentDemoBtn} transition`}
                  >
                    <p className={`text-xs font-bold ${accentDemoText}`}>{acc.label}</p>
                    <p className="text-xs text-slate-500 truncate">{acc.email}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Developer panel */}
          {showDevPanel && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 bg-slate-900 dark:bg-slate-950 rounded-lg border border-slate-600">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-green-400 font-mono text-sm">$ vtb --dev-mode</span>
                <button onClick={() => setShowDevPanel(false)} className="ml-auto text-slate-500 hover:text-slate-300 text-xs">[close]</button>
              </div>
              <p className="text-slate-400 font-mono text-xs mb-3">Developer access portal — quick login shortcuts</p>
              <div className="grid grid-cols-2 gap-2">
                {allDevAccounts.map(({ label, email, pwd, color }) => (
                  <button key={email}
                    onClick={() => { fillCredentials(email, pwd); setShowDevPanel(false); }}
                    className="text-left p-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 transition">
                    <p className={`${color} font-mono text-xs font-bold`}>{label}</p>
                    <p className="text-slate-400 font-mono text-xs truncate">{email}</p>
                  </button>
                ))}
              </div>
              <p className="text-slate-600 font-mono text-xs mt-3">Click any account to auto-fill. All passwords are demo only.</p>
            </motion.div>
          )}

          <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            {t("login.noAccount")}{" "}
            <button type="button" onClick={() => navigate("/register-request")}
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">
              {t("login.registerHere")}
            </button>
          </div>
        </motion.div>
      </div>

      {/* Google OAuth Simulation Modal */}
      {showGoogleModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-2">{t("login.ssoTitle")}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-6">{t("login.ssoDesc")}</p>
            <button onClick={() => setShowGoogleModal(false)}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium">
              {t("login.gotIt")}
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Login;
