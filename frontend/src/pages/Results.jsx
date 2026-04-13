import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Navbar } from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const Results = () => {
  const { t, i18n } = useTranslation();
  const { electionId } = useParams();
  const navigate = useNavigate();

  const [election, setElection] = useState(null);
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('results'); // results | hashes

  useEffect(() => {
    loadElectionData();
  }, [electionId]);

  const loadElectionData = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('vtb-token');
      const authHeader = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

      const elecRes = await axios.get(`${API_URL}/elections/${electionId}`, authHeader);
      setElection(elecRes.data.election || elecRes.data);

      const auditRes = await axios.get(`${API_URL}/admin/audit`, authHeader);
      const filtered = auditRes.data.audit.filter(
        (entry) => entry.election_id === parseInt(electionId)
      );
      setVotes(filtered);
    } catch (err) {
      setError(err.response?.data?.error || t('results.loadError'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const calculateTallies = () => {
    const tallies = {};
    votes.forEach((vote) => {
      const choice = vote.vote_choice || t('results.noChoice');
      tallies[choice] = (tallies[choice] || 0) + 1;
    });
    return Object.entries(tallies)
      .map(([choice, count]) => ({ choice, count }))
      .sort((a, b) => b.count - a.count);
  };

  const tallies = calculateTallies();
  const totalVotes = votes.length;
  const maxVotes = Math.max(...tallies.map(t => t.count), 1);

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

  if (error) {
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

  if (!election) return null;

  const isElectionActive = election.isActive || election.is_active;
  const electionEndTime = new Date(parseInt(election.endTime || election.end_time) * 1000);
  const now = new Date();
  const minutesRemaining = Math.ceil((electionEndTime - now) / 1000 / 60);
  const timeRemaining = electionEndTime > now
    ? t('results.closesIn', { count: minutesRemaining })
    : t('results.electionClosed');

  const locale = i18n.language === 'es' ? 'es-ES' : 'en-US';

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
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                  {election.name}
                </p>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {t('results.votingResults')}
                </h1>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${
                isElectionActive
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isElectionActive ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'
                }`} />
                {isElectionActive ? t('results.liveElection') : t('results.electionClosed')}
              </span>
            </div>
          </motion.div>

          {/* Info Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
          >
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('results.totalVotes')}</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{totalVotes}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('results.candidates')}</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{tallies.length}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('results.statusLabel')}</p>
              <p className={`text-base font-bold ${
                isElectionActive
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}>
                {isElectionActive ? t('results.liveElection') : t('results.electionClosed')}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                {isElectionActive ? t('results.timeRemaining') : t('results.endedLabel')}
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{timeRemaining}</p>
            </div>
          </motion.div>

          {/* Tabs panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6"
          >
            {/* Tab Buttons */}
            <div className="flex gap-1 mb-6 border-b border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setTab('results')}
                className={`px-5 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
                  tab === 'results'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {t('results.finalResultsTab')}
              </button>
              <button
                onClick={() => setTab('hashes')}
                className={`px-5 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
                  tab === 'hashes'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {t('results.auditTab')}
              </button>
            </div>

            {/* RESULTS TAB */}
            {tab === 'results' && (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {totalVotes === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                      <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                      </svg>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">{t('results.noVotes')}</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {tallies.map((item, idx) => {
                      const pct = (item.count / totalVotes) * 100;
                      const barPct = (item.count / maxVotes) * 100;
                      const isWinner = idx === 0;
                      return (
                        <motion.div
                          key={item.choice}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.08 }}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                {item.choice}
                              </span>
                              {isWinner && totalVotes > 0 && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                  {t('results.leading')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xl font-bold text-slate-900 dark:text-white">
                                {item.count}
                              </span>
                              <span className="text-sm text-slate-500 dark:text-slate-400 w-12 text-right">
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          {/* Progress bar wrapper at full width, inner bar shows proportional fill */}
                          <div className="h-7 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${barPct}%` }}
                              transition={{ delay: idx * 0.08 + 0.15, duration: 0.5, ease: 'easeOut' }}
                              className={`h-full rounded-lg ${
                                isWinner
                                  ? 'bg-gradient-to-r from-blue-500 to-blue-600'
                                  : 'bg-gradient-to-r from-slate-400 to-slate-500 dark:from-slate-500 dark:to-slate-600'
                              }`}
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>{t('results.realtimeLabel')}</strong>{' '}
                    {t('results.realtimeDesc')}
                    {isElectionActive && ' ' + t('results.stillOpen')}
                  </p>
                </div>
              </motion.div>
            )}

            {/* HASHES TAB */}
            {tab === 'hashes' && (
              <motion.div
                key="hashes"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  {t('results.cryptoHashesDesc')}
                </p>

                {totalVotes === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-slate-500 dark:text-slate-400 text-sm">{t('results.noVotes')}</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {votes.map((vote, idx) => (
                      <motion.div
                        key={vote.id}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className="p-4 bg-slate-50 dark:bg-slate-700/60 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 transition"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {t('results.voteLabel')} #{idx + 1}
                              </p>
                              {vote.vote_choice && (
                                <span className="inline-block px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full font-medium">
                                  {vote.vote_choice}
                                </span>
                              )}
                            </div>
                            <p className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-600">
                              {vote.nullifier_hash}
                            </p>
                          </div>
                          <p className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap flex-shrink-0">
                            {new Date(vote.generated_at).toLocaleTimeString(locale)}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>{t('results.privacyTitle')}</strong>{' '}
                    {t('results.privacyDesc')}
                  </p>
                </div>
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

export default Results;
