/**
 * VTB - Dashboard.jsx
 * ===================
 * Panel principal para votantes.
 * Muestra elecciones disponibles y permite votar.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { Navbar } from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const Dashboard = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  
  const [elections, setElections] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Verificar autenticación
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    loadElections()
  }, [isAuthenticated, navigate])

  const loadElections = async () => {
    try {
      setIsLoading(true)
      setError('')
      
      const token = localStorage.getItem('vtb-token')
      if (!token) {
        navigate('/login')
        return
      }

      const response = await fetch(`${API_URL}/api/elections`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          navigate('/login')
          return
        }
        throw new Error('Error al cargar elecciones')
      }
      
      const data = await response.json()
      setElections(Array.isArray(data) ? data : data.elections || [])
    } catch (err) {
      console.error('Error cargando elecciones:', err)
      setError(err.message || 'Error al cargar elecciones')
      setElections([])
    } finally {
      setIsLoading(false)
    }
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <>
      <Navbar />
      
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        {/* Contenedor principal */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Encabezado */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
              📋 Panel de Votación
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Bienvenido, <span className="font-semibold text-blue-600 dark:text-blue-400">{user?.name || user?.email}</span>
            </p>
          </motion.div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
            >
              ⚠️ {error}
            </motion.div>
          )}

          {/* Loading State */}
          {isLoading && (
            <LoadingSpinner message="Cargando tus elecciones..." />
          )}

          {/* Empty State */}
          {!isLoading && elections.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-4">
                Sin elecciones disponibles en este momento
              </p>
              <button
                onClick={loadElections}
                className="px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
              >
                🔄 Recargar
              </button>
            </motion.div>
          )}

          {/* Elections Grid */}
          {!isLoading && elections.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ staggerChildren: 0.1 }}
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {elections.map((election, idx) => (
                <motion.div
                  key={election.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-white dark:bg-slate-800 rounded-lg shadow-md hover:shadow-lg transition border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col"
                >
                  <div className="p-6 pb-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                          {election.name}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                          {election.description}
                        </p>
                      </div>
                      <span className="text-3xl ml-3">🗳️</span>
                    </div>

                    <div className="mb-6 flex gap-4 text-xs">
                      <div className="flex-1">
                        <p className="text-slate-500 dark:text-slate-400 text-xs">Inicia</p>
                        <p className="font-semibold text-slate-700 dark:text-slate-300">
                          {new Date(election.startTime * 1000).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex-1">
                        <p className="text-slate-500 dark:text-slate-400 text-xs">Termina</p>
                        <p className="font-semibold text-slate-700 dark:text-slate-300">
                          {new Date(election.endTime * 1000).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex-1">
                        <p className="text-slate-500 dark:text-slate-400 text-xs">Estado</p>
                        <p className={`font-semibold text-sm ${
                          election.is_active
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {election.isActive ? 'Activa' : 'Cerrada'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 dark:border-slate-700 p-4 flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => navigate(`/voting/${election.id}`)}
                      className="flex-1 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!election.isActive}
                    >
                      {election.isActive ? 'Votar' : 'Cerrada'}
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => navigate(`/results/${election.id}`)}
                      className="flex-1 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
                      title={election.is_active ? 'Ver resultados parciales' : 'Ver resultados definitivos'}
                    >
                      {election.is_active ? 'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…Â  Parcial' : 'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…Â  Resultados'}
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </main>
      </div>
    </>
  )
}

export default Dashboard