import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import axios from 'axios'
import { useTranslation } from 'react-i18next'
import { Navbar } from '../components/Navbar'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function ChangePassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.next !== form.confirm) {
      setError(t('changePassword.mismatch'))
      return
    }
    if (form.next.length < 6) {
      setError(t('changePassword.tooShort'))
      return
    }
    setLoading(true)
    try {
      await axios.patch(
        `${API_URL}/auth/change-password`,
        { currentPassword: form.current, newPassword: form.next },
        { headers: { Authorization: `Bearer ${localStorage.getItem('vtb-token')}` } }
      )
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (err) {
      setError(err.response?.data?.error || t('changePassword.mismatch'))
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
  const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"

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
          {success ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-green-600 dark:text-green-400 mb-2">{t('changePassword.success')}</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">{t('changePassword.successDesc')}</p>
            </motion.div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{t('changePassword.title')}</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{t('changePassword.subtitle')}</p>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm"
                >
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className={labelCls}>{t('changePassword.current')}</label>
                  <input type="password" name="current" value={form.current} onChange={handleChange} disabled={loading} className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>{t('changePassword.next')}</label>
                  <input type="password" name="next" value={form.next} onChange={handleChange} disabled={loading} className={inputCls} placeholder="Min. 6" required />
                </div>
                <div>
                  <label className={labelCls}>{t('changePassword.confirm')}</label>
                  <input type="password" name="confirm" value={form.confirm} onChange={handleChange} disabled={loading} className={inputCls} required />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    disabled={loading}
                    className="flex-1 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50"
                  >
                    {t('changePassword.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !form.current || !form.next || !form.confirm}
                    className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <><div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> {t('changePassword.saving')}</>
                    ) : (
                      t('changePassword.save')
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}
