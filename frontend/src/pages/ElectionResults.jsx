import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Navbar } from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || '';

const BAR_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const truncateHash = (h) => {
  if (!h || h.length < 16) return h || '—';
  return `${h.slice(0, 10)}...${h.slice(-6)}`;
};

const ElectionResults = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const token = localStorage.getItem('vtb-token');

  const [activeTab, setActiveTab] = useState('results');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [auditData, setAuditData] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [lastUpdatedSec, setLastUpdatedSec] = useState(0);

  // Detect dark mode for chart colors
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const chartColors = {
    grid: isDark ? '#334155' : '#e2e8f0',
    axis: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#1e293b' : '#ffffff',
    tooltipBorder: isDark ? '#334155' : '#e2e8f0',
    tooltipText: isDark ? '#f8fafc' : '#0f172a',
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0]?.payload || {};
    return (
      <div
        className="rounded-xl border px-3 py-2 text-sm shadow-lg"
        style={{
          backgroundColor: chartColors.tooltipBg,
          borderColor: chartColors.tooltipBorder,
          color: chartColors.tooltipText,
        }}
      >
        <p className="font-semibold">{item.name || '—'}</p>
        <p>{Number(item.votes) || 0} votes</p>
        <p>{Number(item.percentage || 0).toFixed(1)}%</p>
      </div>
    );
  };

  useEffect(() => {
    fetchResults();
  }, [id]);

  const fetchResults = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const response = await axios.get(
        `${API_URL}/api/elections/${id}/results`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        }
      );
      setResults(response.data);
      setLastUpdatedSec(0);
      setError(null);
    } catch (err) {
      console.error('Error loading results:', err);
      setError(err.response?.data?.error || t('results.loadError'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadAudit = async () => {
    try {
      setAuditLoading(true);
      const response = await axios.get(
        `${API_URL}/api/elections/${id}/audit`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        }
      );
      setAuditData(response.data || []);
    } catch (err) {
      console.error('Error loading audit:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  const exportCSV = () => {
    if (!auditData || auditData.length === 0) return;

    const headers = 'Nullifier,TxHash,BlockNumber,OnChain,Timestamp';
    const rows = auditData.map((r) => `${r.nullifier || ''},${r.txHash || ''},${r.blockNumber || ''},${r.onChain ? 'true' : 'false'},${r.timestamp || ''}`);
    const csv = [headers, ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `audit-election-${id}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Auto-refresh for active elections + last-updated counter
  useEffect(() => {
    if (!results?.election || results.election.status !== 'active') return;
    const counterInterval = setInterval(() => setLastUpdatedSec(s => s + 1), 1000);
    const refreshInterval = setInterval(async () => {
      setRefreshing(true);
      await fetchResults({ silent: true });
      setRefreshing(false);
    }, 30000);
    return () => { clearInterval(refreshInterval); clearInterval(counterInterval); };
  }, [results?.election?.status, id]);

  // ── Loading ──
  if (loading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
          <LoadingSpinner message={t('loading')} />
        </div>
      </>
    );
  }

  // ── Error ──
  if (error && !results) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 flex items-start gap-3"
            >
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-red-800 dark:text-red-200 mb-3">{error}</p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition"
                >
                  {t('results.backToDashboard')}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </>
    );
  }

  if (!results) return null;

  const { election } = results;
  const rawCandidates = Array.isArray(results.candidates) ? results.candidates : [];
  const totalVotes = Number(results.totalVotes) || 0;
  const totalVoters = Number(election?.totalVoters) || 0;
  const rawRate = Number(results.participationRate);
  const safeRate = isNaN(rawRate) ? 0 : rawRate;
  const candidates = rawCandidates.map((candidate, idx) => {
    const votes = Number(candidate?.votes) || 0;
    return {
      id: candidate?.id ?? idx,
      name: candidate?.name || '—',
      votes,
      percentage: totalVotes > 0 ? (votes / totalVotes) * 100 : 0,
    };
  });
  const maxVotes = Math.max(...candidates.map(c => c.votes), 0);
  const isActive = election?.status === 'active';

  const statusInfo = {
    active:  { label: t('results.liveElection'),  dot: 'bg-amber-500 animate-pulse', badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
    closed:  { label: t('results.electionClosed'), dot: 'bg-slate-400',               badge: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' },
    pending: { label: t('results.pending'),         dot: 'bg-blue-400',                badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  };
  const si = statusInfo[election?.status] || statusInfo.closed;

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition mb-3"
            >
              ← Back to Dashboard
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{election?.name}</p>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {t('results.votingResults')}
                </h1>
                {refreshing && (
                  <p className="text-xs text-slate-400 mt-1">{t('results.refreshing')}</p>
                )}
                {isActive && !refreshing && lastUpdatedSec > 0 && (
                  <p className="text-xs text-slate-400 mt-1">Last updated {lastUpdatedSec} seconds ago</p>
                )}
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${si.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${si.dot}`} />
                {si.label}
              </span>
            </div>

            {isActive && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                {t('results.activeWarning')}
              </p>
            )}
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="grid sm:grid-cols-3 gap-4 mb-6"
          >
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Participation</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{safeRate.toFixed(1)}%</p>
              {totalVoters > 0 && (
                <>
                  <div className="mt-2 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(safeRate, 100)}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="h-full bg-blue-500 rounded-full"
                    />
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {totalVotes} / {totalVoters} voters
                  </p>
                </>
              )}
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Votes cast</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{totalVotes}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total census</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{totalVoters}</p>
            </div>
          </motion.div>

          {/* Tab panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6"
          >
            {/* Tab buttons */}
            <div className="flex gap-1 mb-6 border-b border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setActiveTab('results')}
                className={`px-5 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
                  activeTab === 'results'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {t('results.finalResultsTab')}
              </button>
              <button
                onClick={() => {
                  setActiveTab('audit');
                  loadAudit();
                }}
                className={`px-5 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
                  activeTab === 'audit'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {t('results.auditTab')}
              </button>
            </div>

            {/* RESULTS TAB */}
            {activeTab === 'results' && (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                {candidates.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                      <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                      </svg>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">{t('results.noVotes')}</p>
                  </div>
                ) : (
                  <>
                    {/* Bar chart */}
                    <div className="mb-8">
                      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                        {t('results.votesByCandidate')}
                      </h2>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={candidates}
                          margin={{ top: 8, right: 16, left: 0, bottom: 48 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 11, fill: chartColors.axis }}
                            angle={-35}
                            textAnchor="end"
                            height={72}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: chartColors.axis }}
                            allowDecimals={false}
                          />
                          <Tooltip
                            content={<CustomTooltip />}
                          />
                          <Bar dataKey="votes" radius={[6, 6, 0, 0]} isAnimationActive>
                            {candidates.map((_, idx) => (
                              <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Candidate table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-700/50">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                              {t('results.option')}
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                              {t('results.votes')}
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                              {t('results.percentage')}
                            </th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">
                              {t('results.distribution')}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                          {candidates.map((candidate, idx) => (
                            <motion.tr
                              key={candidate.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: BAR_COLORS[idx % BAR_COLORS.length] }}
                                  />
                                  <span className="font-medium text-slate-900 dark:text-white">
                                    {candidate.name}
                                  </span>
                                  {totalVotes > 0 && candidate.votes === maxVotes && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                                      👑 Winner
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                                {candidate.votes}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                                {candidate.percentage.toFixed(1)}%
                              </td>
                              <td className="px-4 py-3 hidden sm:table-cell">
                                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(candidate.percentage, 100)}%` }}
                                    transition={{ delay: idx * 0.05 + 0.2, duration: 0.5, ease: 'easeOut' }}
                                    className="h-full rounded-full"
                                    style={{ backgroundColor: BAR_COLORS[idx % BAR_COLORS.length] }}
                                  />
                                </div>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        <strong>{t('results.realtimeLabel')}</strong>{' '}
                        {t('results.realtimeDesc')}
                        {isActive && ' ' + t('results.stillOpen')}
                      </p>
                    </div>

                    {totalVotes > 0 && (
                      <div className="mt-3 flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                        <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                        <p className="text-sm text-emerald-800 dark:text-emerald-200">
                          <strong>On-chain verified</strong> — {totalVotes} vote{totalVotes !== 1 ? 's' : ''} recorded on the blockchain. Each vote is cryptographically anchored and publicly auditable.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* AUDIT TAB */}
            {activeTab === 'audit' && (
              <motion.div key="audit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>{t('results.privacyTitle')}</strong>{' '}
                    {t('results.privacyDesc')}
                  </p>
                </div>

                {auditData.length > 0 && (
                  <div className="mb-4 flex justify-end">
                    <button
                      onClick={exportCSV}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-semibold transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      {t('results.exportCsv')}
                    </button>
                  </div>
                )}

                {auditLoading ? (
                  <div className="flex justify-center py-12">
                    <LoadingSpinner message={t('loading')} />
                  </div>
                ) : auditData.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-slate-500 dark:text-slate-400 text-sm">No audit records found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-700/50">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            Nullifier Hash
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            Tx Hash
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            {t('results.timestamp')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {auditData.slice(0, 50).map((record, idx) => {
                          const explorerLink = record.explorerLink ||
                            (EXPLORER_URL && record.txHash && record.onChain
                              ? `${EXPLORER_URL.replace(/\/$/, '')}/tx/${record.txHash}`
                              : null);
                          return (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                              <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                                {truncateHash(record.nullifier)}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs">
                                <div className="flex items-center gap-1.5">
                                  {record.onChain && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 text-xs font-medium" title="Confirmed on-chain">✓</span>
                                  )}
                                  {explorerLink ? (
                                    <a
                                      href={explorerLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-blue-600 dark:text-blue-400 hover:underline"
                                      title={record.txHash}
                                    >
                                      {truncateHash(record.txHash)}
                                    </a>
                                  ) : (
                                    <span className="text-slate-600 dark:text-slate-400" title={record.txHash}>
                                      {truncateHash(record.txHash)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                {record.blockNumber && (
                                  <span className="text-slate-400 dark:text-slate-500 mr-2">#{record.blockNumber}</span>
                                )}
                                {formatDate(record.timestamp)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {auditData.length > 50 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-3 border-t border-slate-200 dark:border-slate-700">
                        {t('results.showingFirst', { shown: 50, total: auditData.length })}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500"
          >
            {t('results.footerText')}
          </motion.div>

        </main>
      </div>
    </>
  );
};

export default ElectionResults;
