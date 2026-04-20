import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Navbar } from "../components/Navbar";
import LoadingSpinner from "../components/LoadingSpinner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const AdminPanel = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Domain scoping
  const adminDomain = localStorage.getItem('vtb-admin-domain') || '';
  const userRole = localStorage.getItem('vtb-role') || '';
  const isSuperAdmin = userRole === 'superadmin';

  // Dashboard
  const [stats, setStats] = useState(null);

  // Users
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    student_id: "",
    role: "student",
    admin_domain: "",
  });

  // Elections
  const [elections, setElections] = useState([]);
  const [availableDomains, setAvailableDomains] = useState([]);
  const [newElection, setNewElection] = useState({
    name: "",
    description: "",
    start_time: "",
    end_time: "",
    selectedDomains: adminDomain ? [adminDomain] : [],
    candidates: [{ name: "", description: "" }],
    image: null,
    banner_color: '#1E3A5F',
    target_type: 'domain',
    target_description: '',
  });

  // Audit
  const [audit, setAudit] = useState([]);
  const [stats2, setStats2] = useState([]);

  // Advanced Election Census State
  const [expandedElection, setExpandedElection] = useState(null);
  const [manageCensus, setManageCensus] = useState({ email: '', domain: '' });

  // Student Votes
  const [studentVotes, setStudentVotes] = useState([]);
  const [selectedElectionForVotes, setSelectedElectionForVotes] = useState(null);

  // Registration Requests
  const [registrationRequests, setRegistrationRequests] = useState([]);
  const [approvalPassword, setApprovalPassword] = useState("");
  const [tempPasswordInfo, setTempPasswordInfo] = useState(null);

  // Verificar admin al montar
  useEffect(() => {
    const token = localStorage.getItem("vtb-token");
    const role = localStorage.getItem("vtb-role");

    if (!token || (role !== "admin" && role !== "superadmin")) {
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
        case "dashboard": {
          const dashRes = await axios.get(`${API_URL}/admin/dashboard`, {
            headers: getAuthHeader(),
          });
          setStats(dashRes.data.stats);
          break;
        }
        case "users": {
          const usersRes = await axios.get(`${API_URL}/admin/users`, {
            headers: getAuthHeader(),
          });
          setUsers(usersRes.data.users);
          break;
        }
        case "elections": {
          const electRes = await axios.get(`${API_URL}/admin/elections`, {
            headers: getAuthHeader(),
          });
          setElections(electRes.data.elections);
          try {
            const domainsRes = await axios.get(`${API_URL}/admin/domains`, {
              headers: getAuthHeader(),
            });
            setAvailableDomains(domainsRes.data.domains || []);
          } catch {
            // ignore
          }
          break;
        }
        case "audit": {
          const auditRes = await axios.get(`${API_URL}/admin/audit`, {
            headers: getAuthHeader(),
          });
          setAudit(auditRes.data.audit);
          break;
        }
        case "stats": {
          const statsRes = await axios.get(`${API_URL}/admin/stats/voters`, {
            headers: getAuthHeader(),
          });
          setStats2(statsRes.data.stats);
          break;
        }
        case "inbox": {
          const regRes = await axios.get(`${API_URL}/admin/registration-requests?status=all`, {
            headers: getAuthHeader(),
          });
          setRegistrationRequests(regRes.data.requests);
          break;
        }
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
      setSuccess("User created successfully");
      setNewUser({ email: "", password: "", name: "", student_id: "", role: "student", admin_domain: "" });
      loadTabData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Error creando usuario");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Delete this user?")) return;

    try {
      await axios.delete(`${API_URL}/admin/users/${userId}`, {
        headers: getAuthHeader(),
      });
      setSuccess("User deleted");
      loadTabData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Error eliminando usuario");
    }
  };

  const handleToggleDomain = (domain) => {
    setNewElection(prev => {
      const selected = prev.selectedDomains.includes(domain)
        ? prev.selectedDomains.filter(d => d !== domain)
        : [...prev.selectedDomains, domain];
      return { ...prev, selectedDomains: selected };
    });
  };

  const handleSelectAllDomains = () => {
    setNewElection(prev => ({
      ...prev,
      selectedDomains: prev.selectedDomains.length === availableDomains.length
        ? []
        : [...availableDomains],
    }));
  };

  const handleCreateElection = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const startUnix = Math.floor(new Date(newElection.start_time).getTime() / 1000);
      const endUnix = Math.floor(new Date(newElection.end_time).getTime() / 1000);

      const electionPayload = {
        name: newElection.name,
        description: newElection.description,
        start_time: startUnix,
        end_time: endUnix,
        banner_color: newElection.banner_color,
        target_type: newElection.target_type,
        target_description: newElection.target_description || null,
      };

      const res = await axios.post(`${API_URL}/admin/elections`, electionPayload, {
        headers: getAuthHeader(),
      });
      const newElectionId = res.data.electionId;

      // Add selected domains
      for (const domain of newElection.selectedDomains) {
        try {
          await axios.post(`${API_URL}/admin/elections/${newElectionId}/domains`, { domain }, { headers: getAuthHeader() });
        } catch (e) {
          console.error(`Error adding domain ${domain}:`, e);
        }
      }

      // Add candidates
      const validCandidates = newElection.candidates.filter(c => c.name.trim() !== "");
      for (const candidate of validCandidates) {
        try {
          await axios.post(`${API_URL}/admin/elections/${newElectionId}/candidates`, candidate, { headers: getAuthHeader() });
        } catch (e) {
          console.error("Error adding candidate:", e);
        }
      }

      // Upload image if selected
      if (newElection.image) {
        try {
          const formData = new FormData();
          formData.append('file', newElection.image);
          await axios.post(`${API_URL}/admin/elections/${newElectionId}/image`, formData, {
            headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' },
          });
        } catch (e) {
          console.error("Error uploading election image:", e);
        }
      }

      setSuccess("Election created successfully");
      setNewElection({
        name: "",
        description: "",
        start_time: "",
        end_time: "",
        selectedDomains: adminDomain ? [adminDomain] : [],
        candidates: [{ name: "", description: "" }],
        image: null,
        banner_color: '#1E3A5F',
        target_type: 'domain',
        target_description: '',
      });
      loadTabData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Error creando votación");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCandidateField = () => {
    setNewElection(prev => ({
      ...prev,
      candidates: [...prev.candidates, { name: "", description: "" }]
    }));
  };

  const handleCandidateChange = (index, field, value) => {
    const newCandidates = [...newElection.candidates];
    newCandidates[index][field] = value;
    setNewElection(prev => ({ ...prev, candidates: newCandidates }));
  };

  const handleRemoveCandidateField = (index) => {
    const newCandidates = newElection.candidates.filter((_, i) => i !== index);
    setNewElection(prev => ({ ...prev, candidates: newCandidates }));
  };

  const handleToggleElection = async (electionId, is_active) => {
    try {
      await axios.put(
        `${API_URL}/admin/elections/${electionId}`,
        { is_active: !is_active },
        { headers: getAuthHeader() }
      );
      setSuccess("Election updated");
      loadTabData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Error actualizando votación");
    }
  };

  const handleAddVoter = async (electionId) => {
    try {
      if (!manageCensus.email.trim()) return;
      await axios.post(`${API_URL}/admin/elections/${electionId}/voters`, { email: manageCensus.email.trim() }, { headers: getAuthHeader() });
      setSuccess("Voter added to census");
      setManageCensus({ ...manageCensus, email: '' });
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Error añadiendo votante");
    }
  };

  const handleAddDomain = async (electionId) => {
    try {
      if (!manageCensus.domain.trim()) return;
      await axios.post(`${API_URL}/admin/elections/${electionId}/domains`, { domain: manageCensus.domain.trim() }, { headers: getAuthHeader() });
      setSuccess("Domain added to census");
      setManageCensus({ ...manageCensus, domain: '' });
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Error añadiendo dominio");
    }
  };

  const downloadCSVTemplate = (columns, filename) => {
    const header = columns.join(',');
    const example = columns.map(c => {
      if (c === 'email') return 'student@example.edu';
      if (c === 'full_name') return 'John Doe';
      if (c === 'student_id') return 'STU-001';
      if (c === 'send_email') return 'true';
      if (c === 'role') return 'student';
      return '';
    }).join(',');
    const csv = `${header}\n${example}\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCSVImport = async (e, electionId) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(
        `${API_URL}/admin/elections/${electionId}/import-voters`,
        formData,
        { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } }
      );
      const r = res.data.results;
      setSuccess(`CSV imported: ${r.created} users created, ${r.added} added, ${r.skipped} skipped`);
      if (r.errors?.length) console.warn('Import errors:', r.errors);
      loadTabData();
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError(err.response?.data?.error || "Error importing CSV");
    }
    e.target.value = '';
  };

  const handleCSVUsersImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(
        `${API_URL}/admin/users/import`,
        formData,
        { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } }
      );
      const r = res.data.results;
      setSuccess(`Users imported: ${r.created} created, ${r.skipped} skipped`);
      if (r.errors?.length) console.warn('Import errors:', r.errors);
      loadTabData();
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError(err.response?.data?.error || "Error importing users CSV");
    }
    e.target.value = '';
  };

  const getElectionStatus = (election) => {
    const now = Math.floor(Date.now() / 1000);
    const start = election.start_time || election.startTime;
    const end = election.end_time || election.endTime;
    if (election.is_active && now >= start && now <= end) return 'active';
    if (now < start) return 'upcoming';
    return 'closed';
  };

  const handleApproveRequest = async (requestId, email) => {
    setLoading(true);
    try {
      const response = await axios.patch(
        `${API_URL}/admin/registration-requests/${requestId}`,
        { action: 'approve' },
        { headers: getAuthHeader() }
      );
      if (response.data.tempPassword) {
        setTempPasswordInfo({
          email: email,
          password: response.data.tempPassword
        });
      } else {
        setSuccess(`User approved. They can log in with the password they chose during registration.`);
        setTimeout(() => setSuccess(""), 5000);
      }
      loadTabData();
    } catch (err) {
      setError(err.response?.data?.error || "Error aprobando solicitud");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectRequest = async (requestId) => {
    const reason = prompt("Enter the rejection reason:");
    if (!reason?.trim()) return;

    setLoading(true);
    try {
      await axios.patch(
        `${API_URL}/admin/registration-requests/${requestId}`,
        { action: 'reject', reason },
        { headers: getAuthHeader() }
      );
      setSuccess("Request rejected");
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
      className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === id
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
            Administration Panel
            {!isSuperAdmin && adminDomain && (
              <span className="ml-3 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                Domain: @{adminDomain}
              </span>
            )}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            {isSuperAdmin
              ? 'Super Administrator — Full access to all domains'
              : 'Manage users, elections and system audit'
            }
          </p>
        </motion.div>

        {/* Alerts */}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-lg"
          >
            {success}
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg"
          >
            {error}
          </motion.div>
        )}

        {tempPasswordInfo && (
          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 dark:border-yellow-600 rounded-lg">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-yellow-800 dark:text-yellow-200 mb-1">
                  Temporary password generated
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                  User: {tempPasswordInfo.email}
                </p>
                <div className="flex items-center gap-2">
                  <code className="bg-yellow-100 dark:bg-yellow-900 px-3 py-2 rounded font-mono text-lg font-bold text-yellow-900 dark:text-yellow-100">
                    {tempPasswordInfo.password}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(tempPasswordInfo.password); }}
                    className="px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded text-sm font-medium transition"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                  Share this password with the user. It is only shown once.
                </p>
              </div>
              <button
                onClick={() => setTempPasswordInfo(null)}
                className="text-yellow-600 hover:text-yellow-800 font-bold text-xl ml-4"
              >
                x
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mt-8 flex flex-wrap gap-3 mb-8">
          <Tab id="dashboard" label="Dashboard" icon="📊" />
          <Tab id="inbox" label="Requests" icon="📬" />
          <Tab id="users" label="Users" icon="👥" />
          <Tab id="elections" label="Elections" icon="🗳️" />
          <Tab id="stats" label="Statistics" icon="📈" />
          <Tab id="audit" label="Vote Audit" icon="🔐" />
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <LoadingSpinner message={`Loading ${activeTab}...`} />
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
                <>
                  <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <StatCard label="Total Users" value={stats.totalUsers} icon="👥" />
                    <StatCard label="Admins" value={stats.adminCount} icon="👨‍💼" />
                    <StatCard label="Students" value={stats.studentCount} icon="🎓" />
                    <StatCard label="Elections" value={stats.totalElections} icon="🗳️" />
                    <StatCard label="Nullifiers" value={stats.totalNullifiers} icon="🔐" />
                  </div>
                  {!isSuperAdmin && adminDomain && (
                    <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                      Showing data for domain @{adminDomain}
                    </p>
                  )}
                </>
              )}

              {/* Users */}
              {activeTab === "users" && (
                <div className="space-y-8">
                  {!isSuperAdmin && adminDomain && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-blue-700 dark:text-blue-300 text-sm">
                      Managing users of @{adminDomain}
                    </div>
                  )}
                  {/* Form */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700"
                  >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Create New User</h2>
                    <form onSubmit={handleCreateUser} className="grid md:grid-cols-2 gap-4">
                      <input
                        type="email"
                        placeholder="Email"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        disabled={loading}
                        required
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                      />
                      <input
                        type="text"
                        placeholder="Full name"
                        value={newUser.name}
                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                        disabled={loading}
                        required
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                      />
                      <input
                        type="text"
                        placeholder="Student ID"
                        value={newUser.student_id}
                        onChange={(e) => setNewUser({ ...newUser, student_id: e.target.value })}
                        disabled={loading}
                        required
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        disabled={loading}
                        required
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                      />
                      <select
                        value={newUser.role || 'student'}
                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      >
                        <option value="student">Voter</option>
                        <option value="admin">Domain Admin</option>
                      </select>
                      {newUser.role === 'admin' && (
                        <input
                          type="text"
                          placeholder="Admin domain (e.g. ufv.es)"
                          value={newUser.admin_domain || ''}
                          onChange={(e) => setNewUser({ ...newUser, admin_domain: e.target.value })}
                          className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                        />
                      )}
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        type="submit"
                        disabled={loading}
                        className="md:col-span-2 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition disabled:opacity-50"
                      >
                        {loading ? "Creating..." : "Create User"}
                      </motion.button>
                    </form>
                  </motion.div>

                  {/* Import Users from CSV */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700"
                  >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Import Users from CSV</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                      Upload a CSV with columns: <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">email, full_name, student_id, role</code>
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => downloadCSVTemplate(['email','full_name','student_id','role'], 'vtb_users_template.csv')}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                      >
                        Download Template
                      </button>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleCSVUsersImport}
                        className="hidden"
                        id="csv-users-import"
                      />
                      <label
                        htmlFor="csv-users-import"
                        className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
                      >
                        Import Users CSV
                      </label>
                    </div>
                  </motion.div>

                  {/* Users List */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 overflow-x-auto"
                  >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Registered Users ({users.length})</h2>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-300 dark:border-slate-600">
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Email</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Name</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Role</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Status</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr key={user.id} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">
                            <td className="py-3 px-4 text-slate-900 dark:text-white">{user.email}</td>
                            <td className="py-3 px-4 text-slate-800 dark:text-slate-200">{user.name}</td>
                            <td className="py-3 px-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${user.role === "admin" || user.role === "superadmin"
                                  ? "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200"
                                  : "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200"
                                }`}>
                                {user.role === "admin" ? "Admin" : user.role === "superadmin" ? "Super Admin" : "Voter"}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${user.is_approved
                                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
                                  : "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200"
                                }`}>
                                {user.is_approved ? "Approved" : "Pending"}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 rounded font-medium transition text-xs"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {users.length === 0 && (
                      <p className="text-center text-slate-500 dark:text-slate-400 py-8">No users found</p>
                    )}
                  </motion.div>
                </div>
              )}

              {/* Elections */}
              {activeTab === "elections" && (
                <div className="space-y-8">
                  {/* Create Election Form */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700"
                  >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Create New Election</h2>
                    <form onSubmit={handleCreateElection} className="space-y-5">

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Election Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Student Council 2025"
                          value={newElection.name}
                          onChange={(e) => setNewElection({ ...newElection, name: e.target.value })}
                          disabled={loading}
                          required
                          className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                        <textarea
                          placeholder="Brief description of the election..."
                          value={newElection.description}
                          onChange={(e) => setNewElection({ ...newElection, description: e.target.value })}
                          disabled={loading}
                          className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                          rows={3}
                        />
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date & Time</label>
                          <input
                            type="datetime-local"
                            value={newElection.start_time}
                            onChange={(e) => setNewElection({ ...newElection, start_time: e.target.value })}
                            disabled={loading}
                            required
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Date & Time</label>
                          <input
                            type="datetime-local"
                            value={newElection.end_time}
                            onChange={(e) => setNewElection({ ...newElection, end_time: e.target.value })}
                            disabled={loading}
                            required
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      {/* Domains - multi-select list */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Allowed Domains
                          {newElection.selectedDomains.length > 0 && (
                            <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                              ({newElection.selectedDomains.length} selected)
                            </span>
                          )}
                        </label>
                        {availableDomains.length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                            No domains available. Add users first or type a domain below.
                          </p>
                        ) : (
                          <div className="border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700/50 p-3 max-h-48 overflow-y-auto space-y-2">
                            {/* Select All */}
                            <label className="flex items-center gap-3 cursor-pointer p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 select-none">
                              <input
                                type="checkbox"
                                checked={availableDomains.length > 0 && newElection.selectedDomains.length === availableDomains.length}
                                onChange={handleSelectAllDomains}
                                className="w-4 h-4 rounded accent-emerald-500"
                              />
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">All domains</span>
                            </label>
                            <div className="border-t border-slate-200 dark:border-slate-600 pt-2 space-y-1">
                              {availableDomains.map(domain => (
                                <label key={domain} className="flex items-center gap-3 cursor-pointer p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 select-none">
                                  <input
                                    type="checkbox"
                                    checked={newElection.selectedDomains.includes(domain)}
                                    onChange={() => handleToggleDomain(domain)}
                                    disabled={!isSuperAdmin && adminDomain === domain}
                                    className="w-4 h-4 rounded accent-emerald-500"
                                  />
                                  <span className="text-sm text-slate-700 dark:text-slate-300">@{domain}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Target Type */}
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target Type</label>
                          <select
                            value={newElection.target_type}
                            onChange={(e) => setNewElection({ ...newElection, target_type: e.target.value })}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                          >
                            <option value="domain">Email Domain</option>
                            <option value="org_unit">Org Unit (School/Degree/Year)</option>
                            <option value="csv">Custom List (CSV)</option>
                            <option value="course">Course/Subject</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Banner Color
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={newElection.banner_color}
                              onChange={(e) => setNewElection({ ...newElection, banner_color: e.target.value })}
                              className="h-10 w-20 rounded cursor-pointer border border-slate-300 dark:border-slate-600"
                            />
                            <span className="text-sm text-slate-600 dark:text-slate-400">{newElection.banner_color}</span>
                          </div>
                        </div>
                      </div>

                      {newElection.target_type !== 'domain' && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target Description</label>
                          <input
                            type="text"
                            placeholder="e.g. Computer Science Year 2, or course code CS201"
                            value={newElection.target_description}
                            onChange={(e) => setNewElection({ ...newElection, target_description: e.target.value })}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                          />
                        </div>
                      )}

                      {/* Image Upload */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Election Banner Image (optional)</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setNewElection({ ...newElection, image: e.target.files[0] || null })}
                          className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50"
                        />
                        {newElection.image && (
                          <img
                            src={URL.createObjectURL(newElection.image)}
                            alt="Preview"
                            className="h-20 rounded mt-2 object-cover"
                          />
                        )}
                      </div>

                      {/* Candidates */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Candidates</label>
                        <div className="border border-slate-300 dark:border-slate-600 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                          <div className="flex justify-end mb-3">
                            <button type="button" onClick={handleAddCandidateField} className="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition">
                              + Add Candidate
                            </button>
                          </div>
                          {newElection.candidates.map((candidate, idx) => (
                            <div key={idx} className="flex gap-2 mb-2">
                              <input
                                type="text"
                                placeholder="Candidate name"
                                value={candidate.name}
                                onChange={(e) => handleCandidateChange(idx, 'name', e.target.value)}
                                className="flex-1 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm"
                                required
                              />
                              <input
                                type="text"
                                placeholder="Brief description"
                                value={candidate.description}
                                onChange={(e) => handleCandidateChange(idx, 'description', e.target.value)}
                                className="flex-1 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm"
                              />
                              {newElection.candidates.length > 1 && (
                                <button type="button" onClick={() => handleRemoveCandidateField(idx)} className="px-2 text-red-500 hover:text-red-700 font-bold">
                                  x
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg transition disabled:opacity-50"
                      >
                        {loading ? "Creating..." : "Create Election"}
                      </motion.button>
                    </form>
                  </motion.div>

                  {/* Elections List */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Registered Elections</h2>
                    {elections.map((election) => {
                      const status = getElectionStatus(election);
                      const start = election.start_time || election.startTime;
                      const end = election.end_time || election.endTime;
                      return (
                        <div key={election.id}>
                          {/* Status and date info above card */}
                          <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              status === 'active' ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200" :
                              status === 'upcoming' ? "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200" :
                              "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                            }`}>
                              {status.toUpperCase()}
                            </span>
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              Start: {start ? new Date(start * 1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'N/A'}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-500">—</span>
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              End: {end ? new Date(end * 1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'N/A'}
                            </span>
                          </div>

                          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 flex flex-col">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="font-bold text-slate-900 dark:text-white text-lg">{election.name}</h3>
                                <div className="flex flex-wrap gap-2 mt-2 mb-3 text-xs">
                                  <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-medium">
                                    {election.candidates?.length || "N/A"} candidates
                                  </span>
                                  {election.domains && election.domains.map((d, i) => (
                                    <span key={i} className="px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 font-medium">
                                      @{d}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400">{election.description}</p>
                              </div>
                              <div className="ml-4 flex flex-col gap-2 items-end">
                                <button
                                  onClick={() => handleToggleElection(election.id, election.is_active)}
                                  className={`px-4 py-2 rounded-lg font-medium transition text-sm w-36 ${election.is_active !== false
                                      ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
                                      : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                                    }`}
                                >
                                  {election.is_active !== false ? "Visible" : "Hidden"}
                                </button>
                                <button
                                  onClick={() => setExpandedElection(expandedElection === election.id ? null : election.id)}
                                  className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg transition font-medium text-sm w-36"
                                >
                                  Manage Census
                                </button>
                              </div>
                            </div>

                            {/* Gestionar Censo Section */}
                            {expandedElection === election.id && (
                              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                <h4 className="font-bold text-slate-900 dark:text-white mb-3 text-sm">Manage Census</h4>
                                <div className="grid md:grid-cols-2 gap-4 mb-3">
                                  <div className="flex gap-2">
                                    <input
                                      type="email"
                                      placeholder="voter@email.com"
                                      className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded"
                                      value={manageCensus.email}
                                      onChange={e => setManageCensus({ ...manageCensus, email: e.target.value })}
                                    />
                                    <button onClick={() => handleAddVoter(election.id)} className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">Add voter</button>
                                  </div>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      placeholder="new-domain.edu"
                                      className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded"
                                      value={manageCensus.domain}
                                      onChange={e => setManageCensus({ ...manageCensus, domain: e.target.value })}
                                    />
                                    <button onClick={() => handleAddDomain(election.id)} className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">Add domain</button>
                                  </div>
                                </div>
                                {/* CSV Import */}
                                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-600">
                                  <button
                                    type="button"
                                    onClick={() => downloadCSVTemplate(['email','full_name','student_id','send_email'], 'vtb_voters_template.csv')}
                                    className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                                  >
                                    Download CSV Template
                                  </button>
                                  <input
                                    type="file"
                                    accept=".csv"
                                    onChange={(e) => handleCSVImport(e, election.id)}
                                    className="hidden"
                                    id={`csv-import-${election.id}`}
                                  />
                                  <label
                                    htmlFor={`csv-import-${election.id}`}
                                    className="cursor-pointer px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
                                  >
                                    Import CSV
                                  </label>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {elections.length === 0 && (
                      <div className="bg-white dark:bg-slate-800 p-8 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                        <p className="text-slate-500 dark:text-slate-400">No elections found</p>
                      </div>
                    )}
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
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Voters by Election</h2>
                  {stats2.map((stat) => (
                    <div
                      key={stat.id}
                      className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-white">{stat.election_name}</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {stat.total_voters} voters participated
                          </p>
                        </div>
                        <span className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">{stat.total_voters}</span>
                      </div>
                      {stat.total_voters > 0 && (
                        <div className="mt-3 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.min((stat.total_voters / 100) * 100, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  {stats2.length === 0 && (
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                      <p className="text-slate-500 dark:text-slate-400">No statistics available</p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Audit */}
              {activeTab === "audit" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Vote Audit Log</h2>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-300 dark:border-slate-600">
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Voter Email</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Election</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Vote Hash</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.map((entry) => {
                          const truncateHash = (h) => h ? `${h.slice(0, 10)}...${h.slice(-6)}` : '—';
                          return (
                            <tr
                              key={entry.id}
                              className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                            >
                              <td className="py-3 px-4 font-mono text-xs text-slate-800 dark:text-slate-200">{entry.email}</td>
                              <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{entry.election_name}</td>
                              <td className="py-3 px-4 font-mono text-xs">
                                <span className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 px-2 py-1 rounded">
                                  {truncateHash(entry.nullifier_hash)}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                                {new Date(entry.generated_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {audit.length === 0 && (
                      <p className="text-center text-slate-500 dark:text-slate-400 py-8">No audit records found</p>
                    )}
                  </div>

                  {/* Privacy Notice */}
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 rounded-lg">
                    <p className="text-sm text-emerald-800 dark:text-emerald-200">
                      <strong>Vote privacy guaranteed:</strong> This audit log confirms participation without revealing candidate choices. Vote hashes are cryptographically anonymous and cannot be reversed.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Registration Requests */}
              {activeTab === "inbox" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Pending Registration Requests ({registrationRequests.filter(r => r.status === "pending").length})
                  </h2>

                  {registrationRequests.filter(r => r.status === "pending").length === 0 ? (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-6 rounded-lg text-center">
                      <p className="text-blue-800 dark:text-blue-200">No pending requests</p>
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
                              <p className="text-sm text-slate-500 dark:text-slate-400">Email</p>
                              <p className="font-mono text-slate-900 dark:text-white">{request.email}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-500 dark:text-slate-400">Full Name</p>
                              <p className="font-semibold text-slate-900 dark:text-white">{request.full_name}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-500 dark:text-slate-400">Student ID</p>
                              <p className="font-mono text-slate-900 dark:text-white">{request.student_id}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-500 dark:text-slate-400">Request Date</p>
                              <p className="text-sm text-slate-900 dark:text-white">
                                {new Date(request.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
                              </p>
                            </div>
                          </div>

                          <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg space-y-3">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              A temporary password will be generated automatically if needed
                            </p>
                            <div className="flex gap-3 pt-2">
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleApproveRequest(request.id, request.email)}
                                disabled={loading}
                                className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition disabled:opacity-50"
                              >
                                Approve
                              </motion.button>
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleRejectRequest(request.id)}
                                disabled={loading}
                                className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition disabled:opacity-50"
                              >
                                Reject
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
                        Processed Requests
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
                                  {request.reviewed_at && new Date(request.reviewed_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
                                </p>
                              </div>
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${request.status === "approved"
                                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
                                  : "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200"
                                }`}>
                                {request.status === "approved" ? "Approved" : "Rejected"}
                              </span>
                              {request.status === 'approved' && request.approved_password && (
                                <div className="mt-2 ml-4 flex items-center gap-2">
                                  <code className="text-xs bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded font-mono">
                                    {request.approved_password}
                                  </code>
                                  <button
                                    onClick={() => navigator.clipboard.writeText(request.approved_password)}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    Copy
                                  </button>
                                </div>
                              )}
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
