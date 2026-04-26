import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Navbar } from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || '';
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const truncateHash = (h) =>
  h && h.length > 16 ? h.slice(0, 10) + '...' + h.slice(-6) : (h || '—');

const ElectionResults = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('vtb-token');

  const [activeTab, setActiveTab] = useState('results');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [auditData, setAuditData] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [lastUpdatedSec, setLastUpdatedSec] = useState(0);
  const [chartType, setChartType] = useState('bar');
  const [copied, setCopied] = useState(false);

  // Stable ref so the auto-refresh interval never captures a stale fetchResults
  const fetchResultsRef = useRef(null);

  const fetchResults = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const response = await axios.get(
        `${API_URL}/api/elections/${id}/results`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
      );
      setResults(response.data);
      setLastUpdatedSec(0);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load results');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Keep ref always pointing at latest fetchResults
  useEffect(() => {
    fetchResultsRef.current = fetchResults;
  });

  useEffect(() => { fetchResults(); }, [id]);

  const loadAudit = async () => {
    try {
      setAuditLoading(true);
      const response = await axios.get(
        `${API_URL}/api/elections/${id}/audit`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
      );
      setAuditData(response.data || []);
    } catch (err) {
      console.error('Error loading audit:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  const exportCSV = () => {
    if (!auditData || auditData.length === 0) { alert('No data to export'); return; }
    const headers = ['Nullifier', 'TxHash', 'BlockNumber', 'Timestamp'];
    const rows = auditData.map(r => [r.nullifier || '', r.txHash || '', r.blockNumber || '', r.timestamp || '']);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit-election-${id}.csv`;
    link.click();
  };

  // Auto-refresh for active elections — stale-closure-safe via ref
  useEffect(() => {
    if (results?.election?.status !== 'active') return;
    const counterInterval = setInterval(() => setLastUpdatedSec(s => s + 1), 1000);
    const refreshInterval = setInterval(async () => {
      setRefreshing(true);
      await fetchResultsRef.current?.({ silent: true });
      setRefreshing(false);
    }, 30000);
    return () => { clearInterval(refreshInterval); clearInterval(counterInterval); };
  }, [results?.election?.status, id]);


  // ── Loading ──
  if (loading && !results) return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />
      <div className="flex items-center justify-center min-h-[calc(100vh-70px)]">
        <LoadingSpinner message="Loading results..." />
      </div>
    </div>
  );

  // ── Error ──
  if (error && !results) return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 rounded-lg shadow-md border border-red-200 dark:border-red-800 p-8">
          <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Error</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">{error}</p>
          <button onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            Back to Dashboard
          </button>
        </motion.div>
      </div>
    </div>
  );


  if (!results) return null;

  const { election } = results;
  const candidates = Array.isArray(results.candidates) ? results.candidates : [];
  const totalVotes = Number(results.totalVotes) || 0;
  const safeRate = isNaN(results?.participationRate) ? 0 : (results?.participationRate || 0);
  const maxVotes = candidates.length ? Math.max(...candidates.map(c => c.votes)) : 0;
  const sortedCandidates = [...candidates].sort((a, b) => b.votes - a.votes);


  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <button onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition mb-4 text-sm">
            ← Back to Dashboard
          </button>

          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{election?.name}</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  election?.status === 'active'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}>
                  {election?.status === 'active' ? '🟢 Active' : '⏹ Closed'}
                </span>
                {results.onChainVerified && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
                    ✓ On-chain verified
                  </span>
                )}
              </div>
              {election?.status === 'active' && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {refreshing
                    ? 'Refreshing...'
                    : lastUpdatedSec > 0
                    ? `Updated ${lastUpdatedSec}s ago · Refreshes every 30s`
                    : 'Live results'}
                </p>
              )}
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-sm transition"
            >
              {copied ? '✓ Copied' : '🔗 Share'}
            </button>
          </div>
        </motion.div>

        {/* Stats Row — 4 cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
        >
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-5 text-center">
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{safeRate.toFixed(1)}%</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Participation</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-5 text-center">
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{totalVotes}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Votes cast</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-5 text-center">
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{election?.totalVoters || 0}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Total census</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-5 text-center">
            <p className={`text-3xl font-bold ${election?.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
              {election?.status === 'active' ? 'Active' : 'Closed'}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Status</p>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-3 mb-6">
          {[
            { id: 'results', label: '📊 Results' },
            { id: 'audit', label: '🔐 Audit' },
          ].map(({ id: tabId, label }) => (
            <button
              key={tabId}
              onClick={() => {
                setActiveTab(tabId);
                if (tabId === 'audit' && auditData.length === 0) loadAudit();
              }}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                activeTab === tabId
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* RESULTS TAB */}
        {activeTab === 'results' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* Chart card */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Votes by Candidate</h2>
                <div className="flex gap-2">
                  {['bar', 'pie'].map(type => (
                    <button
                      key={type}
                      onClick={() => setChartType(type)}
                      className={`px-3 py-1 rounded text-sm capitalize font-medium transition ${
                        chartType === type
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {candidates.length === 0 || totalVotes === 0 ? (
                <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                  <div className="text-4xl mb-3">🗳️</div>
                  <p>No votes have been cast yet.</p>
                  <p className="text-sm mt-1">Results will appear here once voting begins.</p>
                </div>
              ) : chartType === 'bar' ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={candidates.map(c => ({ name: c.name, votes: c.votes, percentage: c.percentage || 0 }))}
                    margin={{ top: 10, right: 30, left: 0, bottom: 50 }}
                  >
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                      angle={-20}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} allowDecimals={false} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-lg">
                            <p className="font-semibold text-slate-900 dark:text-white mb-1">{label}</p>
                            <p className="text-sm text-blue-600">Votes: {payload[0].value}</p>
                            <p className="text-sm text-slate-500">{(payload[0].payload.percentage || 0).toFixed(1)}%</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="votes" radius={[4, 4, 0, 0]} isAnimationActive>
                      {candidates.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex justify-center">
                  <PieChart width={420} height={300}>
                    <Pie
                      data={candidates.map(c => ({ name: c.name, value: c.votes }))}
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      labelLine={false}
                    >
                      {candidates.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </div>
              )}
            </div>

            {/* Candidate breakdown table */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Candidate Breakdown</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="text-left px-3 py-3 text-sm font-medium text-slate-500">#</th>
                      <th className="text-left px-3 py-3 text-sm font-medium text-slate-500">Candidate</th>
                      <th className="text-right px-3 py-3 text-sm font-medium text-slate-500">Votes</th>
                      <th className="text-right px-3 py-3 text-sm font-medium text-slate-500">%</th>
                      <th className="text-left px-3 py-3 text-sm font-medium text-slate-500">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCandidates.map((c, idx) => {
                      const isWinner = election?.status === 'closed' && totalVotes > 0 && c.votes === maxVotes;
                      return (
                        <tr
                          key={c.id || idx}
                          className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition"
                        >
                          <td className="px-3 py-3 text-slate-400 font-mono text-sm">#{idx + 1}</td>
                          <td className="px-3 py-3 font-medium text-slate-900 dark:text-white">
                            {c.name}
                            {isWinner && (
                              <span className="ml-2 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                                👑 Winner
                              </span>
                            )}
                          </td>
                          <td className="text-right px-3 py-3 font-mono text-blue-600 dark:text-blue-400 font-semibold">
                            {c.votes}
                          </td>
                          <td className="text-right px-3 py-3 text-slate-600 dark:text-slate-400">
                            {(c.percentage || 0).toFixed(1)}%
                          </td>
                          <td className="px-3 py-3">
                            <div className="w-32 bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.min(c.percentage || 0, 100)}%`,
                                  backgroundColor: COLORS[idx % COLORS.length],
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* AUDIT TAB */}
        {activeTab === 'audit' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 flex items-start gap-3">
              <span className="text-xl">🔒</span>
              <div>
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Privacy Guaranteed</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  This audit log confirms votes were recorded on the blockchain without revealing voter identity.
                  Only anonymous cryptographic hashes are shown.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {auditData.length} vote{auditData.length !== 1 ? 's' : ''} recorded on blockchain
              </p>
              <button
                onClick={exportCSV}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition font-medium text-sm"
              >
                📥 Export CSV
              </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Blockchain Audit Log</h2>
              {auditLoading ? (
                <div className="flex justify-center py-12"><LoadingSpinner message="Loading audit..." /></div>
              ) : auditData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">Nullifier</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">TxHash</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditData.slice(0, 50).map((record, idx) => {
                        const explorerLink = record.explorerLink ||
                          (EXPLORER_URL && record.txHash && record.onChain
                            ? `${EXPLORER_URL.replace(/\/$/, '')}/tx/${record.txHash}`
                            : null);
                        return (
                          <tr
                            key={idx}
                            className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition"
                          >
                            <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                              {truncateHash(record.nullifier)}
                            </td>
                            <td className="px-4 py-3">
                              {record.txHash ? (
                                explorerLink ? (
                                  <a
                                    href={explorerLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                    title={record.txHash}
                                  >
                                    {truncateHash(record.txHash)} ↗
                                  </a>
                                ) : (
                                  <span className="font-mono text-xs text-slate-600 dark:text-slate-400" title={record.txHash}>
                                    {truncateHash(record.txHash)}
                                    {record.onChain && <span className="ml-1 text-emerald-500">✓</span>}
                                  </span>
                                )
                              ) : (
                                <span className="text-xs text-slate-400 dark:text-slate-500 italic">Pending</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                              {record.timestamp ? new Date(record.timestamp).toLocaleString('en-GB') : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {auditData.length > 50 && (
                    <p className="text-slate-400 text-sm mt-4 px-4">
                      Showing first 50 of {auditData.length} records
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-slate-500 dark:text-slate-400">No votes recorded yet</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
};


export default ElectionResults;


