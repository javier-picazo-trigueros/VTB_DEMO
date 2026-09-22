import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { Navbar } from "../components/Navbar";
import { OnboardingTour } from "../components/OnboardingTour";
import LoadingSpinner from "../components/LoadingSpinner";
import { clearAuthAndRedirect } from "../utils/auth";
import { apiFetch } from "../utils/apiClient";

function getRealStatus(election) {
  const now = Date.now() / 1000;
  if (!election.isActive && election.status !== "upcoming") return "closed";
  if (election.startTime && election.startTime > now) return "upcoming";
  if (election.endTime && election.endTime < now) return "closed";
  return "active";
}

// Status dot — small colored circle, no emoji
const StatusDot = ({ status }) => {
  const colors = {
    active:   'bg-emerald-600',
    upcoming: 'bg-amber-600',
    closed:   'bg-slate-400',
  };
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[status] ?? 'bg-slate-400'}`} />;
};


const Countdown = ({ endTime }) => {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(endTime - Math.floor(Date.now() / 1000));
  const ref = useRef(null);
  useEffect(() => {
    ref.current = setInterval(() => setRemaining(endTime - Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(ref.current);
  }, [endTime]);
  if (remaining <= 0) return <span className="text-slate-400 text-xs">{t('dashboard.closing')}</span>;
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const parts = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  return <span className="font-mono text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{parts}</span>;
};

// Table-row layout: dot | name+desc | status+countdown | end date | actions
const ElectionRow = ({ election, eligibility, index, navigate }) => {
  const { t } = useTranslation();
  const status = getRealStatus(election);
  const isReallyActive = status === 'active';
  const alreadyVoted = eligibility?.reason === 'already_voted';
  const voteInProgress = eligibility?.reason === 'vote_in_progress';
  const canVote = isReallyActive && !alreadyVoted && !voteInProgress;

  const formatDate = (ts) =>
    ts ? new Date(ts * 1000).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const statusLabel = {
    active:   t('dashboard.active'),
    upcoming: t('dashboard.coming'),
    closed:   t('dashboard.closed'),
  }[status] ?? status;

  return (
    <div
      data-tour={index === 0 ? 'vote-card' : undefined}
      className="flex items-center gap-3 px-4 py-3 hover:bg-warm-50 transition-colors duration-100"
    >
      {/* Status dot */}
      <StatusDot status={status} />

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900 truncate">{election.name}</span>
          {alreadyVoted && (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 flex-shrink-0">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {t('dashboard.voted')}
            </span>
          )}
          {voteInProgress && (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {t('dashboard.inProgress', 'En proceso')}
            </span>
          )}
        </div>
        {election.description && (
          <p className="text-xs text-slate-400 truncate mt-0.5 hidden sm:block">{election.description}</p>
        )}
      </div>

      {/* Status label + live countdown */}
      <div className="hidden sm:flex items-center gap-1.5 w-40 flex-shrink-0">
        <span className={`text-xs font-medium ${
          status === 'active'   ? 'text-emerald-700' :
          status === 'upcoming' ? 'text-amber-700'   : 'text-slate-400'
        }`}>{statusLabel}</span>
        {isReallyActive && election.endTime && <Countdown endTime={election.endTime} />}
      </div>

      {/* End date */}
      <span className="hidden md:block text-xs text-slate-400 tabular w-28 flex-shrink-0">
        {formatDate(election.endTime)}
      </span>

      {/* Actions */}
      <div className="flex gap-1.5 flex-shrink-0">
        <button
          onClick={() => canVote && navigate(`/voting/${election.id}`)}
          disabled={!canVote}
          className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
            alreadyVoted
              ? 'bg-emerald-100 text-emerald-700 cursor-default'
              : voteInProgress
              ? 'bg-amber-100 text-amber-700 cursor-default'
              : canVote
              ? 'bg-brand-600 hover:bg-brand-700 text-white'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          {alreadyVoted
            ? t('dashboard.voted')
            : voteInProgress
            ? t('dashboard.inProgress', 'En proceso')
            : canVote
            ? t('dashboard.vote')
            : t('dashboard.closed')}
        </button>
        <button
          onClick={() => navigate(`/results/${election.id}`)}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          {isReallyActive ? t('dashboard.partialResults') : t('dashboard.results')}
        </button>
      </div>
    </div>
  );
};


export const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuth();

  const [elections, setElections] = useState([]);
  const [institutionElectionCount, setInstitutionElectionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [eligibilityMap, setEligibilityMap] = useState({});
  const [filter, setFilter] = useState({ status: 'all', search: '' });
  const [sortBy, setSortBy] = useState('newest');


  useEffect(() => {
    if (!isAuthenticated) { navigate("/login"); return; }
    const redirect = searchParams.get('redirect');
    // Only allow same-origin relative paths: must start with "/" but NOT "//" (protocol-relative)
    // This prevents open-redirect attacks via ?redirect=//evil.com or ?redirect=\evil.com
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      navigate(redirect, { replace: true });
      return;
    }
    loadElections();
  }, [isAuthenticated]);


  const loadElections = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await apiFetch('/api/elections');
      if (res.status === 401) { clearAuthAndRedirect(navigate); return; }
      if (!res.ok) throw new Error("No se han podido cargar las elecciones");
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.elections || [];
      setElections(list);
      setInstitutionElectionCount(Array.isArray(data) ? list.length : (data.institutionElectionCount ?? 0));

      const eligChecks = list
        .filter(e => getRealStatus(e) === "active")
        .map(e =>
          apiFetch(`/api/elections/${e.id}/eligibility`)
            .then(r => r.ok ? r.json() : null)
            .then(d => d && setEligibilityMap(prev => ({ ...prev, [e.id]: d })))
            .catch(() => null)
        );
      await Promise.all(eligChecks);
    } catch (err) {
      setError(err.message || "No se han podido cargar las elecciones");
      setElections([]);
    } finally {
      setIsLoading(false);
    }
  };


  if (!isAuthenticated) return null;


  const userName = user?.name || user?.email || "";
  const userRole = user?.role || (() => { try { return JSON.parse(localStorage.getItem('vtb-user') || '{}').role || 'student'; } catch { return 'student'; } })();
  const isAdminUser = userRole === 'admin' || userRole === 'superadmin';


  // Filter + sort
  const filteredElections = elections.filter(e => {
    const realStatus = getRealStatus(e);
    const matchSearch = !filter.search ||
      e.name?.toLowerCase().includes(filter.search.toLowerCase()) ||
      e.description?.toLowerCase().includes(filter.search.toLowerCase());
    const matchStatus = filter.status === 'all' || realStatus === filter.status;
    return matchSearch && matchStatus;
  });


  const sortedElections = [...filteredElections].sort((a, b) =>
    sortBy === 'ending'
      ? (a.endTime || 0) - (b.endTime || 0)
      : (b.id || 0) - (a.id || 0)
  );

  
  const adminElections = isAdminUser
    ? sortedElections.filter(e => e.voterRole === 'admin')
    : [];
  const regularElections = sortedElections.filter(e => e.voterRole !== 'admin');

  return (
    <>
      <OnboardingTour role={userRole} userId={user?.id || user?.email} />
      <Navbar />
      <div className="min-h-screen bg-warm-50">
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
              {t('dashboard.welcome')}, <span className="font-medium text-brand-600">{userName}</span>
              <button
                onClick={() => navigate('/profile')}
                className="text-xs text-blue-500 hover:underline ml-2"
              >
                {t('dashboard.viewProfile')}
              </button>
            </p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('dashboard.availableElections')}
            </h1>
          </motion.div>

          {/* Error */}
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {error}
            </motion.div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center py-20">
              <LoadingSpinner message={t('dashboard.loadingElections')} />
            </div>
          )}

          {/* Empty — sin elecciones asignadas, distingue dos causas distintas */}
          {!isLoading && elections.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded bg-slate-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>

              {institutionElectionCount === 0 ? (
                /* Caso A: la institución no ha creado ninguna elección todavía */
                <>
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-1.5">{t('dashboard.noInstitutionElectionsTitle')}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                    {t('dashboard.noInstitutionElectionsDesc')}
                  </p>
                  <button onClick={loadElections}
                    className="px-5 py-2.5 rounded bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors">
                    {t('dashboard.reload')}
                  </button>
                </>
              ) : (
                /* Caso B: hay elecciones en la institución, pero ninguna asignada a este usuario */
                <>
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-1.5">{t('dashboard.noElectionsTitle')}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
                    {t('dashboard.noElectionsDesc')}
                  </p>

                  <div className="text-left bg-white border border-warm-200 rounded p-4 mb-6">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      {t('dashboard.noElectionsReasonsTitle')}
                    </p>
                    <ul className="space-y-1.5">
                      {[t('dashboard.noElectionsReason1'), t('dashboard.noElectionsReason2'), t('dashboard.noElectionsReason3')].map((reason, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <span className="w-1 h-1 rounded-full bg-slate-300 mt-2 flex-shrink-0" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
                    {t('dashboard.noElectionsContact')}
                  </p>

                  <div className="flex items-center justify-center gap-3">
                    <button onClick={loadElections}
                      className="px-5 py-2.5 rounded bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors">
                      {t('dashboard.reload')}
                    </button>
                    <button onClick={() => navigate('/profile')}
                      className="px-5 py-2.5 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors">
                      {t('dashboard.viewProfile')}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* Filter bar — only shown when there are elections */}
          {!isLoading && elections.length > 0 && (
            <motion.div data-tour="filter-bar" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap gap-3 mb-6 items-center">
              {/* Search */}
              <div className="flex-1 min-w-48 relative">
                <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder={t('dashboard.searchPlaceholder')}
                  value={filter.search}
                  onChange={e => setFilter(p => ({ ...p, search: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2 rounded border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                />
              </div>

              {/* Status filters */}
              <div className="flex gap-1.5">
                {[
                  { v: 'all',      dot: null,          label: t('dashboard.all') },
                  { v: 'active',   dot: 'bg-emerald-600', label: t('dashboard.active') },
                  { v: 'upcoming', dot: 'bg-amber-600',   label: t('dashboard.coming') },
                  { v: 'closed',   dot: 'bg-slate-400',   label: t('dashboard.closed') },
                ].map(({ v, dot, label }) => (
                  <button key={v} onClick={() => setFilter(p => ({ ...p, status: v }))}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-w-[44px] min-h-[44px] rounded text-xs font-medium transition-colors ${
                      filter.status === v
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${filter.status === v ? 'bg-white/70' : dot}`} />}
                    {label}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="px-3 py-1.5 rounded border border-slate-200 bg-white text-slate-600 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="newest">{t('dashboard.newest')}</option>
                <option value="ending">{t('dashboard.endingSoon')}</option>
              </select>

              <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
                {sortedElections.length} of {elections.length} election{elections.length !== 1 ? 's' : ''}
              </span>
            </motion.div>
          )}

          {/* Empty filter state */}
          {!isLoading && elections.length > 0 && sortedElections.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
              <svg className="w-8 h-8 text-slate-300 mb-3 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-slate-500 text-sm">{t('dashboard.noMatch')}</p>
              <button
                onClick={() => setFilter({ status: 'all', search: '' })}
                className="mt-3 text-brand-600 hover:underline text-sm"
              >
                {t('dashboard.clearFilters')}
              </button>
            </motion.div>
          )}

          {/* Elections list */}
          {!isLoading && sortedElections.length > 0 && (
            <div data-tour="elections-list" className="space-y-6">
              {isAdminUser && adminElections.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    {t('dashboard.adminElections')}
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium normal-case tracking-normal">
                      {adminElections.length}
                    </span>
                  </h2>
                  <div className="overflow-x-auto rounded border border-warm-200">
                    <div className="bg-white divide-y divide-warm-100 min-w-[560px]">
                      {adminElections.map((election, idx) => (
                        <ElectionRow
                          key={election.id}
                          election={election}
                          eligibility={eligibilityMap[election.id]}
                          index={idx}
                          navigate={navigate}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {regularElections.length > 0 && (
                <div>
                  {isAdminUser && adminElections.length > 0 && (
                    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      {t('dashboard.studentElections')}
                    </h2>
                  )}
                  <div className="overflow-x-auto rounded border border-warm-200">
                    <div className="bg-white divide-y divide-warm-100 min-w-[560px]">
                      {regularElections.map((election, idx) => (
                        <ElectionRow
                          key={election.id}
                          election={election}
                          eligibility={eligibilityMap[election.id]}
                          index={idx}
                          navigate={navigate}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
};

export default Dashboard;
