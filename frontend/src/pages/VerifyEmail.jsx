import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Navbar } from '../components/Navbar'
import { api } from '../utils/apiClient'

/**
 * Confirmar el email de una solicitud de registro (SCRUM-123).
 *
 * El registro público ya no crea ni aprueba nada: manda a ese correo un enlace
 * a /verify-email?token=…, y solo al confirmarlo se activa la cuenta (si el
 * email está en la lista blanca del censo) o la solicitud pasa al
 * administrador.
 *
 * La confirmación va detrás de un botón, no al cargar la página, a propósito:
 * los filtros de seguridad del correo de muchas instituciones abren los
 * enlaces para analizarlos, y alguno ejecuta el JavaScript. Si la página
 * confirmase sola, el escáner gastaría el token antes que la persona.
 */
export function VerifyEmail() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  // 32 bytes en hexadecimal. Un enlace cortado por el cliente de correo se
  // detecta aquí, antes de enviar nada.
  const tokenLooksValid = /^[0-9a-f]{64}$/i.test(token)

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // 'approved' | 'pending'
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/registration/verify', { token: token.toLowerCase() })
      setResult(res.data.status)
    } catch (err) {
      setError(err.response?.data?.error || t('verifyEmail.genericError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />
      <div className="max-w-md mx-auto px-4 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-200 dark:border-slate-700 text-center"
        >
          {!tokenLooksValid ? (
            <>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">{t('verifyEmail.invalidTitle')}</h1>
              <p className="text-slate-600 dark:text-slate-400 mb-6">{t('verifyEmail.invalidBody')}</p>
              <Link to="/register-request" className="text-blue-600 dark:text-blue-400 hover:underline">
                {t('verifyEmail.registerAgain')}
              </Link>
            </>
          ) : result === 'approved' ? (
            <>
              <h1 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-3">{t('verifyEmail.approvedTitle')}</h1>
              <p className="text-slate-600 dark:text-slate-400 mb-6">{t('verifyEmail.approvedBody')}</p>
              <Link
                to="/login"
                className="inline-block w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                {t('verifyEmail.goToLogin')}
              </Link>
            </>
          ) : result === 'pending' ? (
            <>
              <h1 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-3">{t('verifyEmail.pendingTitle')}</h1>
              <p className="text-slate-600 dark:text-slate-400">{t('verifyEmail.pendingBody')}</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">{t('verifyEmail.title')}</h1>
              <p className="text-slate-600 dark:text-slate-400 mb-6">{t('verifyEmail.body')}</p>
              {error && (
                <div role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
                  <p>{error}</p>
                  <Link to="/register-request" className="underline">{t('verifyEmail.registerAgain')}</Link>
                </div>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold"
              >
                {loading ? t('verifyEmail.confirming') : t('verifyEmail.confirm')}
              </button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}
