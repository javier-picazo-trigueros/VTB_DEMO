import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Navbar } from "../components/Navbar";
import LoadingSpinner from "../components/LoadingSpinner";
import { clearAuthAndRedirect } from "../utils/auth";

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
  const [dashboardData, setDashboardData] = useState({ recentVotes: [], electionParticipation: [], requestsTrend: [] });
  const [pendingBadge, setPendingBadge] = useState(0);
  const [blockchainStatus, setBlockchainStatus] = useState(null);

  // Audit filters
  const [auditFilter, setAuditFilter] = useState({
    search: '',
    electionId: '',
    dateFrom: '',
    dateTo: '',
    institution: '',
  });

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
  const [orgUnits, setOrgUnits] = useState([]);
  const [newElection, setNewElection] = useState({
    name: "",
    description: "",
    start_time: "",
    end_time: "",
    target_type: 'all',
    target_values: [],
    domains: adminDomain || '',
    selectedDomains: adminDomain ? [adminDomain] : [],
    candidates: [{ name: "", description: "" }],
    image: null,
    banner_color: '#1E3A5F',
    voter_role: 'student',
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

  // Election stats drill-down
  const [selectedElectionStats, setSelectedElectionStats] = useState(null);
  const [loadingElectionStats, setLoadingElectionStats] = useState(false);

  // Registration Requests
  const [registrationRequests, setRegistrationRequests] = useState([]);
  const [approvalPassword, setApprovalPassword] = useState("");
  const [tempPasswordInfo, setTempPasswordInfo] = useState(null);

  // Derived filtered audit (uses audit + auditFilter state)
  const filteredAudit = audit.filter(entry => {
    const search = auditFilter.search.toLowerCase();
    const matchSearch = !search ||
      entry.email?.toLowerCase().includes(search) ||
      entry.election_name?.toLowerCase().includes(search);
    const matchElection = !auditFilter.electionId ||
      String(entry.election_id) === auditFilter.electionId;
    const matchDateFrom = !auditFilter.dateFrom ||
      new Date(entry.generated_at) >= new Date(auditFilter.dateFrom);
    const matchDateTo = !auditFilter.dateTo ||
      new Date(entry.generated_at) <= new Date(auditFilter.dateTo + 'T23:59:59');
    return matchSearch && matchElection && matchDateFrom && matchDateTo;
  });

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

  // Load pending badge count on mount
  useEffect(() => {
    axios.get(`${API_URL}/admin/registration-requests?status=pending`, { headers: getAuthHeader() })
      .then(r => setPendingBadge(r.data.total || 0))
      .catch(() => {});
  }, []);

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
          setDashboardData({
            recentVotes: dashRes.data.recentVotes || [],
            electionParticipation: dashRes.data.electionParticipation || [],
            requestsTrend: dashRes.data.requestsTrend || [],
          });
          // Blockchain status (best-effort, don't block dashboard)
          axios.get(`${API_URL}/admin/blockchain-status`, { headers: getAuthHeader() })
            .then(r => setBlockchainStatus(r.data))
            .catch(() => setBlockchainStatus({ connected: false, reason: 'Request failed' }));
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
          try {
            const orgRes = await axios.get(`${API_URL}/admin/org-units`, {
              headers: getAuthHeader(),
            });
            setOrgUnits(orgRes.data.units || []);
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
          if (elections.length === 0) {
            const electRes = await axios.get(`${API_URL}/admin/elections`, { headers: getAuthHeader() });
            setElections(electRes.data.elections);
          }
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
      if (err.response?.status === 401) {
        clearAuthAndRedirect(navigate);
        return;
      }
      setError(err.response?.data?.error || "Error loading data");
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
      setError(err.response?.data?.error || "Error creating user");
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
      setError(err.response?.data?.error || "Error deleting user");
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
        voter_role: newElection.voter_role || 'student',
        target_type: newElection.target_type,
        target_values: newElection.target_type === 'all'
          ? [adminDomain || '*']
          : newElection.target_type === 'domain'
            ? (newElection.domains || '').split(',').map(d => d.trim()).filter(Boolean)
            : newElection.target_values || [],
      };

      const res = await axios.post(`${API_URL}/admin/elections`, electionPayload, {
        headers: getAuthHeader(),
      });
      const newElectionId = res.data.electionId;

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
        target_type: 'all',
        target_values: [],
        domains: adminDomain || '',
        selectedDomains: adminDomain ? [adminDomain] : [],
        candidates: [{ name: "", description: "" }],
        image: null,
        banner_color: '#1E3A5F',
        voter_role: 'student',
      });
      loadTabData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Error creating election");
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
      setError(err.response?.data?.error || "Error updating election");
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
      setError(err.response?.data?.error || "Error adding voter");
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
      setError(err.response?.data?.error || "Error adding domain");
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
      setError(err.response?.data?.error || "Error approving request");
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
      setError(err.response?.data?.error || "Error rejecting request");
    } finally {
      setLoading(false);
    }
  };

  const loadElectionStats = async (electionId) => {
    setLoadingElectionStats(true);
    try {
      const res = await axios.get(`${API_URL}/admin/elections/${electionId}/stats`, { headers: getAuthHeader() });
      setSelectedElectionStats(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Error loading election stats");
    } finally {
      setLoadingElectionStats(false);
    }
  };

  const Tab = ({ id, label, icon, badge }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === id
          ? "bg-emerald-500 text-white"
          : "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
        }`}
    >
      {icon} {label}
      {badge != null && (
        <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
          {badge}
        </span>
      )}
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
          <Tab id="inbox" label="Requests" icon="📬" badge={pendingBadge > 0 ? pendingBadge : null} />
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
                <div className="space-y-6">
                  {/* Scope badge */}
                  <div className="flex flex-wrap gap-2">
                    {isSuperAdmin ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
                        🌐 Super Admin — All institutions
                      </span>
                    ) : adminDomain && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                        🏛️ Managing: @{adminDomain}
                      </span>
                    )}
                    {!isSuperAdmin && stats.pendingRequests > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-sm font-medium">
                        📬 {stats.pendingRequests} pending requests
                      </span>
                    )}
                  </div>

                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                      { label: "Total Users", icon: "👥", value: stats.totalUsers, badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", sub: "Registered accounts" },
                      { label: "Pending Requests", icon: "📬", value: stats.pendingRequests, badgeClass: stats.pendingRequests > 0 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", sub: "Awaiting approval" },
                      { label: "Total Elections", icon: "🗳️", value: stats.totalElections, badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300", sub: "All elections" },
                      { label: "Active Elections", icon: "⚡", value: stats.activeElections, badgeClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", sub: "Currently running" },
                      { label: "Votes Cast", icon: "🔐", value: stats.totalVotes, badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300", sub: "Nullifiers issued" },
                    ].map(({ label, icon, value, badgeClass, sub }) => (
                      <motion.div
                        key={label}
                        whileHover={{ scale: 1.02 }}
                        className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-2xl">{icon}</span>
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${badgeClass}`}>
                            {label}
                          </span>
                        </div>
                        <p className="text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sub}</p>
                      </motion.div>
                    ))}
                  </div>

                  {/* Blockchain Status Card */}
                  {blockchainStatus && (
                    <div className={`flex items-center gap-4 p-4 rounded-xl border text-sm ${
                      blockchainStatus.connected
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                        : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                    }`}>
                      <span className="text-2xl">{blockchainStatus.connected ? '⛓️' : '⚠️'}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold ${blockchainStatus.connected ? 'text-emerald-800 dark:text-emerald-200' : 'text-amber-800 dark:text-amber-200'}`}>
                          {blockchainStatus.connected ? 'Blockchain Connected' : 'Blockchain Unavailable'}
                        </p>
                        {blockchainStatus.connected ? (
                          <p className="text-emerald-700 dark:text-emerald-300 text-xs mt-0.5">
                            Contract: <span className="font-mono">{blockchainStatus.contractAddress?.slice(0, 10)}…</span>
                            {' · '}Block #{blockchainStatus.blockNumber}
                            {' · '}Chain {blockchainStatus.chainId}
                            {' · '}{blockchainStatus.electionCount} elections on-chain
                          </p>
                        ) : (
                          <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5">
                            {blockchainStatus.reason || 'Node not reachable — start Hardhat or configure RPC_URL'}
                          </p>
                        )}
                      </div>
                      {blockchainStatus.connected && blockchainStatus.explorerUrl && (
                        <a
                          href={`${blockchainStatus.explorerUrl}/address/${blockchainStatus.contractAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-xs px-2 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition"
                        >
                          View contract ↗
                        </a>
                      )}
                    </div>
                  )}

                  {/* Middle row */}
                  <div className="grid lg:grid-cols-5 gap-6">
                    {/* Election Participation Table */}
                    <div className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-4 text-sm">Active Elections — Live Participation</h3>
                      {dashboardData.electionParticipation.length === 0 ? (
                        <p className="text-sm text-slate-400 dark:text-slate-500 py-6 text-center">No active elections</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="text-left py-2 text-slate-500 dark:text-slate-400 font-medium">Election</th>
                                <th className="text-right py-2 text-slate-500 dark:text-slate-400 font-medium">Voters</th>
                                <th className="text-right py-2 text-slate-500 dark:text-slate-400 font-medium">Cast</th>
                                <th className="text-right py-2 text-slate-500 dark:text-slate-400 font-medium">Rate</th>
                                <th className="py-2 text-slate-500 dark:text-slate-400 font-medium pl-3">Progress</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dashboardData.electionParticipation.map((ep) => (
                                <tr key={ep.id} className="border-b border-slate-100 dark:border-slate-700/50">
                                  <td className="py-2 text-slate-800 dark:text-slate-200 font-medium truncate max-w-[140px]">{ep.name}</td>
                                  <td className="py-2 text-right text-slate-600 dark:text-slate-400">{ep.total_voters}</td>
                                  <td className="py-2 text-right text-slate-600 dark:text-slate-400">{ep.votes_cast}</td>
                                  <td className="py-2 text-right font-semibold text-blue-600 dark:text-blue-400">{ep.rate ?? 0}%</td>
                                  <td className="py-2 pl-3 w-24">
                                    <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(ep.rate ?? 0, 100)}%` }} />
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Recent Activity Feed */}
                    <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-4 text-sm">Recent Votes</h3>
                      {dashboardData.recentVotes.length === 0 ? (
                        <p className="text-sm text-slate-400 dark:text-slate-500 py-6 text-center">No votes recorded yet</p>
                      ) : (
                        <div className="space-y-3">
                          {dashboardData.recentVotes.map((vote, i) => {
                            const email = vote.email || '';
                            const parts = email.split('@');
                            const anon = parts[0] ? parts[0].slice(0, 2) + '***' : '***';
                            const domain = parts[1] ? '@' + parts[1] : '';
                            const diff = Math.floor((Date.now() - new Date(vote.generated_at).getTime()) / 1000);
                            const timeAgo = diff < 60 ? `${diff}s ago` : diff < 3600 ? `${Math.floor(diff / 60)}m ago` : `${Math.floor(diff / 3600)}h ago`;
                            return (
                              <div key={i} className="flex items-start justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                                <div>
                                  <p className="text-xs font-mono text-slate-700 dark:text-slate-300">{anon}{domain}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{vote.election_name}</p>
                                </div>
                                <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">{timeAgo}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Requests Trend Chart */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-4 text-sm">Registration Requests — Last 7 Days</h3>
                    {dashboardData.requestsTrend.length === 0 ? (
                      <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">No registration requests in the last 7 days</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={150}>
                        <AreaChart data={dashboardData.requestsTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                          <Tooltip />
                          <Area type="monotone" dataKey="count" stroke="#3B82F6" fill="#BFDBFE" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
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

                      {/* Who can vote? */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Who can vote?
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { value: 'student', label: 'Students', desc: 'Enrolled students and voters' },
                            { value: 'admin', label: 'Admins only', desc: 'Administrators and staff' },
                            { value: 'both', label: 'Everyone', desc: 'Students and administrators' },
                          ].map(({ value, label, desc }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setNewElection(p => ({ ...p, voter_role: value }))}
                              className={`p-3 rounded-lg border text-left transition ${
                                newElection.voter_role === value
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:border-blue-400'
                              }`}
                            >
                              <p className="font-medium text-sm">{label}</p>
                              <p className={`text-xs mt-0.5 ${
                                newElection.voter_role === value
                                  ? 'text-blue-100'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}>{desc}</p>
                            </button>
                          ))}
                        </div>
                        {newElection.voter_role === 'admin' && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 mt-2">
                            This election will be visible to administrators whose domain is under yours. Their votes are recorded anonymously on the blockchain.
                          </p>
                        )}
                      </div>

                      {/* Target Audience */}
                      <div className="border border-slate-300 dark:border-slate-600 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                        <h3 className="font-bold text-slate-900 dark:text-white mb-3">Target Audience</h3>

                        {/* Target type buttons */}
                        <div className="flex gap-2 mb-3 flex-wrap">
                          {[
                            { value: 'all', label: '🌐 Everyone in my domain' },
                            { value: 'org_unit', label: '🏛️ Specific org unit' },
                            { value: 'domain', label: '📧 Email domain' },
                          ].map(({ value, label }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setNewElection(p => ({ ...p, target_type: value, target_values: [] }))}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                                newElection.target_type === value
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {newElection.target_type === 'all' && (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            All users in your domain will be eligible to vote.
                          </p>
                        )}

                        {newElection.target_type === 'org_unit' && (
                          <div>
                            <p className="text-xs text-slate-500 mb-2">
                              Select one or more org units (school, degree, year):
                            </p>
                            {orgUnits.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">No org units found. Add org units first.</p>
                            ) : (
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {orgUnits.map(unit => (
                                  <label key={unit.domain} className="flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-600/30 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={(newElection.target_values || []).includes(unit.domain)}
                                      onChange={(e) => {
                                        const vals = newElection.target_values || [];
                                        setNewElection(p => ({
                                          ...p,
                                          target_values: e.target.checked
                                            ? [...vals, unit.domain]
                                            : vals.filter(v => v !== unit.domain)
                                        }));
                                      }}
                                      className="rounded"
                                    />
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium mr-1 ${
                                      unit.unit_type === 'institution' ? 'bg-blue-100 text-blue-700' :
                                      unit.unit_type === 'school' ? 'bg-purple-100 text-purple-700' :
                                      unit.unit_type === 'degree' ? 'bg-green-100 text-green-700' :
                                      'bg-amber-100 text-amber-700'
                                    }`}>
                                      {unit.unit_type}
                                    </span>
                                    <span className="text-sm text-slate-700 dark:text-slate-300">{unit.name}</span>
                                    <span className="text-xs text-slate-400 ml-auto">@{unit.domain}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                            {(newElection.target_values || []).length > 0 && (
                              <p className="text-xs text-blue-600 mt-2">
                                {newElection.target_values.length} unit(s) selected
                              </p>
                            )}
                          </div>
                        )}

                        {newElection.target_type === 'domain' && (
                          <input
                            type="text"
                            placeholder="Email domains e.g. ufv.es, highland.edu"
                            value={newElection.domains || ''}
                            onChange={(e) => setNewElection(p => ({ ...p, domains: e.target.value }))}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                          />
                        )}
                      </div>

                      {/* Banner Color */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Banner Color</label>
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
                              Start: {start ? new Date(start * 1000).toLocaleString('en-US', { timeZone: 'Europe/Madrid' }) : 'N/A'}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-500">—</span>
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              End: {end ? new Date(end * 1000).toLocaleString('en-US', { timeZone: 'Europe/Madrid' }) : 'N/A'}
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
                                  {election.voter_role === 'admin' && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                                      ⚙️ Admins only
                                    </span>
                                  )}
                                  {election.voter_role === 'both' && (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">
                                      👥 Everyone
                                    </span>
                                  )}
                                  {election.targets && election.targets.length > 0
                                    ? election.targets.map((t, i) => (
                                        <span key={i} className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                                          {t.target_value === '*' ? 'Everyone' : `@${t.target_value}`}
                                        </span>
                                      ))
                                    : election.domains && election.domains.map((d, i) => (
                                        <span key={i} className="px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 font-medium">
                                          @{d}
                                        </span>
                                      ))
                                  }
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
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Voters by Election</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Click any election to see detailed stats</p>
                  </div>
                  {stats2.map((stat) => (
                    <div
                      key={stat.id}
                      onClick={() => loadElectionStats(stat.id)}
                      className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-bold text-slate-900 dark:text-white">{stat.election_name}</h3>
                          <div className="flex flex-wrap gap-4 mt-1">
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stat.total_voters}</span> votes cast
                            </p>
                            {stat.total_voters_assigned != null && (
                              <p className="text-sm text-slate-600 dark:text-slate-400">
                                of <span className="font-semibold">{stat.total_voters_assigned}</span> assigned
                              </p>
                            )}
                            {stat.participation_rate != null && (
                              <p className="text-sm text-slate-600 dark:text-slate-400">
                                <span className="font-semibold text-blue-600 dark:text-blue-400">{stat.participation_rate}%</span> participation
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stat.participation_rate ?? 0}%</span>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">participation</p>
                        </div>
                      </div>
                      {stat.total_voters_assigned > 0 && (
                        <div className="mt-3 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${Math.min(stat.participation_rate ?? 0, 100)}%` }}
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
                  {/* Filter UI */}
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <input
                        type="text"
                        placeholder="Search by email or election..."
                        value={auditFilter.search}
                        onChange={(e) => setAuditFilter(p => ({ ...p, search: e.target.value }))}
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                      />
                      <select
                        value={auditFilter.electionId}
                        onChange={(e) => setAuditFilter(p => ({ ...p, electionId: e.target.value }))}
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                      >
                        <option value="">All elections</option>
                        {elections.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                      <input
                        type="date"
                        value={auditFilter.dateFrom}
                        onChange={(e) => setAuditFilter(p => ({ ...p, dateFrom: e.target.value }))}
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                      />
                      <input
                        type="date"
                        value={auditFilter.dateTo}
                        onChange={(e) => setAuditFilter(p => ({ ...p, dateTo: e.target.value }))}
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                      />
                    </div>
                    {(auditFilter.search || auditFilter.electionId || auditFilter.dateFrom) && (
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-xs text-slate-500">Active filters:</span>
                        <button
                          onClick={() => setAuditFilter({ search: '', electionId: '', dateFrom: '', dateTo: '', institution: '' })}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Clear all ✕
                        </button>
                        <span className="text-xs text-slate-400 ml-auto">{filteredAudit.length} results</span>
                      </div>
                    )}
                  </div>

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
                        {filteredAudit.map((entry) => {
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
                                {new Date(entry.generated_at).toLocaleString('en-US', { timeZone: 'Europe/Madrid' })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredAudit.length === 0 && (
                      <p className="text-center text-slate-500 dark:text-slate-400 py-8">
                        {audit.length === 0 ? 'No audit records found' : 'No records match the current filters'}
                      </p>
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
                                {new Date(request.created_at).toLocaleString('en-US', { timeZone: 'Europe/Madrid' })}
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
                                  {request.reviewed_at && new Date(request.reviewed_at).toLocaleString('en-US', { timeZone: 'Europe/Madrid' })}
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

      {/* Election Stats Modal */}
      <AnimatePresence>
        {(selectedElectionStats || loadingElectionStats) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedElectionStats(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl my-8 overflow-hidden"
            >
              {/* Modal Header */}
              <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    {selectedElectionStats?.election?.name || 'Loading...'}
                  </h2>
                  {selectedElectionStats?.election && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      {new Date(selectedElectionStats.election.startDate).toLocaleDateString('en-US')} — {new Date(selectedElectionStats.election.endDate).toLocaleDateString('en-US')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedElectionStats(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl font-bold w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  ×
                </button>
              </div>

              {loadingElectionStats ? (
                <div className="p-12 text-center">
                  <LoadingSpinner message="Loading election statistics..." />
                </div>
              ) : selectedElectionStats && (
                <div className="p-6 space-y-6">
                  {/* KPI Row */}
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Census', value: selectedElectionStats.stats.totalVoters, icon: '👥', color: 'blue' },
                      { label: 'Votes Cast', value: selectedElectionStats.stats.totalVotes, icon: '🗳️', color: 'emerald' },
                      { label: 'Participation', value: `${selectedElectionStats.stats.participationRate}%`, icon: '📊', color: 'purple' },
                    ].map(({ label, value, icon, color }) => (
                      <div key={label} className={`bg-${color}-50 dark:bg-${color}-900/20 border border-${color}-200 dark:border-${color}-800 rounded-xl p-4 text-center`}>
                        <p className="text-2xl mb-1">{icon}</p>
                        <p className={`text-2xl font-bold text-${color}-700 dark:text-${color}-300`}>{value}</p>
                        <p className={`text-xs text-${color}-600 dark:text-${color}-400 mt-0.5`}>{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Candidate Chart */}
                  {selectedElectionStats.candidates?.length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-3 text-sm">Votes by Candidate</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={selectedElectionStats.candidates} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip formatter={(v) => [v, 'Votes']} />
                          <Bar dataKey="votes" radius={[4, 4, 0, 0]}>
                            {selectedElectionStats.candidates.map((_, i) => (
                              <Cell key={i} fill={['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'][i % 6]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Candidate Table */}
                  {selectedElectionStats.candidates?.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-700/50">
                          <tr>
                            <th className="text-left py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">#</th>
                            <th className="text-left py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">Candidate</th>
                            <th className="text-right py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">Votes</th>
                            <th className="text-right py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedElectionStats.candidates.map((c, i) => {
                            const maxVotes = selectedElectionStats.candidates[0]?.votes || 0;
                            const isWinner = i === 0 && c.votes > 0;
                            return (
                              <tr key={c.id} className="border-t border-slate-100 dark:border-slate-700">
                                <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono text-xs">#{i + 1}</td>
                                <td className="py-3 px-4 text-slate-900 dark:text-white font-medium">
                                  {isWinner && <span className="mr-1.5">👑</span>}
                                  {c.name}
                                  {c.description && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{c.description}</span>}
                                </td>
                                <td className="py-3 px-4 text-right font-semibold text-slate-800 dark:text-slate-200">{c.votes}</td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${c.percentage}%` }} />
                                    </div>
                                    <span className="text-blue-600 dark:text-blue-400 font-medium text-xs w-10 text-right">{c.percentage}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Voter List */}
                  {selectedElectionStats.voters?.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-3 text-sm">
                        Voter Participation ({selectedElectionStats.voters.filter(v => v.has_voted).length} / {selectedElectionStats.voters.length} voted)
                      </h3>
                      <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-xs">
                          <tbody>
                            {selectedElectionStats.voters.map((v, i) => (
                              <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                                <td className="py-2 px-4 font-mono text-slate-700 dark:text-slate-300">{v.email}</td>
                                <td className="py-2 px-4 text-right">
                                  {v.has_voted ? (
                                    <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full font-medium">Voted</span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full">Pending</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Domains */}
                  {selectedElectionStats.domains?.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-2 text-sm">Allowed Domains</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedElectionStats.domains.map((d) => (
                          <span key={d} className="px-3 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full text-sm font-medium">
                            @{d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => { setSelectedElectionStats(null); navigate(`/results/${selectedElectionStats.election.id}`); }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
                    >
                      View Public Results
                    </button>
                    {selectedElectionStats.election.is_active && (
                      <button
                        onClick={async () => {
                          if (!window.confirm('Close this election? This will deactivate it.')) return;
                          try {
                            await axios.put(`${API_URL}/admin/elections/${selectedElectionStats.election.id}`, { is_active: false }, { headers: getAuthHeader() });
                            setSuccess('Election closed');
                            setSelectedElectionStats(null);
                            loadTabData();
                            setTimeout(() => setSuccess(''), 3000);
                          } catch (err) {
                            setError(err.response?.data?.error || 'Error closing election');
                          }
                        }}
                        className="px-4 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium transition"
                      >
                        Close Election
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedElectionStats(null)}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition ml-auto"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
