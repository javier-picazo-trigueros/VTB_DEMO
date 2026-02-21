import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * ErrorBoundary Component
 * 
 * Captura errores no controlados en toda la aplicación
 * Muestra una pantalla amigable y permite volver al inicio
 */
export const ErrorBoundary = ({ children }) => {
  const [hasError, setHasError] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  // Detectar errores durante render
  if (hasError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/10 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 border border-red-200 dark:border-red-800">
          <div className="text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">
              Algo salió mal
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Se produjo un error inesperado. Intenta recargar la página o vuelve al inicio.
            </p>

            {process.env.NODE_ENV === 'development' && error && (
              <details className="mt-6 mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-left">
                <summary className="cursor-pointer font-semibold text-red-600 dark:text-red-400 mb-2">
                  Detalles del error (solo en desarrollo)
                </summary>
                <pre className="text-xs text-red-700 dark:text-red-300 overflow-auto max-h-48 p-2 bg-white dark:bg-slate-700 rounded">
                  {error.toString()}
                </pre>
              </details>
            )}

            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition"
              >
                🔄 Recargar página
              </button>
              <button
                onClick={() => {
                  setHasError(false)
                  setError(null)
                  navigate('/')
                }}
                className="w-full py-2 px-4 rounded-lg bg-slate-600 hover:bg-slate-700 text-white font-semibold transition"
              >
                🏠 Volver al inicio
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Wrapper que captura errores
  const ErrorBoundaryWrapper = () => {
    try {
      return children
    } catch (err) {
      console.error('Error capturado por ErrorBoundary:', err)
      setError(err)
      setHasError(true)
      return null
    }
  }

  return <ErrorBoundaryWrapper />
}

export default ErrorBoundary
