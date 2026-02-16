import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Navbar } from "../components/Navbar";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const AdminPanel = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Dashboard
  const [stats, setStats] = useState(null);

  // Users
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    student_id: "",
  });

  // Elections
  const [elections, setElections] = useState([]);
  const [newElection, setNewElection] = useState({
    name: "",
    description: "",
    start_time: Math.floor(Date.now() / 1000),
    end_time: Math.floor(Date.now() / 1000) + 86400,
  });

  // Audit
  const [audit, setAudit] = useState([]);
  const [stats2, setStats2] = useState([]);

  // Student Votes
  const [studentVotes, setStudentVotes] = useState([]);
  const [selectedElectionForVotes, setSelectedElectionForVotes] = useState(null);

  // Registration Requests
  const [registrationRequests, setRegistrationRequests] = useState([]);
  const [approvalPassword, setApprovalPassword] = useState("");

  // Verificar admin al montar
  useEffect(() => {
    const token = localStorage.getItem("vtb-token");
    const role = localStorage.getItem("vtb-role");

    if (!token || role !== "admin") {
      navigate("/login");
      return;
    }
  }, [navigate]);

  // Cargar datos según tab
  useEffect(() => {
    loadTabData();
  }, [activeTab]);

  const getAuthHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem("vtb-token")}`,
  });

  const loadTabData = async () => {
    setLoading(true);
    setError("");
    try {
      switch (activeTab) {
        case "dashboard":
          const dashRes = await axios.get(`${API_URL}/admin/dashboard`, {
            headers: getAuthHeader(),
          });
          setStats(dashRes.data.stats);
          break;

        case "users":
          const usersRes = await axios.get(`${API_URL}/admin/users`, {
            headers: getAuthHeader(),
          });
          setUsers(usersRes.data.users);
          break;

        case "elections":
          const electRes = await axios.get(`${API_URL}/admin/elections`, {
            headers: getAuthHeader(),
          });
          setElections(electRes.data.elections);
          break;

        case "audit":
          const auditRes = await axios.get(`${API_URL}/admin/audit`, {
            headers: getAuthHeader(),
          });
          setAudit(auditRes.data.audit);
          break;

        case "stats":
          const statsRes = await axios.get(`${API_URL}/admin/stats/voters`, {
            headers: getAuthHeader(),
          });
          setStats2(statsRes.data.stats);
          break;

        case "inbox":
          const regRes = await axios.get(`${API_URL}/registration/requests`, {
            headers: getAuthHeader(),
          });
          setRegistrationRequests(regRes.data.requests);
          break;
      }
    } catch (err) {
      setError(err.response?.data?.error || "Error cargando datos");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API_URL}/admin/users`, newUser, {
        headers: getAuthHeader(),
      });
      setSuccess("✅ Usuario creado exitosamente");
      setNewUser({ email: "", password: "", name: "", student_id: "" });
      loadTabData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Error creando usuario");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("¿Eliminar este usuario?")) return;

    try {
      await axios.delete(`${API_URL}/admin/users/${userId}`, {
        headers: getAuthHeader(),
      });
      setSuccess("✅ Usuario eliminado");
      loadTabData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Error eliminando usuario");
    }
  };

  const handleCreateElection = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API_URL}/admin/elections`, newElection, {
        headers: getAuthHeader(),
      });
      setSuccess("✅ Votación creada exitosamente");
      setNewElection({
        name: "",
        description: "",
        start_time: Math.floor(Date.now() / 1000),
        end_time: Math.floor(Date.now() / 1000) + 86400,
      });
      loadTabData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Error creando votación");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleElection = async (electionId, is_active) => {
    try {
      await axios.put(
        `${API_URL}/admin/elections/${electionId}`,
        { is_active: !is_active },
        { headers: getAuthHeader() }
      );
      setSuccess("✅ Votación actualizada");
      loadTabData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Error actualizando votación");
    }
  };

  const handleApproveRequest = async (requestId, email) => {
    if (!approvalPassword.trim()) {
      setError("Por favor ingresa una contraseña temporal");
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/registration/approve/${requestId}`,
        { password: approvalPassword },
        { headers: getAuthHeader() }
      );
      setSuccess("✅ Solicitud aprobada y usuario creado");
      setApprovalPassword("");
      loadTabData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Error aprobando solicitud");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectRequest = async (requestId) => {
    if (!window.confirm("¿Rechazar esta solicitud de registro?")) return;

    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/registration/reject/${requestId}`,
        {},
        { headers: getAuthHeader() }
      );
      setSuccess("✅ Solicitud rechazada");
      loadTabData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Error rechazando solicitud");
    } finally {
      setLoading(false);
    }
  };

  const Tab = ({ id, label, icon }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
        activeTab === id
          ? "bg-emerald-500 text-white"
          : "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            👨‍💼 Panel de Administración
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Gestiona usuarios, votaciones y auditoría del sistema
          </p>
        </motion.div>

        {/* Alerts */}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 rounded-lg"
          >
            {success}
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg"
          >
            {error}
          </motion.div>
        )}

        {/* Tabs */}
        <div className="mt-8 flex flex-wrap gap-3 mb-8">
          <Tab id="dashboard" label="Dashboard" icon="📊" />
          <Tab id="inbox" label="Solicitudes" icon="📬" />
          <Tab id="users" label="Usuarios" icon="👥" />
          <Tab id="elections" label="Votaciones" icon="🗳️" />
          <Tab id="student-votes" label="Votos Estudiantes" icon="📝" />
          <Tab id="stats" label="Estadísticas" icon="📈" />
          <Tab id="audit" label="Auditoría" icon="📋" />
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-12"
            >
              <div className="inline-block animate-spin text-4xl">⏳</div>
              <p className="text-slate-600 dark:text-slate-400 mt-2">Cargando...</p>
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Dashboard */}
              {activeTab === "dashboard" && stats && (
                <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <StatCard label="Total Usuarios" value={stats.totalUsers} icon="👥" />
                  <StatCard label="Admins" value={stats.adminCount} icon="👨‍💼" />
                  <StatCard label="Estudiantes" value={stats.studentCount} icon="🎓" />
                  <StatCard label="Votaciones" value={stats.totalElections} icon="🗳️" />
                  <StatCard label="Nullifiers" value={stats.totalNullifiers} icon="🔐" />
                </div>
              )}

              {/* Users */}
              {activeTab === "users" && (
                <div className="space-y-8">
                  {/* Form */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700"
                  >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">➕ Crear Nuevo Usuario</h2>
                    <form onSubmit={handleCreateUser} className="grid md:grid-cols-2 gap-4">
                      <input
                        type="email"
                        placeholder="Email"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        disabled={loading}
                        required
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        placeholder="Nombre"
                        value={newUser.name}
                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                        disabled={loading}
                        required
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        placeholder="ID Estudiante"
                        value={newUser.student_id}
                        onChange={(e) => setNewUser({ ...newUser, student_id: e.target.value })}
                        disabled={loading}
                        required
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      />
                      <input
                        type="password"
                        placeholder="Contraseña"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        disabled={loading}
                        required
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      />
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        type="submit"
                        disabled={loading}
                        className="md:col-span-2 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition disabled:opacity-50"
                      >
                        {loading ? "Creando..." : "✨ Crear Usuario"}
                      </motion.button>
                    </form>
                  </motion.div>

                  {/* Users List */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 overflow-x-auto"
                  >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">📋 Usuarios Registrados</h2>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-300 dark:border-slate-600">
                          <th className="text-left py-2 px-4">Email</th>
                          <th className="text-left py-2 px-4">Nombre</th>
                          <th className="text-left py-2 px-4">Rol</th>
                          <th className="text-left py-2 px-4">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr key={user.id} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">
                            <td className="py-3 px-4">{user.email}</td>
                            <td className="py-3 px-4">{user.name}</td>
                            <td className="py-3 px-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                user.role === "admin"
                                  ? "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200"
                                  : "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                              }`}>
                                {user.role === "admin" ? "Admin" : "Estudiante"}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                className="text-red-500 hover:text-red-700 font-medium transition"
                              >
                                🗑️ Eliminar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </motion.div>
                </div>
              )}

              {/* Elections */}
              {activeTab === "elections" && (
                <div className="space-y-8">
                  {/* Form */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700"
                  >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">➕ Crear Nueva Votación</h2>
                    <form onSubmit={handleCreateElection} className="space-y-4">
                      <input
                        type="text"
                        placeholder="Nombre de la votación"
                        value={newElection.name}
                        onChange={(e) => setNewElection({ ...newElection, name: e.target.value })}
                        disabled={loading}
                        required
                        className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      />
                      <textarea
                        placeholder="Descripción"
                        value={newElection.description}
                        onChange={(e) => setNewElection({ ...newElection, description: e.target.value })}
                        disabled={loading}
                        className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                        rows={3}
                      />
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        type="submit"
                        disabled={loading}
                        className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition disabled:opacity-50"
                      >
                        {loading ? "Creando..." : "🗳️ Crear Votación"}
                      </motion.button>
                    </form>
                  </motion.div>

                  {/* Elections List */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">📋 Votaciones Registradas</h2>
                    {elections.map((election) => (
                      <div
                        key={election.id}
                        className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                      >
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-white">{election.name}</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{election.description}</p>
                        </div>
                        <button
                          onClick={() => handleToggleElection(election.id, election.is_active)}
                          className={`px-4 py-2 rounded-lg font-medium transition ${
                            election.is_active
                              ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200"
                              : "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {election.is_active ? "✓ Activa" : "⊘ Inactiva"}
                        </button>
                      </div>
                    ))}
                  </motion.div>
                </div>
              )}

              {/* Stats */}
              {activeTab === "stats" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">📊 Votantes por Votación</h2>
                  {stats2.map((stat) => (
                    <div
                      key={stat.id}
                      className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-white">{stat.election_name}</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {stat.total_voters} votantes
                          </p>
                        </div>
                        <span className="text-4xl">{stat.total_voters}</span>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Student Votes */}
              {activeTab === "student-votes" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">📝 Votos de Estudiantes por Elección</h2>
                    <select
                      value={selectedElectionForVotes || ""}
                      onChange={(e) => setSelectedElectionForVotes(parseInt(e.target.value) || null)}
                      className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="">-- Todas las Elecciones --</option>
                      {elections.map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  </div>

                  {audit.length === 0 ? (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-6 rounded-lg text-center">
                      <p className="text-blue-800 dark:text-blue-200">⏳ No hay votos registrados</p>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                            <th className="px-6 py-4 text-left font-semibold text-slate-900 dark:text-white">👤 Estudiante</th>
                            <th className="px-6 py-4 text-left font-semibold text-slate-900 dark:text-white">📧 Email</th>
                            <th className="px-6 py-4 text-left font-semibold text-slate-900 dark:text-white">🗳️ Elección</th>
                            <th className="px-6 py-4 text-left font-semibold text-slate-900 dark:text-white">✅ Voto</th>
                            <th className="px-6 py-4 text-left font-semibold text-slate-900 dark:text-white">⏰ Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {audit
                            .filter(v => !selectedElectionForVotes || v.election_id === selectedElectionForVotes)
                            .map((vote, idx) => (
                            <tr key={vote.id} className={`border-b border-slate-200 dark:border-slate-700 ${idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800' : 'bg-white dark:bg-slate-750'}`}>
                              <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{vote.name || "N/A"}</td>
                              <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-mono text-xs">{vote.email}</td>
                              <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{vote.election_name}</td>
                              <td className="px-6 py-4">
                                <span className="inline-block px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 rounded-full text-xs font-medium">
                                  {vote.vote_choice || "No especificado"}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                                {new Date(vote.generated_at).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Privacy Notice */}
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      <strong>⚠️ Confidencial:</strong> Esta información es solo para administradores. Los datos de votos son sensibles
                      y deben tratarse con confidencialidad.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Audit */}
              {activeTab === "audit" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 overflow-x-auto"
                >
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">📋 Auditoría de Nullifiers        </h2>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-300 dark:border-slate-600">
                        <th className="text-left py-2 px-4">Usuario</th>
                        <th className="text-left py-2 px-4">Email</th>
                        <th className="text-left py-2 px-4">Votación</th>
                        <th className="text-left py-2 px-4">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((entry) => (
                        <tr
                          key={entry.id}
                          className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                          <td className="py-3 px-4">{entry.name}</td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-500">{entry.email}</td>
                          <td className="py-3 px-4">{entry.election_name}</td>
                          <td className="py-3 px-4 text-xs text-slate-500">
                            {new Date(entry.generated_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}

              {/* Registration Requests */}
              {activeTab === "inbox" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">📬 Solicitudes de Registro Pendientes ({registrationRequests.filter(r => r.status === "pending").length})</h2>

                  {registrationRequests.filter(r => r.status === "pending").length === 0 ? (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-6 rounded-lg text-center">
                      <p className="text-blue-800 dark:text-blue-200">✨ No hay solicitudes pendientes</p>
                    </div>
                  ) : (
                    registrationRequests
                      .filter(r => r.status === "pending")
                      .map((request) => (
                        <div
                          key={request.id}
                          className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 space-y-4"
                        >
                          <div className="grid md:grid-cols-2 gap-6">
                            <div>
                              <p className="text-sm text-slate-600 dark:text-slate-400">Email</p>
                              <p className="font-mono text-slate-900 dark:text-white">{request.email}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-600 dark:text-slate-400">Nombre</p>
                              <p className="font-semibold text-slate-900 dark:text-white">{request.name}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-600 dark:text-slate-400">ID Estudiante</p>
                              <p className="font-mono text-slate-900 dark:text-white">{request.student_id}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-600 dark:text-slate-400">Fecha Solicitada</p>
                              <p className="text-sm text-slate-900 dark:text-white">
                                {new Date(request.requested_at).toLocaleString()}
                              </p>
                            </div>
                          </div>

                          {/* Approval Section */}
                          <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg space-y-3">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                              🔐 Contraseña Temporal para Crear Usuario
                            </label>
                            <input
                              type="password"
                              placeholder="Ingresa contraseña"
                              value={approvalPassword}
                              onChange={(e) => setApprovalPassword(e.target.value)}
                              disabled={loading}
                              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                            />
                            <div className="flex gap-3 pt-2">
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleApproveRequest(request.id, request.email)}
                                disabled={loading}
                                className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition disabled:opacity-50"
                              >
                                ✅ Aprobar
                              </motion.button>
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleRejectRequest(request.id)}
                                disabled={loading}
                                className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition disabled:opacity-50"
                              >
                                ❌ Rechazar
                              </motion.button>
                            </div>
                          </div>
                        </div>
                      ))
                  )}

                  {/* Processed Requests */}
                  {registrationRequests.filter(r => r.status !== "pending").length > 0 && (
                    <div className="mt-8 pt-8 border-t border-slate-300 dark:border-slate-600">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                        📋 Solicitudes Procesadas
                      </h3>
                      <div className="space-y-2">
                        {registrationRequests
                          .filter(r => r.status !== "pending")
                          .map((request) => (
                            <div
                              key={request.id}
                              className="p-4 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-between text-sm"
                            >
                              <div>
                                <p className="font-medium text-slate-900 dark:text-white">{request.email}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {new Date(request.processed_at).toLocaleString()}
                                </p>
                              </div>
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                request.status === "approved"
                                  ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200"
                                  : "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
                              }`}>
                                {request.status === "approved" ? "✅ Aprobado" : "❌ Rechazado"}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ label, value, icon }) => (
  <motion.div
    whileHover={{ scale: 1.05 }}
    className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-slate-600 dark:text-slate-400 text-sm">{label}</p>
        <p className="text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
      </div>
      <span className="text-4xl">{icon}</span>
    </div>
  </motion.div>
);

export default AdminPanel;
