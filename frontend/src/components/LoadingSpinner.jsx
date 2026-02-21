/**
 * VTB - LoadingSpinner.jsx (BLOQUE 5.2)
 * ======================================
 * Componente reutilizable para mostrar loading states.
 * Puede ser inline o pantalla completa con timeout.
 */

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

export default function LoadingSpinner({ 
  message = 'Cargando...', 
  fullScreen = false,
  timeout = 10000  // 10 segundos por defecto
}) {
  const [showTimeout, setShowTimeout] = useState(false)

  useEffect(() => {
    if (timeout > 0) {
      const timer = setTimeout(() => {
        setShowTimeout(true)
      }, timeout)
      
      return () => clearTimeout(timer)
    }
  }, [timeout])

  const spinnerContent = (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={fullScreen ? "flex items-center justify-center min-h-screen" : "flex flex-col items-center justify-center p-8"}
    >
      {/* Spinner Animation */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="w-12 h-12 border-4 border-slate-200 dark:border-slate-600 border-t-blue-600 rounded-full"
      />
      
      {/* Message */}
      <p className="mt-4 text-slate-600 dark:text-slate-400 text-center">
        {message}
      </p>

      {/* Timeout Warning */}
      {showTimeout && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm text-center"
        >
          ⏱️ La carga está tardando más de lo esperado.<br />
          La conexión podría ser lenta.
        </motion.div>
      )}
    </motion.div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-50">
        {spinnerContent}
      </div>
    )
  }

  return spinnerContent
}
