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
      console.error("Error en login:", err);
      setError(err.response?.data?.error || "Error al iniciar sesión");
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
            {t("login.subtitle") || "Sign in with your credentials"}
          </p>

          {sessionExpired && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm"
            >
              Tu sesión ha expirado. Vuelve a iniciar sesión para continuar.
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
                placeholder="usuario@dominio.edu"
              />
              {(() => {
                const emailDomain = formData.email.includes('@') ? formData.email.split('@')[1] : '';
                const emailPrefix = formData.email.split('@')[0] || '';
                
                let hint = null;
                if (emailDomain === 'vtb.system') {
                  hint = '🔧 Super administrador del sistema';
                } else if (emailPrefix === 'admin') {
                  hint = `👨‍💼 Administrador de @${emailDomain}`;
                } else if (emailDomain) {
                  hint = `🗳️ Accediendo como votante de @${emailDomain}`;
                }
                
                if (!hint) return null;
                
                return (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {hint}
                  </p>
                );
              })()}
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
              {loading ? "Cargando..." : t("login.login")}
            </motion.button>
          </form>

            <div className="relative mt-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300 dark:border-slate-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-slate-800 text-slate-500">
                  o
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
              Continue with Google
            </button>

          <div className="mt-6 p-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              Test Accounts:
            </p>
            <p>Votante: juan@universidad.edu / password123</p>
            <p className="mt-2 font-semibold text-slate-700 dark:text-slate-300">
              Admins:
            </p>
            <p>superadmin@vtb.system / superadmin123</p>
            <p>admin@ufv.es / admin123</p>
            <p>admin@universidad.edu / admin123</p>
          </div>

          <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => navigate("/register-request")}
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              Request access
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
            <h3 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-2">Simulación de SSO</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-6">
              Para el despliegue en producción, Google OAuth permitiría iniciar sesión con tu cuenta institucional @ufv.es automáticamente. En esta demo, usa las credenciales de prueba.
            </p>
            <button
              onClick={() => setShowGoogleModal(false)}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
            >
              Entendido
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Login;
