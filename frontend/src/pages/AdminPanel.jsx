import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Navbar } from "../components/Navbar";
import { OnboardingTour } from "../components/OnboardingTour";
import LoadingSpinner from "../components/LoadingSpinner";
import { clearAuthAndRedirect } from "../utils/auth";
import toast from 'react-hot-toast';
import QRCode from 'react-qr-code';
import { api } from "../utils/apiClient";
import { useAuth } from "../context/AuthContext";

/**
 * Clases completas y literales para los KPI de estadísticas.
 *
 * Antes se construían con plantillas (`bg-${color}-50`). Tailwind escanea el
 * código con expresiones regulares y no evalúa plantillas, así que ninguna de
 * esas clases llegaba a generarse: las tres tarjetas salían sin fondo, sin
 * borde y con el texto en el color heredado.
 *
 * Escritas enteras, el escáner las ve.
 */
const KPI_TONES = {
  blue: {
    box:   'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800',
    value: 'text-blue-700 dark:text-blue-300',
    label: 'text-blue-600 dark:text-blue-400',
  },
  emerald: {
    box:   'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800',
    value: 'text-emerald-700 dark:text-emerald-300',
    label: 'text-emerald-600 dark:text-emerald-400',
  },
  purple: {
    box:   'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800',
    value: 'text-purple-700 dark:text-purple-300',
    label: 'text-purple-600 dark:text-purple-400',
  },
};

