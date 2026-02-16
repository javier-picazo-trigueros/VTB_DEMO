import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Navbar } from "../components/Navbar";
import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setAuthUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState("login"); // login | request-registration
  const [userDomain, setUserDomain] = useState("");
  
  const [formData, setFormData] = useState({
    email: "juan@universidad.edu",
    password: "password123",
  });

  const [requestData, setRequestData] = useState({
    email: "",
    name: "",
    student_id: "",
  });

  // Cargar elecciones cuando el email cambia
  useEffect(() => {
    if (formData.email && formData.email.includes("@")) {
      const domain = formData.email.split("@")[1];
      setUserDomain(domain);
    }
  }, [formData.email]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "electionId" ? parseInt(value) : value,
    }));
    setError("");
  };

  const handleRequestChange = (e) => {
    const { name, value } = e.target;
    setRequestData((prev) => ({
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
      if (!formData.electionId) {
        throw new Error("Por favor selecciona una elección");
      }

      const response = await axios.post(`${API_URL}/auth/login`, {
        email: formData.email,
        password: formData.password,
        electionId: formData.electionId,
      });

      const { token, voting, user } = response.data;

      // Almacenar datos
      localStorage.setItem("vtb-token", token);
      localStorage.setItem("vtb-nullifier", voting.nullifier);
      localStorage.setItem("vtb-election-id", voting.electionId);
      localStorage.setItem("vtb-role", user.role);
      localStorage.setItem("vtb-user-id", user.id);
      localStorage.setItem("vtb-email", user.email);
      localStorage.setItem("vtb-name", user.name);

      setAuthUser({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      });

      console.log("🔑 Login exitoso");

      // Redirigir según rol
      setTimeout(() => {
        if (user.role === "admin") {
          navigate("/admin");
        } else {
          navigate("/dashboard");
        }
      }, 500);
    } catch (err) {
      console.error("❌ Error en login:", err);
      
      // Si el usuario no existe, mostrar opción de solicitar registro
      if (err.response?.status === 401 && err.response?.data?.error?.includes("Email")) {
        setError("Usuario no registrado. Puedes solicitar tu registro al administrador.");
        setStep("request-registration");
        setRequestData({
          email: formData.email,
          name: "",
          student_id: "",
        });
      } else {
        setError(
          err.response?.data?.error ||
          "Error al iniciar sesión"
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await axios.post(`${API_URL}/registration/request`, {
        email: requestData.email,
        name: requestData.name,
        student_id: requestData.student_id,
      });

      setError("");
      alert("✅ Solicitud enviada correctamente. El administrador la revisará pronto.");
      setStep("login");
      setRequestData({ email: "", name: "", student_id: "" });
    } catch (err) {
      console.error("Error en solicitud:", err);
      setError(err.response?.data?.error || "Error al enviar solicitud");
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
          {step === "login" ? (
            <>
              {/* PASO 1: LOGIN */}
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                {t("login.title")}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm">
                {t("login.subtitle") || "Accede con tus credenciales"}
              </p>

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
                {/* Email Input */}
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
                  {userDomain && (
                    <p className="text-xs text-slate-500 mt-1">
                      Dominio: <span className="font-semibold">@{userDomain}</span>
                    </p>
                  )}
                </div>

                {/* Password Input */}
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

                {/* Submit Button */}
                <motion.button
                  whileHover={{ scale: loading ? 1 : 1.02 }}
                  whileTap={{ scale: loading ? 1 : 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold text-sm hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t("loading")}
                    </span>
                  ) : (
                    t("login.login")
                  )}
                </motion.button>
              </form>

              {/* Demo Credentials */}
              <div className="mt-6 p-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  📝 Cuenta de Prueba:
                </p>
                <p>👤 Email: juan@universidad.edu</p>
                <p>🔑 Contraseña: password123</p>
                <p className="mt-2 font-semibold text-slate-700 dark:text-slate-300">
                  👨‍💼 Admin:
                </p>
                <p>admin@universidad.edu / admin123</p>
              </div>
            </>
          ) : (
            <>
              {/* PASO 2: SOLICITAR REGISTRO */}
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                📝 Solicitar Registro
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm">
                Un administrador revisará tu solicitud
              </p>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm"
                >
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleRequestSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    📧 Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={requestData.email}
                    onChange={handleRequestChange}
                    disabled={true}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-600 text-slate-900 dark:text-white disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    👤 Nombre Completo
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={requestData.name}
                    onChange={handleRequestChange}
                    disabled={loading}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blockchain-500 disabled:opacity-50"
                    placeholder="Tu nombre completo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    🎓 ID de Estudiante
                  </label>
                  <input
                    type="text"
                    name="student_id"
                    value={requestData.student_id}
                    onChange={handleRequestChange}
                    disabled={loading}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blockchain-500 disabled:opacity-50"
                    placeholder="EST-2024-XYZ"
                  />
                </div>

                <motion.button
                  whileHover={{ scale: loading ? 1 : 1.02 }}
                  whileTap={{ scale: loading ? 1 : 0.98 }}
                  type="submit"
                  disabled={loading || !requestData.name || !requestData.student_id}
                  className="w-full py-3 rounded-lg bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold text-sm hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ✉️ Enviar Solicitud
                </motion.button>

                <button
                  type="button"
                  onClick={() => setStep("login")}
                  className="w-full py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  ← Volver
                </button>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
