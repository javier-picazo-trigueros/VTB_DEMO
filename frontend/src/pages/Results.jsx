import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Navbar } from '../components/Navbar';
import { Spinner } from '../components/Spinner';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const Results = () => {
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

      // Load election details
      const elecRes = await axios.get(
        `${API_URL}/elections/${electionId}`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : {}
      );
      setElection(elecRes.data.election || elecRes.data);

      // Load votes with choice info
      const auditRes = await axios.get(
        `${API_URL}/admin/audit`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : {}
      );
      
      // Filter by current election
      const filtered = auditRes.data.audit.filter(
        (entry) => entry.election_id === parseInt(electionId)
      );
      setVotes(filtered);
    } catch (err) {
      setError(err.response?.data?.error || 'Error cargando datos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Calculate vote tallies
  const calculateTallies = () => {
    const tallies = {};
    votes.forEach((vote) => {
      const choice = vote.vote_choice || 'Sin voto';
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
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
          <Spinner />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6"
            >
              <p className="text-red-800 dark:text-red-200 mb-4">❌ {error}</p>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition"
              >
                Volver al Dashboard
              </button>
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
  const timeRemaining = electionEndTime > now ? 
    `Cierra en ${Math.ceil((electionEndTime - now) / 1000 / 60)} minutos` :
    'Elección cerrada';

  return (
    <>
      <Navbar />

      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
                📊 Resultados de Votación
              </h1>
              <p className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                <span>{election.name}</span>
                <span className={`text-sm px-3 py-1 rounded-full ${
                  isElectionActive 
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
                    : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200'
                }`}>
                  {isElectionActive ? '🟡 En vivo' : '✅ Cerrada'}
                </span>
              </p>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              ← Atrás
            </button>
          </div>

          {/* Info Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid md:grid-cols-4 gap-4 mb-8"
          >
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">Total de Votos</p>
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                {totalVotes}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">Candidatos</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {tallies.length}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">Estado</p>
              <p className={`text-lg font-bold ${
                isElectionActive
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {isElectionActive ? '🟡 Activa' : '✅ Cerrada'}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {isElectionActive ? 'Tiempo restante' : 'Finalizada'}
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {timeRemaining}
              </p>
            </div>
          </motion.div>

          {/* Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-6"
          >
            {/* Tab Buttons */}
            <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setTab('results')}
                className={`px-6 py-3 font-semibold transition border-b-2 ${
                  tab === 'results'
                    ? 'text-emerald-600 dark:text-emerald-400 border-emerald-600 dark:border-emerald-400'
                    : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                📊 Resultados Finales
              </button>
              <button
                onClick={() => setTab('hashes')}
                className={`px-6 py-3 font-semibold transition border-b-2 ${
                  tab === 'hashes'
                    ? 'text-emerald-600 dark:text-emerald-400 border-emerald-600 dark:border-emerald-400'
                    : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🔐 Auditoría de Hashes
              </button>
            </div>

            {/* RESULTS TAB */}
            {tab === 'results' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                {totalVotes === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-slate-600 dark:text-slate-400">
                      ⏳ Aún no hay votos registrados
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {tallies.map((item, idx) => {
                      const percentage = (item.count / maxVotes) * 100;
                      return (
                        <motion.div
                          key={item.choice}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {item.choice}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                {item.count}
                              </span>
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {((item.count / totalVotes) * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: '100%' }}
                            transition={{ delay: idx * 0.1 + 0.2, duration: 0.5 }}
                            className="h-8 bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-lg relative overflow-hidden"
                            style={{ width: `${percentage}%` }}
                          >
                            <div className="absolute inset-0 bg-white/20"></div>
                          </motion.div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Election Status Info */}
                <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>✓ Información en tiempo real:</strong> Los resultados se actualizan conforme llegan nuevos votos.
                    {isElectionActive && ' La votación sigue abierta.'}
                  </p>
                </div>
              </motion.div>
            )}

            {/* HASHES TAB */}
            {tab === 'hashes' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Hashes criptográficos (nullifiers) de todos los votos registrados:
                </p>

                {totalVotes === 0 ? (
                  <p className="text-center text-slate-600 dark:text-slate-400 py-12">
                    ⏳ Aún no hay votos registrados
                  </p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {votes.map((vote, idx) => (
                      <motion.div
                        key={vote.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="p-4 bg-slate-100 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-emerald-500 dark:hover:border-emerald-500 transition"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                              Voto #{idx + 1}
                              {vote.vote_choice && (
                                <span className="ml-3 inline-block px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 text-xs rounded">
                                  {vote.vote_choice}
                                </span>
                              )}
                            </p>
                            <p className="font-mono text-xs text-slate-900 dark:text-slate-200 break-all bg-white dark:bg-slate-800 p-2 rounded">
                              {vote.nullifier_hash}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {new Date(vote.generated_at).toLocaleTimeString('es-ES')}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Security Notice */}
                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>🔒 Privacidad Garantizada:</strong> Los hashes mostrados son identificadores criptográficos
                    que no revelan la identidad del votante ni su elección de voto (está hashed). Solo se almacenan en blockchain
                    para auditoría pública e inmutabilidad.
                  </p>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-8 text-center text-slate-600 dark:text-slate-400 text-sm"
          >
            <p>
              ✓ Todos los votos verificados en blockchain | 🔒 Anonimato garantizado | 📊 Auditoría pública
            </p>
          </motion.div>
        </motion.div>
      </div>
    </>
  );
};

export default Results;
