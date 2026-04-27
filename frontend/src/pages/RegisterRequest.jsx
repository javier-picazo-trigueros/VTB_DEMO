/**
 * VTB - RegisterRequest.jsx
 * Public page for new users to request access.
 * Uses explicit school/degree/year attributes instead of email subdomains.
 */

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useTranslation } from 'react-i18next'
import { Navbar } from '../components/Navbar'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export const RegisterRequest = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [schoolsData, setSchoolsData] = useState([])
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    studentId: '',
    password: '',
    confirmPassword: '',
    school: '',
    degree: '',
    year: '',
    study_group: '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [autoApproved, setAutoApproved] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Reload schools/degrees whenever the email domain changes
  useEffect(() => {
    const domain = formData.email.includes('@') ? formData.email.split('@')[1] : ''
    if (!domain) {
      setSchoolsData([])
      return
    }
    fetch(`${API_URL}/api/schools-degrees?domain=${domain}`)
      .then(r => r.json())
      .then(data => setSchoolsData(data.schools_degrees || []))
      .catch(() => setSchoolsData([]))
  }, [formData.email])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => {
      const next = { ...prev, [name]: value }
      if (name === 'email') {
        next.school = ''
        next.degree = ''
        next.year = ''
        next.study_group = ''
      }
      if (name === 'school') {
        next.degree = ''
        next.year = ''
      }
      if (name === 'degree') {
        next.year = ''
      }
      return next
    })
    setError('')
  }

  const schools = [...new Set(schoolsData.map(s => s.school_name))]
  const degrees = schoolsData
    .filter(s => s.school_name === formData.school)
    .map(s => s.degree_name)
  const maxYears = schoolsData.find(
    s => s.school_name === formData.school && s.degree_name === formData.degree
  )?.years || 4

  const validateForm = () => {
    if (!formData.fullName.trim()) { setError('Full name is required'); return false }
    if (!formData.email.trim()) { setError('Email is required'); return false }
    if (!formData.email.includes('@') || !formData.email.includes('.')) { setError('Invalid email format'); return false }
    if (!formData.studentId.trim()) { setError('Student ID is required'); return false }
    if (formData.studentId.trim().length < 4) { setError('Student ID must be at least 4 characters'); return false }
    if (!formData.password) { setError('Password is required'); return false }
    if (formData.password.length < 6) { setError('Password must be at least 6 characters'); return false }
    if (formData.password !== formData.confirmPassword) { setError('Passwords do not match'); return false }
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    setLoading(true)
    setError('')

    try {
      const response = await axios.post(`${API_URL}/registration/request`, {
        fullName: formData.fullName,
        email: formData.email,
        studentId: formData.studentId,
        password: formData.password,
        school: formData.school || null,
        degree: formData.degree || null,
        year: formData.year ? parseInt(formData.year) : null,
        study_group: formData.study_group || null,
      })

      if (response.data.autoApproved) {
        setAutoApproved(true)
      } else {
        setSubmitted(true)
      }
      setFormData({ fullName: '', email: '', studentId: '', password: '', confirmPassword: '', school: '', degree: '', year: '', study_group: '' })
    } catch (err) {
      console.error('Registration error:', err)
      setError(err.response?.data?.error || 'Error submitting request')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
  const selectCls = "w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
  const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Navbar />

      <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-200 dark:border-slate-700"
        >
          {autoApproved ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">
                Account automatically approved!
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-2">
                Your email was pre-authorized. You can log in immediately with the password you chose.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors mt-4"
              >
                Log in now
              </button>
            </motion.div>

          ) : submitted ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">
                Request submitted
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                An administrator will review your request shortly.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
              >
                {t("register.backToLogin")}
              </button>
            </motion.div>

          ) : (
            <>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                Request Access
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
                Fill in your details and an admin will approve your account.
              </p>

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

                {/* === SECTION 1: Personal Info === */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-700/30">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 uppercase tracking-wide">
                    Personal Information
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className={labelCls}>{t("register.name")}</label>
                      <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} disabled={loading} className={inputCls} placeholder="e.g. John Smith" required />
                    </div>
                    <div>
                      <label className={labelCls}>{t("register.email")}</label>
                      <input type="email" name="email" value={formData.email} onChange={handleChange} disabled={loading} className={inputCls} placeholder="you@university.edu" required />
                    </div>
                    <div>
                      <label className={labelCls}>{t("register.studentId")}</label>
                      <input type="text" name="studentId" value={formData.studentId} onChange={handleChange} disabled={loading} className={inputCls} placeholder="E20245678" required />
                    </div>
                  </div>
                </div>

                {/* === SECTION 2: Academic Info (shown when domain has known schools) === */}
                {schools.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-700/30"
                  >
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1 uppercase tracking-wide">
                      Academic Information
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                      Optional — helps us assign you to the right elections.
                    </p>
                    <div className="space-y-3">

                      {/* School selector */}
                      <div>
                        <label className={labelCls}>School / Faculty</label>
                        <select name="school" value={formData.school} onChange={handleChange} className={selectCls}>
                          <option value="">Select school...</option>
                          {schools.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>

                      {/* Degree selector (shows when school selected) */}
                      {formData.school && degrees.length > 0 && (
                        <div>
                          <label className={labelCls}>Degree / Programme</label>
                          <select name="degree" value={formData.degree} onChange={handleChange} className={selectCls}>
                            <option value="">Select degree...</option>
                            {degrees.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                      )}

                      {/* Year selector (shows when degree selected) */}
                      {formData.degree && (
                        <div>
                          <label className={labelCls}>Year</label>
                          <select name="year" value={formData.year} onChange={handleChange} className={selectCls}>
                            <option value="">Select year...</option>
                            {Array.from({ length: maxYears }, (_, i) => i + 1).map(y => (
                              <option key={y} value={y}>Year {y}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Group (optional, shows when year selected) */}
                      {formData.year && (
                        <div>
                          <label className={labelCls}>Group (optional)</label>
                          <input
                            type="text"
                            name="study_group"
                            placeholder="e.g. A, B, Morning..."
                            value={formData.study_group}
                            onChange={handleChange}
                            className={inputCls}
                          />
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* === SECTION 3: Password === */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-700/30">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 uppercase tracking-wide">
                    Choose a Password
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className={labelCls}>{t("register.password")}</label>
                      <div className="relative">
                        <input type={showPassword ? "text" : "password"} name="password" value={formData.password} onChange={handleChange} disabled={loading} className={inputCls} placeholder="Min. 6 characters" required />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm">
                          {showPassword ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>{t("register.confirmPassword")}</label>
                      <input type={showPassword ? "text" : "password"} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} disabled={loading} className={inputCls} placeholder="Repeat your password" required />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !formData.fullName || !formData.email || !formData.studentId || !formData.password}
                  className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> {t("register.submitting")}</>
                  ) : (
                    t("register.register")
                  )}
                </button>
              </form>

              <div className="mt-5 text-center text-sm text-slate-600 dark:text-slate-400">
                {t("register.haveAccount")}{' '}
                <button onClick={() => navigate('/login')} className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">
                  {t("register.loginHere")}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}
