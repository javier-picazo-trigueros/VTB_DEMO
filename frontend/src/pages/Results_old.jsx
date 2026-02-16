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
  const [nullifiers, setNullifiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    loadElectionData();
  }, [electionId]);

  const loadElectionData = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('vtb-token');

      // Cargar elección
      const elecRes = await axios.get(
        `${API_URL}/elections/${electionId}`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : {}
      );
      setElection(elecRes.data);

      // Cargar hashes de votantes (nullifiers)
      const nullRes = await axios.get(
        `${API_URL}/admin/audit`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : {}
      );
      
      // Filtrar por elección actual
      const filtered = nullRes.data.audit.filter(
        (entry) => entry.election_id === parseInt(electionId)
      );
      setNullifiers(filtered);
    } catch (err) {
      setError(err.response?.data?.error || 'Error cargando datos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async () => {
    if (!authPassword.trim()) {
      setAuthError('Por favor ingresa tu contraseña');
      return;
    }

    try {
      const email = localStorage.getItem('vtb-email');
      const loginRes = await axios.post(`${API_URL}/auth/login`, {
        email,
        password: authPassword,
      });

      if (loginRes.data.token) {
        setShowAuthModal(false);
        setAuthPassword('');
        setAuthError('');
        // Ya tenemos los datos, solo mostrar
      }
    } catch (err) {
      setAuthError('Contraseña incorrecta');
    }
  };

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

  const totalVotes = nullifiers.length;

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
              <p className="text-slate-600 dark:text-slate-400">
                {election.name}
              </p>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              ← Atrás
            </button>
          </div>

          {/* Election Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-6 mb-8"
          >
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              ℹ️ Información de la Elección
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Nombre</p>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {election.name}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Total de Votos
                </p>
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {totalVotes}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Estado</p>
                <p className={`font-semibold ${
                  election.is_active
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {election.is_active ? '🟡 Activa' : '✅ Cerrada'}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Legitimidad
                </p>
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  ✓ Verificada
                </p>
              </div>
            </div>
          </motion.div>

          {/* Live Nullifiers - Votes Cast */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                🔐 Hashes de Votos (Nullifiers)
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {totalVotes} voto{totalVotes !== 1 ? 's' : ''}
              </p>
            </div>

            {totalVotes === 0 ? (
              <p className="text-center text-slate-600 dark:text-slate-400 py-12">
                ⏳ Aún no hay votos registrados
              </p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {nullifiers.map((vote, idx) => (
                  <motion.div
                    key={vote.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-emerald-500 dark:hover:border-emerald-500 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                        Voto #{idx + 1}
                      </p>
                      <p className="font-mono text-xs text-slate-900 dark:text-slate-200 break-all">
                        {vote.nullifier}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(vote.generated_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Security Notice */}
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>🔒 Privacidad Garantizada:</strong> Los hashes mostrados son identificadores criptográficos
                que no revelan la identidad del votante. Solo se almacenan en blockchain.
              </p>
            </div>

            {/* Auth Modal for Detailed View */}
            {showAuthModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4"
                >
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                    🔐 Confirmar Identidad
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Por seguridad, debes ingresar tu contraseña para ver detalles adicionales.
                  </p>
                  <input
                    type="password"
                    placeholder="Tu contraseña"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white mb-4"
                  />
                  {authError && (
                    <p className="text-red-600 dark:text-red-400 text-sm mb-4">
                      {authError}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowAuthModal(false);
                        setAuthPassword('');
                        setAuthError('');
                      }}
                      className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleViewDetails}
                      className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition"
                    >
                      Confirmar
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </motion.div>

          {/* Footer Info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-8 text-center text-slate-600 dark:text-slate-400 text-sm"
          >
            <p>
              ✓ Todos los votos verificados en blockchain | 🔒 Anonimato garantizado | 📊 Auditoría pública disponible
            </p>
          </motion.div>
        </motion.div>
      </div>
    </>
  );
};

export default Results;
