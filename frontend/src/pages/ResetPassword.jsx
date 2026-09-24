import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Navbar } from '../components/Navbar'
import { api } from '../utils/apiClient'
import { PASSWORD_MIN_LENGTH } from '../utils/passwordPolicy'

// Mismo mínimo que resetSchema en backend/src/routes/auth.ts. Si cambia allí,
// cambia aquí: si no, el formulario deja pasar contraseñas que el servidor
// rechaza con un 400.
//
// El mínimo lo comprueba handleSubmit, NO el atributo `minLength` del input, a
// propósito: con `minLength`, la validación nativa del navegador bloquea el envío
// antes que handleSubmit y muestra su propio bocadillo en el idioma del navegador
// (verificado: salía en inglés con la página en español), así que el mensaje
// traducido no se veía nunca.
const MIN_LENGTH = PASSWORD_MIN_LENGTH

/**
 * Establecer una contraseña a partir de un enlace recibido por correo.
 *
 * R4: los correos llevaban a /auth/reset-password?token=… y a
 * /auth/set-password?token=…, dos rutas que no existían en el frontend: los dos
 * enlaces daban 404. Esta pantalla atiende ambas; el backend es el mismo
 * (POST /auth/reset-password sirve tanto para recuperar como para activar una
 * cuenta invitada), solo cambia el texto.
 *
 *   mode="reset"      → "Elige una contraseña nueva"  (he olvidado mi contraseña)
 *   mode="invitation" → "Activa tu cuenta"            (invitación al censo)
 */
export function ResetPassword({ mode = 'reset' }) {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  // El backend genera 32 bytes aleatorios en hexadecimal: 64 caracteres. Un
  // enlace cortado por el cliente de correo se detecta aquí, antes de enviar.
  const tokenLooksValid = /^[0-9a-f]{64}$/i.test(token)

  const [form, setForm] = useState({ password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const isInvitation = mode === 'invitation'

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password.length < MIN_LENGTH) {
      setError(t('passwordRecovery.tooShort', { min: MIN_LENGTH }))
      return
    }
    if (form.password !== form.confirm) {
      setError(t('passwordRecovery.mismatch'))
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password: form.password })
      setDone(true)
    } catch (err) {
      // El servidor distingue "no válido o ya utilizado" de "caducado"; se
      // muestra su mensaje tal cual.
      setError(err.response?.data?.error || t('passwordRecovery.networkError'))
    } finally {
      setLoading(false)
    }
  }

  const card = (children) => (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />
      <div className="max-w-md mx-auto px-4 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-200 dark:border-slate-700"
        >
          {children}
        </motion.div>
      </div>
    </div>
  )

  if (!tokenLooksValid) {
    return card(
      <div className="text-center" role="alert">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('passwordRecovery.invalidLinkTitle')}</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{t('passwordRecovery.invalidLinkDesc')}</p>
        <Link to="/forgot-password" className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">
          {t('passwordRecovery.requestNewLink')}
        </Link>
      </div>
    )
  }

  if (done) {
    return card(
      <div className="text-center" role="status">
        <h2 className="text-xl font-bold text-green-600 dark:text-green-400 mb-2">{t('passwordRecovery.successTitle')}</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{t('passwordRecovery.successDesc')}</p>
        <Link
          to="/login"
          className="inline-block px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition"
        >
          {t('passwordRecovery.goToLogin')}
        </Link>
      </div>
    )
  }

  const inputCls = 'w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none disabled:opacity-50'
  const labelCls = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1'

  return card(
    <>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
        {isInvitation ? t('passwordRecovery.invitationTitle') : t('passwordRecovery.resetTitle')}
      </h2>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
        {isInvitation ? t('passwordRecovery.invitationSubtitle') : t('passwordRecovery.resetSubtitle')}
      </p>

      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="reset-password" className={labelCls}>{t('passwordRecovery.newPassword')}</label>
          <input
            id="reset-password"
            type="password"
            name="password"
            autoComplete="new-password"
            value={form.password}
            onChange={handleChange}
            disabled={loading}
            required
            className={inputCls}
            aria-describedby="reset-password-hint"
          />
          <p id="reset-password-hint" className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('passwordRecovery.minLength', { min: MIN_LENGTH })}
          </p>
        </div>
        <div>
          <label htmlFor="reset-confirm" className={labelCls}>{t('passwordRecovery.confirmPassword')}</label>
          <input
            id="reset-confirm"
            type="password"
            name="confirm"
            autoComplete="new-password"
            value={form.confirm}
            onChange={handleChange}
            disabled={loading}
            required
            className={inputCls}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !form.password || !form.confirm}
          className="w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('passwordRecovery.saving') : t('passwordRecovery.save')}
        </button>
      </form>
    </>
  )
}
