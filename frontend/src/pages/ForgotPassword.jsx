import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Navbar } from '../components/Navbar'
import { api } from '../utils/apiClient'

/**
 * Pedir un enlace de recuperación de contraseña.
 *
 * R4: el endpoint POST /auth/forgot-password existía y funcionaba, pero no había
 * ninguna pantalla desde la que llamarlo ni ningún enlace en el login.
 *
 * El servidor responde lo mismo exista o no la cuenta ("Si el email existe…"),
 * para no revelar qué emails están registrados. Esta pantalla respeta eso: tras
 * enviar, siempre muestra el mismo mensaje.
 */
export function ForgotPassword() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (err) {
      // 400 (email mal formado) y 429 (límite de peticiones) traen su propio
      // mensaje; cualquier otra cosa es un problema de conexión.
      setError(err.response?.data?.error || t('passwordRecovery.networkError'))
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
          transition={{ duration: 0.4 }}
          className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-200 dark:border-slate-700"
        >
          {sent ? (
            <div className="text-center" role="status">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('passwordRecovery.sentTitle')}</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{t('passwordRecovery.sentDesc')}</p>
              <Link to="/login" className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">
                {t('passwordRecovery.backToLogin')}
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{t('passwordRecovery.forgotTitle')}</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{t('passwordRecovery.forgotSubtitle')}</p>

              {error && (
                <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="forgot-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('passwordRecovery.emailLabel')}
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError('') }}
                    disabled={loading}
                    required
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none disabled:opacity-50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? t('passwordRecovery.sending') : t('passwordRecovery.sendLink')}
                </button>
              </form>

              <p className="text-center mt-6">
                <Link to="/login" className="text-sm text-slate-500 hover:text-slate-700 hover:underline dark:text-slate-400 dark:hover:text-slate-200">
                  {t('passwordRecovery.backToLogin')}
                </Link>
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}
