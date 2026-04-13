import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Navbar } from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const BAR_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#14b8a6'];

const ElectionResults = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const token = localStorage.getItem('vtb-token');
  const locale = i18n.language === 'es' ? 'es-ES' : 'en-US';

  const [activeTab, setActiveTab] = useState('results');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [auditData, setAuditData] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    fetchResults();
  }, [id]);

  const fetchResults = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_URL}/api/elections/${id}/results`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        }
      );
      setResults(response.data);
      setError(null);

      if (response.data.election?.status === 'active') {
        loadAudit();
      }
    } catch (err) {
      console.error('Error loading results:', err);
      setError(err.response?.data?.error || t('results.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async () => {
    try {
      setAuditLoading(true);
      const response = await axios.get(
        `${API_URL}/api/elections/${id}/audit`,
        { timeout: 10000 }
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

    const headers = ['Nullifier', 'TxHash', 'Timestamp'];
    const rows = auditData.map((row) => [row.nullifier, row.txHash, row.timestamp]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `audit-election-${id}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Auto-refresh for active elections
  useEffect(() => {
    if (!results?.election || results.election.status !== 'active') return;
    const interval = setInterval(async () => {
      setRefreshing(true);
      await fetchResults();
      setRefreshing(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [results?.election?.status]);

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

  const { election, candidates = [], totalVotes = 0, participationRate = 0 } = results;
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
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              {t('results.backToDashboard')}
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
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('results.totalVotes')}</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{totalVotes}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('results.candidates')}</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{candidates.length}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t('results.participation')}</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{participationRate.toFixed(1)}%</p>
              {election?.totalVoters > 0 && (
                <>
                  <div className="mt-2 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${participationRate}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="h-full bg-blue-500 rounded-full"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {totalVotes} / {election.totalVoters}
                  </p>
                </>
              )}
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
                  if (auditData.length === 0) loadAudit();
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
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart
                          data={candidates}
                          margin={{ top: 8, right: 16, left: 0, bottom: 48 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-700" />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 11, fill: 'currentColor' }}
                            className="text-slate-500 dark:text-slate-400"
                            angle={-35}
                            textAnchor="end"
                            height={72}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: 'currentColor' }}
                            className="text-slate-500 dark:text-slate-400"
                            allowDecimals={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--tooltip-bg, #1e293b)',
                              border: '1px solid #334155',
                              borderRadius: '0.75rem',
                              color: '#f8fafc',
                              fontSize: 13,
                            }}
                            formatter={(value) => [value, t('results.votes')]}
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
                                  {idx === 0 && totalVotes > 0 && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                                      {t('results.leading')}
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
                                    animate={{ width: `${candidate.percentage}%` }}
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
                    <p className="text-slate-500 dark:text-slate-400 text-sm">{t('results.noVotes')}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-700/50">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            Nullifier
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
                        {auditData.slice(0, 50).map((record, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                            <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                              {record.nullifier?.slice(0, 10)}...{record.nullifier?.slice(-6)}
                            </td>
                            <td className="px-4 py-3">
                              <a
                                href={`${import.meta.env.VITE_EXPLORER_URL || 'http://localhost:8545'}/tx/${record.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {record.txHash?.slice(0, 10)}...{record.txHash?.slice(-6)}
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                </svg>
                              </a>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {new Date(record.timestamp).toLocaleString(locale)}
                            </td>
                          </tr>
                        ))}
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
