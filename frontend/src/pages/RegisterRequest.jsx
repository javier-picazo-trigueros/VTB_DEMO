/**
 * VTB - RegisterRequest.jsx (BLOQUE 3.1)
 * =======================================
 * Página para que usuarios nuevos soliciten acceso.
 * Formulario de registro sin autenticación (público).
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Navbar } from '../components/Navbar'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export const RegisterRequest = () => {
  const navigate = useNavigate()
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    studentId: '',
  })
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }))
    setError('')
  }

  // Validación client-side antes de enviar
  const validateForm = () => {
    // Todos los campos no vacíos
    if (!formData.fullName.trim()) {
      setError('El nombre completo es obligatorio')
      return false
    }
    
    if (!formData.email.trim()) {
      setError('El email es obligatorio')
      return false
    }
    
    if (!formData.studentId.trim()) {
      setError('El ID de estudiante/empleado es obligatorio')
      return false
    }
    
    // Email contiene @ y .
    if (!formData.email.includes('@') || !formData.email.includes('.')) {
      setError('Email inválido')
      return false
    }
    
    // StudentId tiene al menos 4 caracteres
    if (formData.studentId.trim().length < 4) {
      setError('El ID debe tener al menos 4 caracteres')
      return false
    }
    
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }
    
    setLoading(true)
    setError('')

    try {
      const response = await axios.post(`${API_URL}/auth/register-request`, {
        fullName: formData.fullName,
        email: formData.email,
        studentId: formData.studentId,
      })

      // Éxito: mostrar mensaje de confirmación
      setSubmitted(true)
      setFormData({ fullName: '', email: '', studentId: '' })
    } catch (err) {
      console.error('Error en solicitud:', err)
      // Mostrar el mensaje exacto que devuelve la API
      setError(err.response?.data?.error || 'Error al enviar la solicitud')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />

      <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-200 dark:border-slate-700"
        >
          {!submitted ? (
            <>
              {/* Formulario de solicitud */}
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                🚀 Solicitar Acceso
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm">
                Completa este formulario para solicitar tu cuenta de votación
              </p>

              {/* Error Message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm"
                >
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Full Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    disabled={loading}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
                    placeholder="Juan Pérez García"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email Institucional
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    disabled={loading}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
                    placeholder="juan@universidad.edu"
                    required
                  />
                </div>

                {/* Student ID */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    ID de Estudiante/Empleado
                  </label>
                  <input
                    type="text"
                    name="studentId"
                    value={formData.studentId}
                    onChange={handleChange}
                    disabled={loading}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
                    placeholder="E20245678"
                    required
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading || !formData.fullName || !formData.email || !formData.studentId}
                  className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Enviando...
                    </>
                  ) : (
                    '📤 Enviar Solicitud'
                  )}
                </button>
              </form>

              {/* Link to Login */}
              <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                ¿Ya tienes cuenta?{' '}
                <button
                  onClick={() => navigate('/login')}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                >
                  Inicia sesión
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Success Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <div className="text-5xl mb-4">✅</div>
                <h2 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">
                  ¡Solicitud Enviada!
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                  Tu solicitud ha sido registrada exitosamente.
                  <br />
                  Un administrador revisará tu petición pronto.
                </p>

                <button
                  onClick={() => navigate('/login')}
                  className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
                >
                  🔐 Volver al Login
                </button>
              </motion.div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}