export const AdminPanel = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [rejectReasonId, setRejectReasonId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [qrElection, setQrElection] = useState(null);
  const [closeElectionConfirm, setCloseElectionConfirm] = useState(false);

  // Identidad del admin.
  //
  // Antes esto leía localStorage.getItem('vtb-user'), una clave que dejó de
  // escribirse al migrar a cookies httpOnly — el único código que la toca hoy
  // es clearAuthAndRedirect(), que la borra. El resultado era permanente:
  // adminDomain = '', userRole = '', isSuperAdmin = false SIEMPRE, incluso
  // para un superadmin. Los badges de dominio no aparecían nunca y el tour de
  // onboarding no llegaba a arrancar.
  //
  // AdminPanel se monta dentro de <ProtectedRoute>, que espera a que
  // AuthContext termine de hidratar, así que `user` ya está poblado en el
  // primer render y los useState() de abajo pueden leerlo con seguridad.
  const { user } = useAuth();
  const adminDomain = user?.adminDomain || '';
  const userRole = user?.role || '';
  const isSuperAdmin = userRole === 'superadmin';

  // Dashboard
  const [stats, setStats] = useState(null);
  const [dashboardData, setDashboardData] = useState({ recentVotes: [], electionParticipation: [], requestsTrend: [] });
  const [pendingBadge, setPendingBadge] = useState(0);
  const [blockchainStatus, setBlockchainStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);

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
  const [schoolsData, setSchoolsData] = useState([]);
  const [newElection, setNewElection] = useState({
    name: "",
    description: "",
    start_time: "",
    end_time: "",
    target_type: 'all',
    target_values: [],
    target_schools: [],
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

  // Edit election modal
  const [editingElection, setEditingElection] = useState(null);

  // Users pagination
  const USERS_PER_PAGE = 10;
  const [usersPage, setUsersPage] = useState(1);

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
  const [inboxDomainFilter, setInboxDomainFilter] = useState('');
  const [inboxStatusFilter, setInboxStatusFilter] = useState('pending');

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

  // Cargar datos según tab
  useEffect(() => {
    loadTabData();
  }, [activeTab]);

  // Load pending badge count on mount
  useEffect(() => {
    api.get('/admin/registration-requests?status=pending')
      .then(r => setPendingBadge(r.data.total || 0))
      .catch(() => {});
  }, []);

  const cardTabMap = {
    "totalUsers": "users",
    "pendingRequests": "inbox",
    "totalElections": "elections",
    "activeElections": "elections",
    "totalVotes": "stats",
  };

  const handleKpiCardClick = (key) => {
    const tabId = cardTabMap[key];
    if (tabId) {
      setActiveTab(tabId);
    }
  };

  const handleSyncBlockchain = async () => {
    setSyncing(true);
    try {
      await api.post(
        `/api/admin/sync-blockchain`,
        {}
      );
      toast.success('Sincronización con blockchain iniciada — revisa los logs del backend');
      setTimeout(() => {
        api.get(`/admin/blockchain-status`)
          .then(r => setBlockchainStatus(r.data))
          .catch(() => {});
      }, 15000);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se ha podido sincronizar con blockchain');
    } finally {
      setSyncing(false);
    }
  };

  const loadTabData = async () => {
    setLoading(true);
    setError("");
    try {
      switch (activeTab) {
        case "dashboard": {
          const dashRes = await api.get(`/admin/dashboard`);
          setStats(dashRes.data.stats);
          setDashboardData({
            recentVotes: dashRes.data.recentVotes || [],
            electionParticipation: dashRes.data.electionParticipation || [],
            requestsTrend: dashRes.data.requestsTrend || [],
          });
          // Blockchain status (best-effort, don't block dashboard)
          api.get(`/admin/blockchain-status`)
            .then(r => setBlockchainStatus(r.data))
            .catch(() => setBlockchainStatus({ connected: false, reason: 'Fallo en la solicitud' }));
          break;
        }
        case "users": {
          const usersRes = await api.get(`/admin/users`);
          setUsers(usersRes.data.users);
          setUsersPage(1);
          break;
        }
        case "elections": {
          const electRes = await api.get(`/admin/elections`);
          setElections(electRes.data.elections);
          try {
            const domainsRes = await api.get(`/admin/domains`);
            setAvailableDomains(domainsRes.data.domains || []);
          } catch {
            // ignore
          }
          try {
            const orgRes = await api.get(`/admin/org-units`);
            setOrgUnits(orgRes.data.units || []);
          } catch {
            // ignore
          }
          try {
            const schRes = await api.get(`/api/schools-degrees`);
            setSchoolsData(schRes.data.schools_degrees || []);
          } catch {
            // ignore
          }
          break;
        }
        case "audit": {
          const auditRes = await api.get(`/admin/audit`);
          setAudit(auditRes.data.audit);
          if (elections.length === 0) {
            const electRes = await api.get(`/admin/elections`);
            setElections(electRes.data.elections);
          }
          break;
        }
        case "stats": {
          const statsRes = await api.get(`/admin/stats/voters`);
          setStats2(statsRes.data.stats);
          break;
        }
        case "inbox": {
          const regRes = await api.get(`/admin/registration-requests?status=all`);
          setRegistrationRequests(regRes.data.requests);
          break;
        }
      }
    } catch (err) {
      if (err.response?.status === 401) {
        clearAuthAndRedirect(navigate);
        return;
      }
      setError(err.response?.data?.error || "No se han podido cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/admin/users`, newUser);
      toast.success("Usuario creado correctamente");
      setNewUser({ email: "", password: "", name: "", student_id: "", role: "student", admin_domain: "" });
      loadTabData();
    } catch (err) {
      toast.error(err.response?.data?.error || "No se ha podido crear el usuario");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await api.delete(`/admin/users/${userId}`);
      toast.success("Usuario eliminado");
      setConfirmDeleteId(null);
      loadTabData();
    } catch (err) {
      toast.error(err.response?.data?.error || "No se ha podido eliminar el usuario");
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
        target_schools: newElection.target_schools || [],
      };

      const res = await api.post(`/admin/elections`, electionPayload);
      const newElectionId = res.data.electionId;

      // Add candidates
      const validCandidates = newElection.candidates.filter(c => c.name.trim() !== "");
      for (const candidate of validCandidates) {
        try {
          await api.post(`/admin/elections/${newElectionId}/candidates`, candidate);
        } catch (e) {
          console.error("Error adding candidate:", e);
        }
      }

      // Upload image if selected
      if (newElection.image) {
        try {
          const formData = new FormData();
          formData.append('file', newElection.image);
          await api.post(`/admin/elections/${newElectionId}/image`, formData);
        } catch (e) {
          console.error("Error uploading election image:", e);
        }
      }

      toast.success("Elección creada correctamente");
      setNewElection({
        name: "",
        description: "",
        start_time: "",
        end_time: "",
        target_type: 'all',
        target_values: [],
        target_schools: [],
        domains: adminDomain || '',
        selectedDomains: adminDomain ? [adminDomain] : [],
        candidates: [{ name: "", description: "" }],
        image: null,
        banner_color: '#1E3A5F',
        voter_role: 'student',
      });
      loadTabData();
    } catch (err) {
      toast.error(err.response?.data?.error || "No se ha podido crear la elección");
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
      await api.put(
        `/admin/elections/${electionId}`,
        { is_active: !is_active }
      );
      toast.success("Elección actualizada");
      loadTabData();
    } catch (err) {
      toast.error(err.response?.data?.error || "No se ha podido actualizar la elección");
    }
  };

  const handleEditElection = (election) => {
    const toLocalDatetimeString = (unix) => {
      if (!unix) return '';
      const d = new Date(unix * 1000);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setEditingElection({
      id: election.id,
      name: election.name || '',
      description: election.description || '',
      end_time: toLocalDatetimeString(election.end_time || election.endTime),
    });
  };

  const handleSaveEditElection = async () => {
    try {
      const payload = {
        name: editingElection.name || undefined,
        description: editingElection.description || undefined,
        end_time: editingElection.end_time
          ? Math.floor(new Date(editingElection.end_time).getTime() / 1000)
          : undefined,
      };
      await api.patch(`/admin/elections/${editingElection.id}`, payload);
      toast.success('Elección actualizada');
      setEditingElection(null);
      loadTabData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se ha podido actualizar la elección');
    }
  };

  const handleAddVoter = async (electionId) => {
    try {
      if (!manageCensus.email.trim()) return;
      await api.post(`/admin/elections/${electionId}/voters`, { email: manageCensus.email.trim() });
      toast.success("Votante añadido al censo");
      setManageCensus({ ...manageCensus, email: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || "No se ha podido añadir el votante");
    }
  };

  const handleAddDomain = async (electionId) => {
    try {
      if (!manageCensus.domain.trim()) return;
      await api.post(`/admin/elections/${electionId}/domains`, { domain: manageCensus.domain.trim() });
      toast.success("Dominio añadido al censo");
      setManageCensus({ ...manageCensus, domain: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || "No se ha podido añadir el dominio");
    }
  };

  const downloadCSVTemplate = (columns, filename) => {
    const header = columns.join(',');
    const example = columns.map(c => {
      if (c === 'email') return 'estudiante@ejemplo.edu';
      if (c === 'full_name') return 'Juan Pérez';
      if (c === 'student_id') return 'EST-001';
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
      const res = await api.post(
        `/admin/elections/${electionId}/import-voters`,
        formData
      );
      const r = res.data.results;
      toast.success(`CSV importado: ${r.created} usuarios creados, ${r.added} añadidos, ${r.skipped} omitidos`);
      if (r.errors?.length) console.warn('Import errors:', r.errors);
      loadTabData();
    } catch (err) {
      toast.error(err.response?.data?.error || "No se ha podido importar el CSV");
    }
    e.target.value = '';
  };

  const handleCSVUsersImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post(
        `/admin/users/import`,
        formData
      );
      const r = res.data.results;
      toast.success(`Usuarios importados: ${r.created} creados, ${r.skipped} omitidos`);
      if (r.errors?.length) console.warn('Import errors:', r.errors);
      loadTabData();
    } catch (err) {
      toast.error(err.response?.data?.error || "No se ha podido importar el CSV de usuarios");
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
      const response = await api.patch(
        `/admin/registration-requests/${requestId}`,
        { action: 'approve' }
      );
      if (response.data.tempPassword) {
        setTempPasswordInfo({
          email: email,
          password: response.data.tempPassword
        });
      } else {
        toast.success(`Usuario aprobado. Puede iniciar sesión con la contraseña que eligió al registrarse.`);
      }
      loadTabData();
    } catch (err) {
      toast.error(err.response?.data?.error || "No se ha podido aprobar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectRequest = async (requestId, reason) => {
    if (!reason?.trim()) return;

    setLoading(true);
    try {
      await api.patch(
        `/admin/registration-requests/${requestId}`,
        { action: 'reject', reason }
      );
      toast.success("Solicitud rechazada");
      setRejectReasonId(null);
      setRejectReason('');
      loadTabData();
    } catch (err) {
      toast.error(err.response?.data?.error || "No se ha podido rechazar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  const loadElectionStats = async (electionId) => {
    setLoadingElectionStats(true);
    try {
      const res = await api.get(`/admin/elections/${electionId}/stats`);
      setSelectedElectionStats(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || "No se han podido cargar las estadísticas de la elección");
    } finally {
      setLoadingElectionStats(false);
    }
  };

  const Tab = ({ id, label, icon, badge }) => (
    <button
      data-tour={id === "inbox" ? "requests-tab" : id === "stats" ? "stats-tab" : undefined}
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
      <OnboardingTour role={userRole} userId={user?.id} />
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Panel de administración
            {!isSuperAdmin && adminDomain && (
              <span className="ml-3 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                Dominio: @{adminDomain}
              </span>
            )}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            {isSuperAdmin
              ? 'Super administrador — acceso completo a todos los dominios'
              : 'Gestiona usuarios, elecciones y la auditoría del sistema'
            }
          </p>
        </motion.div>

        {/* Alerts */}
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
                  Contraseña temporal generada
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                  Usuario: {tempPasswordInfo.email}
                </p>
                <div className="flex items-center gap-2">
                  <code className="bg-yellow-100 dark:bg-yellow-900 px-3 py-2 rounded font-mono text-lg font-bold text-yellow-900 dark:text-yellow-100">
                    {tempPasswordInfo.password}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(tempPasswordInfo.password); }}
                    className="px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded text-sm font-medium transition"
                  >
                    Copiar
                  </button>
                </div>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                  Comparte esta contraseña con el usuario. Solo se muestra una vez.
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
          <Tab id="dashboard" label={t("admin.dashboard")} icon="📊" />
          <Tab id="inbox" label={t("admin.requests")} icon="📬" badge={pendingBadge > 0 ? pendingBadge : null} />
          <Tab id="users" label={t("admin.users")} icon="👥" />
          <Tab id="elections" label={t("admin.elections")} icon="🗳️" />
          <Tab id="stats" label={t("admin.statistics")} icon="📈" />
          <Tab id="audit" label={t("admin.audit")} icon="🔐" />
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
              <LoadingSpinner message={`Cargando…`} />
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
                  {import.meta.env.VITE_API_URL?.includes('onrender.com') && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-300">
                      ⚠️ Nivel gratuito de Render — la base de datos se reinicia en cada despliegue.
                      Añade un disco persistente (5 $/mes) para conservar los datos entre despliegues.
                    </div>
                  )}

                  {/* Scope badge */}
                  <div className="flex flex-wrap gap-2">
                    {isSuperAdmin ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
                        🌐 Super admin — todas las instituciones
                      </span>
                    ) : adminDomain && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                        🏛️ Gestionando: @{adminDomain}
                      </span>
                    )}
                    {!isSuperAdmin && stats.pendingRequests > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-sm font-medium">
                        📬 {stats.pendingRequests} solicitudes pendientes
                      </span>
                    )}
                  </div>

                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                      { key: "totalUsers", icon: "👥", value: stats.totalUsers, badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", subKey: "registeredAccounts" },
                      { key: "pendingRequests", icon: "📬", value: stats.pendingRequests, badgeClass: stats.pendingRequests > 0 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", subKey: "awaitingApproval" },
                      { key: "totalElections", icon: "🗳️", value: stats.totalElections, badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300", subKey: "allElections" },
                      { key: "activeElections", icon: "⚡", value: stats.activeElections, badgeClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", subKey: "currentlyRunning" },
                      { key: "totalVotes", icon: "🔐", value: stats.totalVotes, badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300", subKey: "nullifiersIssued" },
                    ].map(({ key, icon, value, badgeClass, subKey }) => (
                      <motion.div
                        key={key}
                        whileHover={{ scale: 1.02 }}
                        onClick={() => handleKpiCardClick(key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            handleKpiCardClick(key);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 transition-all duration-150 hover:-translate-y-0.5"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-2xl">{icon}</span>
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${badgeClass}`}>
                            {t(`admin.${key}`)}
                          </span>
                        </div>
                        <p className="text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t(`admin.${subKey}`)}</p>
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
                          {blockchainStatus.connected ? 'Blockchain conectada' : 'Blockchain no disponible'}
                        </p>
                        {blockchainStatus.connected ? (
                          <p className="text-emerald-700 dark:text-emerald-300 text-xs mt-0.5">
                            Contrato: <span className="font-mono">{blockchainStatus.contractAddress?.slice(0, 10)}…</span>
                            {' · '}Bloque #{blockchainStatus.blockNumber}
                            {' · '}Chain {blockchainStatus.chainId}
                            {' · '}{blockchainStatus.electionCount} elecciones on-chain
                          </p>
                        ) : (
                          <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5">
                            {blockchainStatus.reason || 'No se alcanza el nodo — arranca Hardhat o configura RPC_URL'}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={handleSyncBlockchain}
                        disabled={syncing}
                        className="shrink-0 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition font-medium"
                      >
                        {syncing ? 'Sincronizando…' : 'Sincronizar elecciones'}
                      </button>
                      {blockchainStatus.connected && blockchainStatus.explorerUrl && (
                        <a
                          href={`${blockchainStatus.explorerUrl}/address/${blockchainStatus.contractAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-xs px-2 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition"
                        >
                          Ver contrato ↗
                        </a>
                      )}
                    </div>
                  )}

                  {/* Middle row */}
                  <div className="grid lg:grid-cols-5 gap-6">
                    {/* Election Participation Table */}
                    <div className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-4 text-sm">Elecciones activas — participación en directo</h3>
                      {dashboardData.electionParticipation.length === 0 ? (
                        <p className="text-sm text-slate-400 dark:text-slate-500 py-6 text-center">No hay elecciones activas</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="text-left py-2 text-slate-500 dark:text-slate-400 font-medium">Elección</th>
                                <th className="text-right py-2 text-slate-500 dark:text-slate-400 font-medium">Votantes</th>
                                <th className="text-right py-2 text-slate-500 dark:text-slate-400 font-medium">Emitidos</th>
                                <th className="text-right py-2 text-slate-500 dark:text-slate-400 font-medium">Tasa</th>
                                <th className="py-2 text-slate-500 dark:text-slate-400 font-medium pl-3">Progreso</th>
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
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-4 text-sm">Votos recientes</h3>
                      {dashboardData.recentVotes.length === 0 ? (
                        <p className="text-sm text-slate-400 dark:text-slate-500 py-6 text-center">Todavía no se ha registrado ningún voto</p>
                      ) : (
                        <div className="space-y-3">
                          {dashboardData.recentVotes.map((vote, i) => {
                            const email = vote.email || '';
                            const parts = email.split('@');
                            const anon = parts[0] ? parts[0].slice(0, 2) + '***' : '***';
                            const domain = parts[1] ? '@' + parts[1] : '';
                            const diff = Math.floor((Date.now() - new Date(vote.generated_at).getTime()) / 1000);
                            const timeAgo = diff < 60 ? `hace ${diff}s` : diff < 3600 ? `hace ${Math.floor(diff / 60)}m` : `hace ${Math.floor(diff / 3600)}h`;
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

                  {/* Charts row */}
                  <div className="grid lg:grid-cols-2 gap-6">
                    {/* Requests Trend Chart */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-4 text-sm">Solicitudes de registro — últimos 7 días</h3>
                      {dashboardData.requestsTrend.length === 0 ? (
                        <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">No hay solicitudes de registro en los últimos 7 días</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={160}>
                          <AreaChart data={dashboardData.requestsTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f1f5f9' }} />
                            <Area type="monotone" dataKey="count" stroke="#3B82F6" fill="#1d4ed840" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* Election Participation BarChart */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-4 text-sm">Tasa de participación por elección</h3>
                      {dashboardData.electionParticipation.length === 0 ? (
                        <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">No hay elecciones activas</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart
                            data={dashboardData.electionParticipation.map(ep => ({
                              name: ep.name.length > 16 ? ep.name.slice(0, 14) + '…' : ep.name,
                              rate: ep.rate ?? 0,
                              votes: ep.votes_cast,
                            }))}
                            margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="%" domain={[0, 100]} />
                            <Tooltip
                              contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f1f5f9' }}
                              formatter={(v, n) => n === 'rate' ? [`${v}%`, 'Tasa'] : [v, 'Votos']}
                            />
                            <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                              {dashboardData.electionParticipation.map((_, idx) => (
                                <Cell key={idx} fill={['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444'][idx % 5]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Users */}
              {activeTab === "users" && (
                <div className="space-y-8">
                  {!isSuperAdmin && adminDomain && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-blue-700 dark:text-blue-300 text-sm">
                      Gestionando usuarios de @{adminDomain}
                    </div>
                  )}
                  {/* Form */}
                  <motion.div
                    data-tour="create-election"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700"
                  >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">{t("admin.createNewUser")}</h2>
                    <form onSubmit={handleCreateUser} className="grid md:grid-cols-2 gap-4">
                      <input
                        type="email"
                        placeholder={t("admin.emailPlaceholder")}
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        disabled={loading}
                        required
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                      />
                      <input
                        type="text"
                        placeholder={t("admin.namePlaceholder")}
                        value={newUser.name}
                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                        disabled={loading}
                        required
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                      />
                      <input
                        type="text"
                        placeholder={t("admin.studentIdPlaceholder")}
                        value={newUser.student_id}
                        onChange={(e) => setNewUser({ ...newUser, student_id: e.target.value })}
                        disabled={loading}
                        required
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                      />
                      <input
                        type="password"
                        placeholder={t("admin.passwordPlaceholder")}
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
                        <option value="student">{t("admin.voter")}</option>
                        <option value="admin">{t("admin.domainAdmin")}</option>
                      </select>
                      {newUser.role === 'admin' && (
                        <input
                          type="text"
                          placeholder={t("admin.adminDomainPlaceholder")}
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
                        {loading ? t("admin.creatingUser") : t("admin.createNewUser")}
                      </motion.button>
                    </form>
                  </motion.div>

                  {/* Import Users from CSV */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700"
                  >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Importar usuarios desde CSV</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                      Sube un CSV con las columnas: <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">email, full_name, student_id, role</code>
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => downloadCSVTemplate(['email','full_name','student_id','role'], 'vtb_users_template.csv')}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                      >
                        Descargar plantilla
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
                        Importar CSV de usuarios
                      </label>
                    </div>
                  </motion.div>

                  {/* Users List */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 overflow-x-auto"
                  >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Usuarios registrados ({users.length})</h2>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-300 dark:border-slate-600">
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Email</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Nombre</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Facultad / Titulación</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Rol</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Estado</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.slice((usersPage - 1) * USERS_PER_PAGE, usersPage * USERS_PER_PAGE).map((user) => (
                          <tr key={user.id} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">
                            <td className="py-3 px-4 text-slate-900 dark:text-white">{user.email}</td>
                            <td className="py-3 px-4 text-slate-800 dark:text-slate-200">{user.name}</td>
                            <td className="py-3 px-4 max-w-[200px]">
                              {user.school && (
                                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full block truncate">
                                  {user.school.replace('Facultad de ', 'Fac. ').replace('Escuela ', 'Esc. ')}
                                </span>
                              )}
                              {user.degree && (
                                <span className="text-xs text-slate-500 dark:text-slate-400 block truncate mt-0.5">
                                  {user.degree}{user.year ? ` (Y${user.year})` : ''}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${user.role === "admin" || user.role === "superadmin"
                                  ? "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200"
                                  : "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200"
                                }`}>
                                {user.role === "admin" ? "Admin" : user.role === "superadmin" ? "Super admin" : "Votante"}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${user.is_approved
                                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
                                  : "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200"
                                }`}>
                                {user.is_approved ? "Aprobado" : "Pendiente"}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {confirmDeleteId === user.id ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-red-600 dark:text-red-400 font-medium">¿Eliminar?</span>
                                  <button
                                    onClick={() => handleDeleteUser(user.id)}
                                    className="px-2 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition"
                                  >
                                    Sí
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-2 py-1 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 rounded text-xs font-medium transition"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(user.id)}
                                  className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 rounded font-medium transition text-xs"
                                >
                                  Eliminar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {users.length === 0 && (
                      <p className="text-center text-slate-500 dark:text-slate-400 py-8">No se han encontrado usuarios</p>
                    )}
                    {users.length > USERS_PER_PAGE && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Página {usersPage} de {Math.ceil(users.length / USERS_PER_PAGE)} — {users.length} usuarios
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                            disabled={usersPage === 1}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm"
                          >
                            ← Anterior
                          </button>
                          <button
                            onClick={() => setUsersPage(p => Math.min(Math.ceil(users.length / USERS_PER_PAGE), p + 1))}
                            disabled={usersPage === Math.ceil(users.length / USERS_PER_PAGE)}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm"
                          >
                            Siguiente →
                          </button>
                        </div>
                      </div>
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
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Crear nueva elección</h2>
                    <form onSubmit={handleCreateElection} className="space-y-5">

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre de la elección</label>
                        <input
                          type="text"
                          placeholder="p. ej. Consejo Estudiantil 2026"
                          value={newElection.name}
                          onChange={(e) => setNewElection({ ...newElection, name: e.target.value })}
                          disabled={loading}
                          required
                          className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descripción</label>
                        <textarea
                          placeholder="Breve descripción de la elección…"
                          value={newElection.description}
                          onChange={(e) => setNewElection({ ...newElection, description: e.target.value })}
                          disabled={loading}
                          className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                          rows={3}
                        />
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha y hora de inicio</label>
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
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha y hora de fin</label>
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
                          ¿Quién puede votar?
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { value: 'student', label: 'Estudiantes', desc: 'Estudiantes matriculados y votantes' },
                            { value: 'admin', label: 'Solo admins', desc: 'Administradores y personal' },
                            { value: 'both', label: 'Todos', desc: 'Estudiantes y administradores' },
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
                            Esta elección será visible para los administradores cuyo dominio dependa del tuyo. Sus votos se registran en blockchain mediante nullifiers, sin exponer la identidad del votante en el registro público.
                          </p>
                        )}
                      </div>

                      {/* Target Audience */}
                      <div className="border border-slate-300 dark:border-slate-600 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                        <h3 className="font-bold text-slate-900 dark:text-white mb-3">Audiencia objetivo</h3>

                        {/* Target type buttons */}
                        <div className="flex gap-2 mb-3 flex-wrap">
                          {[
                            { value: 'all', label: '🌐 Todos en mi dominio' },
                            { value: 'school', label: '🏫 Por facultad / escuela' },
                            { value: 'org_unit', label: '🏛️ Unidad organizativa concreta' },
                            { value: 'domain', label: '📧 Dominio de email' },
                          ].map(({ value, label }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setNewElection(p => ({ ...p, target_type: value, target_values: [], target_schools: [] }))}
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
                            Todos los usuarios de tu dominio podrán votar.
                          </p>
                        )}

                        {newElection.target_type === 'school' && (
                          <div>
                            <p className="text-xs text-slate-500 mb-2">
                              Selecciona una o varias facultades/escuelas:
                            </p>
                            {schoolsData.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">No se han encontrado facultades.</p>
                            ) : (
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {Object.keys(
                                  schoolsData.reduce((acc, item) => {
                                    acc[item.school_name] = true;
                                    return acc;
                                  }, {})
                                ).sort().map(school => (
                                  <label key={school} className="flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-600/30 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={(newElection.target_schools || []).includes(school)}
                                      onChange={(e) => {
                                        const schools = newElection.target_schools || [];
                                        setNewElection(p => ({
                                          ...p,
                                          target_schools: e.target.checked
                                            ? [...schools, school]
                                            : schools.filter(s => s !== school)
                                        }));
                                      }}
                                      className="rounded"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-300">{school}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                            {(newElection.target_schools || []).length > 0 && (
                              <p className="text-xs text-blue-600 mt-2">
                                {newElection.target_schools.length} facultad(es) seleccionada(s)
                              </p>
                            )}
                          </div>
                        )}

                        {newElection.target_type === 'org_unit' && (
                          <div>
                            <p className="text-xs text-slate-500 mb-2">
                              Selecciona una o varias unidades organizativas (facultad, titulación, curso):
                            </p>
                            {orgUnits.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">No se han encontrado unidades organizativas. Añade alguna primero.</p>
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
                                {newElection.target_values.length} unidad(es) seleccionada(s)
                              </p>
                            )}
                          </div>
                        )}

                        {newElection.target_type === 'domain' && (
                          <input
                            type="text"
                            placeholder="Dominios de email, p. ej. ufv.es, highlands.edu"
                            value={newElection.domains || ''}
                            onChange={(e) => setNewElection(p => ({ ...p, domains: e.target.value }))}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                          />
                        )}
                      </div>

                      {/* Banner Color */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Color del banner</label>
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
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Imagen del banner (opcional)</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setNewElection({ ...newElection, image: e.target.files[0] || null })}
                          className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50"
                        />
                        {newElection.image && (
                          <img
                            src={URL.createObjectURL(newElection.image)}
                            alt="Vista previa"
                            className="h-20 rounded mt-2 object-cover"
                          />
                        )}
                      </div>

                      {/* Candidates */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Candidatos</label>
                        <div className="border border-slate-300 dark:border-slate-600 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                          <div className="flex justify-end mb-3">
                            <button type="button" onClick={handleAddCandidateField} className="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition">
                              + Añadir candidato
                            </button>
                          </div>
                          {newElection.candidates.map((candidate, idx) => (
                            <div key={idx} className="flex gap-2 mb-2">
                              <input
                                type="text"
                                placeholder="Nombre del candidato"
                                value={candidate.name}
                                onChange={(e) => handleCandidateChange(idx, 'name', e.target.value)}
                                className="flex-1 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm"
                                required
                              />
                              <input
                                type="text"
                                placeholder="Breve descripción"
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
                        {loading ? "Creando…" : "Crear elección"}
                      </motion.button>
                    </form>
                  </motion.div>

                  {/* Elections List */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Elecciones registradas</h2>
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
                              {{ active: 'ACTIVA', upcoming: 'PRÓXIMA', closed: 'CERRADA' }[status] || status.toUpperCase()}
                            </span>
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              Inicio: {start ? new Date(start * 1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'N/D'}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-500">—</span>
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              Fin: {end ? new Date(end * 1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'N/D'}
                            </span>
                          </div>

                          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 flex flex-col">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="font-bold text-slate-900 dark:text-white text-lg">{election.name}</h3>
                                <div className="flex flex-wrap gap-2 mt-2 mb-3 text-xs">
                                  <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-medium">
                                    {election.candidates?.length || "N/D"} candidatos
                                  </span>
                                  {election.voter_role === 'admin' && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                                      ⚙️ Solo admins
                                    </span>
                                  )}
                                  {election.voter_role === 'both' && (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">
                                      👥 Todos
                                    </span>
                                  )}
                                  {election.targets && election.targets.length > 0
                                    ? election.targets.map((t, i) => (
                                        <span key={i} className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                                          {t.target_value === '*' ? 'Todos' : `@${t.target_value}`}
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
                                  {election.is_active !== false ? "Visible" : "Oculta"}
                                </button>
                                <button
                                  onClick={() => handleEditElection(election)}
                                  className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg transition font-medium text-sm w-36"
                                >
                                  ✏️ Editar
                                </button>
                                <button
                                  onClick={() => setExpandedElection(expandedElection === election.id ? null : election.id)}
                                  className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg transition font-medium text-sm w-36"
                                >
                                  Gestionar censo
                                </button>
                                <button
                                  onClick={() => setQrElection(election)}
                                  className="px-4 py-2 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 rounded-lg transition font-medium text-sm w-36"
                                >
                                  📱 Código QR
                                </button>
                              </div>
                            </div>

                            {/* Gestionar Censo Section */}
                            {expandedElection === election.id && (
                              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                <h4 className="font-bold text-slate-900 dark:text-white mb-3 text-sm">Gestionar censo</h4>
                                <div className="grid md:grid-cols-2 gap-4 mb-3">
                                  <div className="flex gap-2">
                                    <input
                                      type="email"
                                      placeholder="votante@email.com"
                                      className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded"
                                      value={manageCensus.email}
                                      onChange={e => setManageCensus({ ...manageCensus, email: e.target.value })}
                                    />
                                    <button onClick={() => handleAddVoter(election.id)} className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">Añadir votante</button>
                                  </div>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      placeholder="nuevo-dominio.edu"
                                      className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded"
                                      value={manageCensus.domain}
                                      onChange={e => setManageCensus({ ...manageCensus, domain: e.target.value })}
                                    />
                                    <button onClick={() => handleAddDomain(election.id)} className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">Añadir dominio</button>
                                  </div>
                                </div>
                                {/* CSV Import */}
                                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-600">
                                  <button
                                    type="button"
                                    onClick={() => downloadCSVTemplate(['email','full_name','student_id','send_email'], 'vtb_voters_template.csv')}
                                    className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                                  >
                                    Descargar plantilla CSV
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
                                    Importar CSV
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
                        <p className="text-slate-500 dark:text-slate-400">No se han encontrado elecciones</p>
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
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Votantes por elección</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Haz clic en una elección para ver sus estadísticas detalladas</p>
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
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stat.total_voters}</span> votos emitidos
                            </p>
                            {stat.total_voters_assigned != null && (
                              <p className="text-sm text-slate-600 dark:text-slate-400">
                                de <span className="font-semibold">{stat.total_voters_assigned}</span> asignados
                              </p>
                            )}
                            {stat.participation_rate != null && (
                              <p className="text-sm text-slate-600 dark:text-slate-400">
                                <span className="font-semibold text-blue-600 dark:text-blue-400">{stat.participation_rate}%</span> de participación
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stat.participation_rate ?? 0}%</span>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">participación</p>
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
                      <p className="text-slate-500 dark:text-slate-400">No hay estadísticas disponibles</p>
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
                        placeholder="Buscar por email o elección…"
                        value={auditFilter.search}
                        onChange={(e) => setAuditFilter(p => ({ ...p, search: e.target.value }))}
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                      />
                      <select
                        value={auditFilter.electionId}
                        onChange={(e) => setAuditFilter(p => ({ ...p, electionId: e.target.value }))}
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                      >
                        <option value="">Todas las elecciones</option>
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
                        <span className="text-xs text-slate-500">Filtros activos:</span>
                        <button
                          onClick={() => setAuditFilter({ search: '', electionId: '', dateFrom: '', dateTo: '', institution: '' })}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Borrar todos ✕
                        </button>
                        <span className="text-xs text-slate-400 ml-auto">{filteredAudit.length} resultados</span>
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Registro de auditoría de votos</h2>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-300 dark:border-slate-600">
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Email del votante</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Elección</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Hash del voto</th>
                          <th className="text-left py-2 px-4 text-slate-700 dark:text-slate-300">Fecha y hora</th>
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
                                {new Date(entry.generated_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredAudit.length === 0 && (
                      <p className="text-center text-slate-500 dark:text-slate-400 py-8">
                        {audit.length === 0 ? 'No hay registros de auditoría' : 'Ningún registro coincide con los filtros actuales'}
                      </p>
                    )}
                  </div>

                  {/* Privacy Notice */}
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 rounded-lg">
                    <p className="text-sm text-emerald-800 dark:text-emerald-200">
                      <strong>Registro inmutable en blockchain:</strong> Este registro de auditoría confirma la participación. El nullifier y el hash de voto almacenados on-chain no identifican al votante en la cadena. El recuento es irrevocable y auditable públicamente.
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
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      Solicitudes de registro
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {['pending','approved','rejected','all'].map(s => (
                        <button
                          key={s}
                          onClick={() => setInboxStatusFilter(s)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${inboxStatusFilter === s ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                        >
                          {{ pending: 'Pendientes', approved: 'Aprobadas', rejected: 'Rechazadas', all: 'Todas' }[s]} {s !== 'all' && `(${registrationRequests.filter(r => r.status === s).length})`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Domain filter for superadmin */}
                  {isSuperAdmin && (
                    <input
                      type="text"
                      placeholder="Filtrar por dominio (p. ej. ufv.es, highlands.edu)…"
                      value={inboxDomainFilter}
                      onChange={e => setInboxDomainFilter(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm"
                    />
                  )}

                  {registrationRequests
                    .filter(r => inboxStatusFilter === 'all' ? true : r.status === inboxStatusFilter)
                    .filter(r => !inboxDomainFilter || r.email?.toLowerCase().includes(inboxDomainFilter.toLowerCase()))
                    .length === 0 ? (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-6 rounded-lg text-center">
                      <p className="text-blue-800 dark:text-blue-200">
                        No hay solicitudes{inboxStatusFilter !== 'all' ? ` ${{ pending: 'pendientes', approved: 'aprobadas', rejected: 'rechazadas' }[inboxStatusFilter]}` : ''}{inboxDomainFilter ? ` para "${inboxDomainFilter}"` : ''}
                      </p>
                    </div>
                  ) : (
                    registrationRequests
                      .filter(r => inboxStatusFilter === 'all' ? true : r.status === inboxStatusFilter)
                      .filter(r => !inboxDomainFilter || r.email?.toLowerCase().includes(inboxDomainFilter.toLowerCase()))
                      .map((request) => (
                        <div
                          key={request.id}
                          className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 space-y-4"
                        >
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div className="min-w-0">
                              <p className="font-mono text-slate-900 dark:text-white truncate">{request.email}</p>
                              <p className="text-sm text-slate-500 dark:text-slate-400">{request.full_name}</p>
                            </div>
                            <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                              request.status === 'pending' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200' :
                              request.status === 'approved' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200' :
                              'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200'
                            }`}>{{ pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' }[request.status] || request.status}</span>
                          </div>
                          <div className="grid sm:grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-slate-500 dark:text-slate-400 text-xs">Identificador</p>
                              <p className="font-mono text-slate-900 dark:text-white">{request.student_id}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 dark:text-slate-400 text-xs">Enviada</p>
                              <p className="text-slate-900 dark:text-white">{new Date(request.created_at).toLocaleDateString('es-ES')}</p>
                            </div>
                            {request.school && (
                              <div>
                                <p className="text-slate-500 dark:text-slate-400 text-xs">Datos académicos</p>
                                <p className="text-slate-900 dark:text-white truncate">{request.school}{request.year ? ` · ${request.year}º` : ''}</p>
                              </div>
                            )}
                          </div>

                          {request.status === 'pending' && (
                            <div className="flex gap-3 pt-2">
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleApproveRequest(request.id, request.email)}
                                disabled={loading}
                                className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition disabled:opacity-50 text-sm"
                              >
                                ✓ Aprobar
                              </motion.button>
                              {rejectReasonId === request.id ? (
                                <div className="flex-1 space-y-2">
                                  <textarea
                                    rows={2}
                                    placeholder="Motivo del rechazo…"
                                    value={rejectReason}
                                    onChange={e => setRejectReason(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded resize-none focus:ring-2 focus:ring-red-500 outline-none"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleRejectRequest(request.id, rejectReason)}
                                      disabled={!rejectReason.trim() || loading}
                                      className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition disabled:opacity-50"
                                    >
                                      Confirmar rechazo
                                    </button>
                                    <button
                                      onClick={() => { setRejectReasonId(null); setRejectReason(''); }}
                                      className="px-3 py-1.5 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 rounded text-sm transition"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <motion.button
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => { setRejectReasonId(request.id); setRejectReason(''); }}
                                  disabled={loading}
                                  className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition disabled:opacity-50 text-sm"
                                >
                                  ✗ Rechazar
                                </motion.button>
                              )}
                            </div>
                          )}
                          {request.status !== 'pending' && request.reviewed_at && (
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                              Revisada el {new Date(request.reviewed_at).toLocaleString('es-ES')}
                            </p>
                          )}
                        </div>
                      ))
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
                    {selectedElectionStats?.election?.name || 'Cargando…'}
                  </h2>
                  {selectedElectionStats?.election && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      {new Date(selectedElectionStats.election.startDate).toLocaleDateString('es-ES')} — {new Date(selectedElectionStats.election.endDate).toLocaleDateString('es-ES')}
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
                  <LoadingSpinner message="Cargando estadísticas de la elección…" />
                </div>
              ) : selectedElectionStats && (
                <div className="p-6 space-y-6">
                  {/* KPI Row */}
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Censo', value: selectedElectionStats.stats.totalVoters, icon: '👥', tone: KPI_TONES.blue },
                      { label: 'Votos emitidos', value: selectedElectionStats.stats.totalVotes, icon: '🗳️', tone: KPI_TONES.emerald },
                      { label: 'Participación', value: `${selectedElectionStats.stats.participationRate}%`, icon: '📊', tone: KPI_TONES.purple },
                    ].map(({ label, value, icon, tone }) => (
                      <div key={label} className={`${tone.box} rounded-xl p-4 text-center`}>
                        <p className="text-2xl mb-1">{icon}</p>
                        <p className={`text-2xl font-bold ${tone.value}`}>{value}</p>
                        <p className={`text-xs ${tone.label} mt-0.5`}>{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Candidate Chart */}
                  {selectedElectionStats.candidates?.length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-3 text-sm">Votos por candidato</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={selectedElectionStats.candidates} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip formatter={(v) => [v, 'Votos']} />
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
                            <th className="text-left py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">Candidato</th>
                            <th className="text-right py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">Votos</th>
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
                        Participación de votantes ({selectedElectionStats.voters.filter(v => v.has_voted).length} / {selectedElectionStats.voters.length} han votado)
                      </h3>
                      <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-xs">
                          <tbody>
                            {selectedElectionStats.voters.map((v, i) => (
                              <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                                <td className="py-2 px-4 font-mono text-slate-700 dark:text-slate-300">{v.email}</td>
                                <td className="py-2 px-4 text-right">
                                  {v.has_voted ? (
                                    <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full font-medium">Ha votado</span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full">Pendiente</span>
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
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-2 text-sm">Dominios permitidos</h3>
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
                      Ver resultados públicos
                    </button>
                    {selectedElectionStats.election.is_active && (
                      closeElectionConfirm ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-red-600 dark:text-red-400 font-medium">¿Cerrar esta elección?</span>
                          <button
                            onClick={async () => {
                              try {
                                await api.put(`/admin/elections/${selectedElectionStats.election.id}`, { is_active: false });
                                toast.success('Elección cerrada');
                                setCloseElectionConfirm(false);
                                setSelectedElectionStats(null);
                                loadTabData();
                              } catch (err) {
                                toast.error(err.response?.data?.error || 'No se ha podido cerrar la elección');
                              }
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
                          >
                            Sí, cerrar
                          </button>
                          <button
                            onClick={() => setCloseElectionConfirm(false)}
                            className="px-3 py-1.5 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm transition"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setCloseElectionConfirm(true)}
                          className="px-4 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium transition"
                        >
                          Cerrar elección
                        </button>
                      )
                    )}
                    <button
                      onClick={() => setSelectedElectionStats(null)}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition ml-auto"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR Code Modal */}
      {qrElection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">📱 Código QR</h2>
              <button
                onClick={() => setQrElection(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded"
              >
                ×
              </button>
            </div>
            <div className="p-6 flex flex-col items-center gap-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 text-center font-medium">{qrElection.name}</p>
              <div className="p-4 bg-white rounded-xl border border-slate-200">
                <QRCode
                  value={`${window.location.origin}/voting/${qrElection.id}`}
                  size={180}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center break-all">
                {window.location.origin}/voting/{qrElection.id}
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/voting/${qrElection.id}`);
                  toast.success('Enlace copiado al portapapeles');
                }}
                className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition text-sm"
              >
                Copiar enlace
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Election Modal */}
      {editingElection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">✏️ Editar elección</h2>
              <button
                onClick={() => setEditingElection(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre</label>
                <input
                  type="text"
                  value={editingElection.name}
                  onChange={e => setEditingElection(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descripción</label>
                <textarea
                  rows={3}
                  value={editingElection.description}
                  onChange={e => setEditingElection(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha y hora de fin</label>
                <input
                  type="datetime-local"
                  value={editingElection.end_time}
                  onChange={e => setEditingElection(prev => ({ ...prev, end_time: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditingElection(null)}
                  className="flex-1 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEditElection}
                  className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition"
                >
                  Guardar cambios
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
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

