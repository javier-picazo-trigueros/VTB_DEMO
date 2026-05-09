import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import QRCode from 'react-qr-code';
import { Navbar } from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || '';
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const truncateHash = (h) =>
  h && h.length > 16 ? h.slice(0, 10) + '...' + h.slice(-6) : (h || '—');

const ElectionResults = () => {
  const { t } = useTranslation();
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
  const [showQR, setShowQR] = useState(false);

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
    if (!auditData || auditData.length === 0) { toast.error('No audit data to export'); return; }
    const headers = ['Nullifier', 'TxHash', 'BlockNumber', 'Timestamp'];
    const rows = auditData.map(r => [r.nullifier || '', r.txHash || '', r.blockNumber || '', r.timestamp || '']);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit-election-${id}.csv`;
    link.click();
  };

  const exportPDF = async () => {
    // Load audit data if not already loaded
    let currentAuditData = auditData;
    if (currentAuditData.length === 0) {
      const toastId = toast.loading('Loading audit data...');
      try {
        const response = await axios.get(
          `${API_URL}/api/elections/${id}/audit`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );
        currentAuditData = response.data || [];
        setAuditData(currentAuditData);
      } catch (err) {
        console.error('Error loading audit for PDF:', err);
      }
      toast.dismiss(toastId);
    }

    const toastId = toast.loading('Generating PDF...');
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = 210;
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // ── Header ──────────────────────────────────────────────
      pdf.setFillColor(30, 64, 175);
      pdf.rect(0, 0, 210, 30, 'F');

      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('VTB — Vote Through Blockchain', margin, 13);

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Official Election Results Report', margin, 22);

      pdf.setFontSize(9);
      const now = new Date().toLocaleString('en-GB');
      pdf.text(`Generated: ${now}`, pageWidth - margin - 55, 22);

      y = 40;

      // ── Election title ───────────────────────────────────────
      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text(results?.election?.name || 'Election Results', margin, y);
      y += 8;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      const status = results?.election?.status === 'active' ? 'ACTIVE' : 'CLOSED';
      pdf.text(`Status: ${status}  |  Total Votes: ${results?.totalVotes || 0}  |  Participation: ${results?.participationRate || 0}%`, margin, y);
      y += 5;

      if (results?.election?.startDate) {
        const start = new Date(results.election.startDate).toLocaleDateString('en-GB');
        const end = new Date(results.election.endDate).toLocaleDateString('en-GB');
        pdf.text(`Period: ${start} → ${end}`, margin, y);
        y += 5;
      }

      y += 5;

      // ── Divider ──────────────────────────────────────────────
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.3);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 7;

      // ── Candidate results ────────────────────────────────────
      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Candidate Results', margin, y);
      y += 7;

      const candidates = results?.candidates || [];
      const totalVotes = results?.totalVotes || 0;

      candidates.forEach((c, i) => {
        if (y > 260) {
          pdf.addPage();
          y = margin;
        }

        const isWinner = i === 0 && totalVotes > 0;
        const pct = c.percentage || 0;
        const barWidth = (pct / 100) * contentWidth;

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(isWinner ? 30 : 51, isWinner ? 64 : 65, isWinner ? 175 : 85);
        const label = isWinner ? `Winner: ${c.name}` : `${i + 1}. ${c.name}`;
        pdf.text(label, margin, y);

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 64, 175);
        pdf.text(`${c.votes} votes  (${pct.toFixed(1)}%)`, pageWidth - margin - 40, y);
        y += 4;

        pdf.setFillColor(226, 232, 240);
        pdf.rect(margin, y, contentWidth, 4, 'F');

        if (barWidth > 0) {
          pdf.setFillColor(isWinner ? 16 : 59, isWinner ? 185 : 130, isWinner ? 129 : 246);
          pdf.rect(margin, y, barWidth, 4, 'F');
        }

        y += 8;

        if (c.description) {
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'italic');
          pdf.setTextColor(100, 116, 139);
          pdf.text(c.description, margin + 4, y);
          y += 5;
        }
        y += 2;
      });

      y += 5;

      // ── Blockchain audit section ─────────────────────────────
      if (currentAuditData && currentAuditData.length > 0) {
        if (y > 230) { pdf.addPage(); y = margin; }

        pdf.setDrawColor(203, 213, 225);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 7;

        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 41, 59);
        pdf.text('Blockchain Audit Trail', margin, y);
        y += 5;

        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 116, 139);
        pdf.text(`${currentAuditData.length} votes recorded. Hashes are anonymous — no voter identity is stored.`, margin, y);
        y += 7;

        // Table header
        pdf.setFillColor(30, 64, 175);
        pdf.rect(margin, y, contentWidth, 6, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
        pdf.text('#', margin + 2, y + 4);
        pdf.text('Nullifier Hash', margin + 10, y + 4);
        pdf.text('TX Hash', margin + 80, y + 4);
        pdf.text('Timestamp', margin + 148, y + 4);
        y += 6;

        const limit = Math.min(currentAuditData.length, 30);
        currentAuditData.slice(0, limit).forEach((record, idx) => {
          if (y > 270) { pdf.addPage(); y = margin; }

          const rowBg = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
          pdf.setFillColor(...rowBg);
          pdf.rect(margin, y, contentWidth, 5, 'F');

          pdf.setTextColor(30, 41, 59);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(6.5);

          const nullifier = record.nullifier
            ? record.nullifier.slice(0, 10) + '...' + record.nullifier.slice(-6)
            : '—';
          const txHash = record.txHash
            ? record.txHash.slice(0, 10) + '...' + record.txHash.slice(-6)
            : 'pending';
          const ts = record.timestamp
            ? new Date(record.timestamp).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
            : '—';

          pdf.text(String(idx + 1), margin + 2, y + 3.5);
          pdf.text(nullifier, margin + 10, y + 3.5);
          pdf.setTextColor(record.txHash ? 30 : 150, record.txHash ? 64 : 150, record.txHash ? 175 : 150);
          pdf.text(txHash, margin + 80, y + 3.5);
          pdf.setTextColor(100, 116, 139);
          pdf.text(ts, margin + 148, y + 3.5);
          y += 5;
        });

        if (currentAuditData.length > 30) {
          y += 3;
          pdf.setFontSize(8);
          pdf.setTextColor(100, 116, 139);
          pdf.text(`... and ${currentAuditData.length - 30} more records. Export full audit via the CSV button.`, margin, y);
          y += 5;
        }
      }

      // ── Footer ───────────────────────────────────────────────
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(150, 150, 150);
        pdf.text(
          `VTB — Vote Through Blockchain  |  All votes verified on Ethereum  |  Page ${i} of ${pageCount}`,
          margin, 293
        );
        if (results?.onChainVerified) {
          pdf.setTextColor(16, 185, 129);
          pdf.text('Verified on-chain', pageWidth - margin - 35, 293);
        }
      }

      // ── Save ─────────────────────────────────────────────────
      const filename = `VTB_Results_${(results?.election?.name || 'election').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
      toast.dismiss(toastId);
      toast.success('PDF exported successfully');
    } catch (err) {
      console.error('PDF export error:', err);
      toast.dismiss(toastId);
      toast.error('Error generating PDF');
    }
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
        <LoadingSpinner message={t('results.loadingResults')} />
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
            {t('results.backToDashboard')}
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
            ← {t('results.backToDashboard')}
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
                  {election?.status === 'active' ? `🟢 ${t('results.liveElection')}` : `⏹ ${t('results.electionClosed')}`}
                </span>
                {results.onChainVerified && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
                    ✓ {t('results.onChainVerified')}
                  </span>
                )}
              </div>
              {election?.status === 'active' && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {refreshing
                    ? t('results.refreshing')
                    : lastUpdatedSec > 0
                    ? t('results.updatedAgo', { sec: lastUpdatedSec })
                    : t('results.liveResults')}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* PDF Export */}
              <button
                onClick={exportPDF}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
              >
                📄 Export PDF
              </button>

              {/* QR Code — only for active elections */}
              {election?.status === 'active' && (
                <button
                  onClick={() => setShowQR(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition"
                >
                  📱 QR Code
                </button>
              )}

              {/* Share / copy link */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-sm transition"
              >
                {copied ? `✓ ${t('results.copied')}` : `🔗 ${t('results.share')}`}
              </button>
            </div>
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
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('results.participation')}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-5 text-center">
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{totalVotes}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('results.votesCast')}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-5 text-center">
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{election?.totalVoters || 0}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('results.totalCensus')}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-5 text-center">
            <p className={`text-3xl font-bold ${election?.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
              {election?.status === 'active' ? t('results.liveElection') : t('results.electionClosed')}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('results.statusLabel')}</p>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-3 mb-6">
          {[
            { id: 'results', label: `📊 ${t('results.finalResultsTab')}` },
            { id: 'audit', label: `🔐 ${t('results.auditTab')}` },
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
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('results.votesByCandidate')}</h2>
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
                  <p>{t('results.noVotesCast')}</p>
                  <p className="text-sm mt-1">{t('results.noVotesCastDesc')}</p>
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
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">{t('results.candidateBreakdown')}</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="text-left px-3 py-3 text-sm font-medium text-slate-500">#</th>
                      <th className="text-left px-3 py-3 text-sm font-medium text-slate-500">{t('results.candidate')}</th>
                      <th className="text-right px-3 py-3 text-sm font-medium text-slate-500">{t('results.votes')}</th>
                      <th className="text-right px-3 py-3 text-sm font-medium text-slate-500">%</th>
                      <th className="text-left px-3 py-3 text-sm font-medium text-slate-500">{t('results.progress')}</th>
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
                                👑 {t('results.winner')}
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
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{t('results.privacyTitle')}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  {t('results.privacyAuditDesc')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('results.recordedOnBlockchain', { count: auditData.length })}
              </p>
              <button
                onClick={exportCSV}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition font-medium text-sm"
              >
                📥 Export CSV
              </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">{t('results.blockchainAuditLog')}</h2>
              {auditLoading ? (
                <div className="flex justify-center py-12"><LoadingSpinner message={t('results.loadingAudit')} /></div>
              ) : auditData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">{t('results.nullifier')}</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">{t('results.txHash')}</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-500">{t('results.timestamp')}</th>
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
                      {t('results.showing50', { total: auditData.length })}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-slate-500 dark:text-slate-400">{t('results.noVotes')}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>

      {/* QR Code Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-xs text-center shadow-2xl">
            <h3 className="font-bold text-slate-900 dark:text-white mb-1">{election?.name}</h3>
            <p className="text-xs text-slate-500 mb-4">Scan to vote</p>
            <div className="bg-white p-4 rounded-xl inline-block shadow-inner mb-4">
              <QRCode value={`${window.location.origin}/voting/${id}`} size={180} />
            </div>
            <p className="text-xs text-slate-400 font-mono break-all mb-4">
              {window.location.origin}/voting/{id}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowQR(false)}
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Close
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/voting/${id}`);
                  toast.success('Link copied');
                }}
                className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium transition"
              >
                Copy Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default ElectionResults;
