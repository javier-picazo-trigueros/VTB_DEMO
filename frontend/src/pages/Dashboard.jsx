/**
 * VTB - Dashboard.jsx
 * Panel principal para votantes.
 * Muestra elecciones disponibles y permite votar.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { Navbar } from "../components/Navbar";
import LoadingSpinner from "../components/LoadingSpinner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ---------------------------------------------------------------------------
// Helper: estado real de una elección basado en tiempo actual
// ---------------------------------------------------------------------------
function getRealStatus(election) {
  const now = Date.now() / 1000;
  if (!election.isActive && election.status !== "upcoming") return "closed";
  if (election.startTime && election.startTime > now) return "upcoming";
  if (election.endTime && election.endTime < now) return "closed";
  return "active";
}

// ---------------------------------------------------------------------------
// Helper: badge de estado
// ---------------------------------------------------------------------------
const StatusBadge = ({ election, t }) => {
  const status = getRealStatus(election);
  if (status === "closed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        {t("dashboard.closed")}
      </span>
    );
  }
  if (status === "upcoming") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        {t("dashboard.coming")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      {t("dashboard.active")}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Helper: cuenta regresiva para el cierre de una elección activa
// ---------------------------------------------------------------------------
const Countdown = ({ endTime }) => {
  const [remaining, setRemaining] = useState(endTime - Math.floor(Date.now() / 1000));
  const ref = useRef(null);

  useEffect(() => {
    ref.current = setInterval(() => {
      setRemaining(endTime - Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(ref.current);
  }, [endTime]);

  if (remaining <= 0) return <span className="text-slate-400 text-xs">Cerrando…</span>;

  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;

  const parts = d > 0
    ? `${d}d ${h}h ${m}m`
    : h > 0
    ? `${h}h ${m}m ${s}s`
    : `${m}m ${s}s`;

  return (
    <span className="font-mono text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
      {parts}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Tarjeta de elección
// ---------------------------------------------------------------------------
const ElectionCard = ({ election, eligibility, index, t, navigate }) => {
  const status = getRealStatus(election);
  const isReallyActive = status === "active";
  const alreadyVoted = eligibility?.reason === "already_voted";
  const canVote = isReallyActive && !alreadyVoted;

  const formatDate = (ts) =>
    ts
      ? new Date(ts * 1000).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden"
    >
      {/* Election banner image or color strip */}
      {election.imageUrl ? (
        <div
          className="h-24 w-full overflow-hidden rounded-t-2xl"
          style={{ backgroundColor: election.bannerColor || '#1E3A5F' }}
        >
          <img src={election.imageUrl} className="w-full h-full object-cover opacity-80" alt="" />
        </div>
      ) : (
        <div
          className="h-2 w-full rounded-t-2xl"
          style={{ backgroundColor: election.bannerColor || '#1E3A5F' }}
        />
      )}
      <div className="p-6 flex-1">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                {election.name}
              </h3>
              {alreadyVoted && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  {t("dashboard.voted")}
                </span>
              )}
            </div>
            <StatusBadge election={election} t={t} />
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
          </div>
        </div>

        {election.description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 mb-4">
            {election.description}
          </p>
        )}

        {/* Fechas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">{t("dashboard.starts")}</p>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{formatDate(election.startTime)}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">{t("dashboard.ends")}</p>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{formatDate(election.endTime)}</p>
          </div>
        </div>

        {/* Tiempo restante — solo en elecciones activas */}
        {isReallyActive && election.endTime && (
          <div className="mt-3 flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-3 py-2">
            <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
            </svg>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 mr-1">Cierra en</span>
            <Countdown endTime={election.endTime} />
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="px-6 pb-5 flex gap-2">
        <button
          onClick={() => canVote && navigate(`/voting/${election.id}`)}
          disabled={!canVote}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            alreadyVoted
              ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 cursor-default"
              : canVote
              ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow"
              : "bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
          }`}
        >
          {alreadyVoted
            ? t("dashboard.voted")
            : canVote
            ? t("dashboard.vote")
            : t("dashboard.closed")}
        </button>
        <button
          onClick={() => navigate(`/results/${election.id}`)}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-all"
          title={isReallyActive ? t("dashboard.partialResults") : t("dashboard.results")}
        >
          {isReallyActive ? t("dashboard.partialResults") : t("dashboard.results")}
        </button>
      </div>
    </motion.article>
  );
};

// ---------------------------------------------------------------------------
// Dashboard principal
// ---------------------------------------------------------------------------
export const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [elections, setElections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [eligibilityMap, setEligibilityMap] = useState({});

  useEffect(() => {
    if (!isAuthenticated) { navigate("/login"); return; }
    loadElections();
  }, [isAuthenticated]);

  const loadElections = async () => {
    setIsLoading(true);
    setError("");
    const token = localStorage.getItem("vtb-token");
    if (!token) { navigate("/login"); return; }

    try {
      const res = await fetch(`${API_URL}/api/elections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { navigate("/login"); return; }
      if (!res.ok) throw new Error(t("errors.loadingElections"));

      const data = await res.json();
      const list = Array.isArray(data) ? data : data.elections || [];
      setElections(list);

      // Fetch eligibilidad en paralelo — solo para elecciones realmente activas
      const eligChecks = list
        .filter(e => getRealStatus(e) === "active")
        .map(e =>
          fetch(`${API_URL}/api/elections/${e.id}/eligibility`, {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then(r => r.ok ? r.json() : null)
            .then(d => d && setEligibilityMap(prev => ({ ...prev, [e.id]: d })))
            .catch(() => null)
        );
      await Promise.all(eligChecks);
    } catch (err) {
      setError(err.message || t("errors.loadingElections"));
      setElections([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) return null;

  const userName = user?.name || user?.email || "";

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
              {t("dashboard.welcome")}, <span className="font-medium text-blue-600 dark:text-blue-400">{userName}</span>
            </p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t("dashboard.availableElections")}
            </h1>
          </motion.div>

          {/* Error */}
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {error}
            </motion.div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center py-20">
              <LoadingSpinner message={t("loading")} />
            </div>
          )}

          {/* Estado vacío */}
          {!isLoading && elections.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">
                {t("dashboard.noElectionsTitle")}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-2">
                {t("dashboard.noElectionsDesc")}
              </p>
              <ul className="text-xs text-slate-400 dark:text-slate-500 mb-6 space-y-1">
                <li>• {t("dashboard.noElectionsReason1")}</li>
                <li>• {t("dashboard.noElectionsReason2")}</li>
                <li>• {t("dashboard.noElectionsReason3")}</li>
              </ul>
              <button
                onClick={loadElections}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition"
              >
                {t("dashboard.reload")}
              </button>
            </motion.div>
          )}

          {/* Grid de elecciones */}
          {!isLoading && elections.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {elections.map((election, idx) => (
                <ElectionCard
                  key={election.id}
                  election={election}
                  eligibility={eligibilityMap[election.id]}
                  index={idx}
                  t={t}
                  navigate={navigate}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
};

export default Dashboard;
