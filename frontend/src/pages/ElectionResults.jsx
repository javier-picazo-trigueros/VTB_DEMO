import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

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

  // Cargar datos de resultados
  useEffect(() => {
    const fetchResults = async () => {
      try {
        setLoading(true);
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/elections/${id}/results`,
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000,
          }
        );

        setResults(response.data);
        
        // Si la elecciÃ³n estÃ¡ activa, cargar auditorÃ­a en segundo plano
        if (response.data.election.status === 'active') {
          fetchAudit();
        }
        
        setError(null);
      } catch (err) {
        console.error('Error al cargar resultados:', err);
        setError(err.response?.data?.error || 'No se pudieron cargar los resultados');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();

    // Si elecciÃ³n estÃ¡ activa, refrescar cada 30 segundos
    let refreshInterval = null;
    if (results?.election.status === 'active') {
      refreshInterval = setInterval(() => {
        setRefreshing(true);
        fetchResults();
        setRefreshing(false);
      }, 30000);
    }

    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, [id, token]);

  // Cargar auditorÃ­a
  const fetchAudit = async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/elections/${id}/audit`,
        { timeout: 10000 }
      );
      setAuditData(response.data || []);
    } catch (err) {
      console.error('Error al cargar auditorÃ­a:', err);
    }
  };

  // Exportar CSV
  const exportCSV = () => {
    if (!auditData || auditData.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    const headers = ['Nullifier', 'TxHash', 'Timestamp'];
    const rows = auditData.map((row) => [row.nullifier, row.txHash, row.timestamp]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `auditoria-eleccion-${id}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error && !results) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-900/20 border border-red-600 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-2">Error</h2>
            <p className="text-red-200 mb-4">{error}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
            >
              Volver al Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner message="Cargando resultados..." />;
  }

  if (!results) {
    return null;
  }

  const { election, candidates, totalVotes, participationRate } = results;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <button
          onClick={() => navigate('/dashboard')}
          className="mb-6 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition flex items-center gap-2"
        >
          â† Volver al Dashboard
        </button>

        <h1 className="text-4xl font-bold mb-2">{election.name}</h1>
        <p className="text-slate-400 mb-6">
          {election.status === 'active' && 'â³ ElecciÃ³n en curso â€” resultados parciales, se actualizan cada 30s'}
          {election.status === 'closed' && 'âœ… ElecciÃ³n cerrada â€” resultado definitivo'}
          {election.status === 'pending' && 'â° ElecciÃ³n aÃºn no ha comenzado'}
          {refreshing && ' (actualizando...)'}
        </p>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-slate-700">
          <button
            onClick={() => setActiveTab('results')}
            className={`px-4 py-2 font-medium transition ${
              activeTab === 'results'
                ? 'border-b-2 border-blue-500 text-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ðŸ“Š Resultados
          </button>
          <button
            onClick={() => {
              setActiveTab('audit');
              if (auditData.length === 0) {
                fetchAudit();
              }
            }}
            className={`px-4 py-2 font-medium transition ${
              activeTab === 'audit'
                ? 'border-b-2 border-blue-500 text-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ðŸ”— AuditorÃ­a Blockchain
          </button>
        </div>

        {/* RESULTADOS TAB */}
        {activeTab === 'results' && (
          <div className="space-y-6">
            {/* Tarjeta de ParticipaciÃ³n */}
            <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-6">
              <div className="text-center">
                <p className="text-slate-300 mb-2">ParticipaciÃ³n</p>
                <p className="text-5xl font-bold text-blue-400 mb-2">
                  {totalVotes} de {election.totalVoters}
                </p>
                <p className="text-2xl text-blue-300">{participationRate.toFixed(1)}%</p>
              </div>
              <div className="mt-4 bg-slate-700 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-500"
                  style={{ width: `${participationRate}%` }}
                />
              </div>
            </div>

            {/* GrÃ¡fico de Resultados */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-6">Votos por Candidato</h2>
              {candidates && candidates.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={candidates}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12, fill: '#999' }}
                      angle={-45}
                      textAnchor="end"
                      height={100}
                    />
                    <YAxis tick={{ fontSize: 12, fill: '#999' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '0.5rem',
                      }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(value, name) => {
                        if (name === 'votes') {
                          return [value, 'Votos'];
                        }
                        return value;
                      }}
                    />
                    <Bar dataKey="votes" fill="#3b82f6" isAnimationActive={true} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-400">No hay candidatos en esta elecciÃ³n</p>
              )}
            </div>

            {/* Tabla Detallada */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-6">Detalles por Candidato</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-600">
                    <tr>
                      <th className="text-left px-4 py-3 text-slate-300">Candidato</th>
                      <th className="text-right px-4 py-3 text-slate-300">Votos</th>
                      <th className="text-right px-4 py-3 text-slate-300">Porcentaje</th>
                      <th className="text-left px-4 py-3 text-slate-300">Barra Visual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((candidate) => (
                      <tr key={candidate.id} className="border-b border-slate-700 hover:bg-slate-700/30 transition">
                        <td className="px-4 py-3">{candidate.name}</td>
                        <td className="text-right px-4 py-3 font-mono text-blue-400">{candidate.votes}</td>
                        <td className="text-right px-4 py-3 text-slate-300">{candidate.percentage.toFixed(1)}%</td>
                        <td className="px-4 py-3">
                          <div className="w-32 bg-slate-700 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-blue-500 h-full transition-all"
                              style={{ width: `${candidate.percentage}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* AUDITORÃA TAB */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            {/* Banner de Privacidad */}
            <div className="bg-green-900/20 border border-green-600 rounded-lg p-4">
              <p className="text-green-300">
                ðŸ”’ Privacidad garantizada â€” los hashes no revelan la identidad del votante ni el sentido del voto
              </p>
            </div>

            {/* BotÃ³n Exportar */}
            <button
              onClick={exportCSV}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium"
            >
              ðŸ“¥ Exportar CSV
            </button>

            {/* Tabla de AuditorÃ­a */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-6">Registro de AuditorÃ­a Blockchain</h2>
              {auditData && auditData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-600">
                      <tr>
                        <th className="text-left px-4 py-3 text-slate-300">Nullifier</th>
                        <th className="text-left px-4 py-3 text-slate-300">TxHash</th>
                        <th className="text-left px-4 py-3 text-slate-300">Fecha/Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditData.slice(0, 50).map((record, idx) => (
                        <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/30 transition">
                          <td className="px-4 py-3 font-mono text-xs text-slate-300">
                            {record.nullifier.slice(0, 10)}...{record.nullifier.slice(-6)}
                          </td>
                          <td className="px-4 py-3">
                            <a
                              href={`${import.meta.env.VITE_EXPLORER_URL || 'http://localhost:8545'}/tx/${record.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs text-blue-400 hover:underline"
                            >
                              {record.txHash.slice(0, 10)}...{record.txHash.slice(-6)} â†’
                            </a>
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {new Date(record.timestamp).toLocaleString('es-ES')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {auditData.length > 50 && (
                    <p className="text-slate-400 text-sm mt-4">
                      Mostrando primeros 50 registros de {auditData.length} totales
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-slate-400">No se han registrado votos todavÃ­a</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ElectionResults;