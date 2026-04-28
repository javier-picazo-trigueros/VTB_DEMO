import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { clearAuthAndRedirect } from '../utils/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function UserProfile() {
  const navigate = useNavigate();
  const { setAuthUser } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState(null);
  const [schoolsData, setSchoolsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  const [activity, setActivity] = useState([]);

  const getAuthHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem('vtb-token')}`,
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    setError('');
    const token = localStorage.getItem('vtb-token');
    if (!token) {
      clearAuthAndRedirect(navigate);
      return;
    }
    try {
      const res = await axios.get(`${API_URL}/auth/me/profile`, {
        headers: getAuthHeader(),
      });
      setProfile(res.data.user);
      setEditForm({
        name: res.data.user.name || '',
        school: res.data.user.school || '',
        degree: res.data.user.degree || '',
        year: res.data.user.year || '',
        study_group: res.data.user.study_group || '',
      });

      if (res.data.user.email) {
        const domain = res.data.user.email.split('@')[1];
        try {
          const schoolRes = await axios.get(
            `${API_URL}/api/schools-degrees?domain=${domain}`,
            { headers: getAuthHeader() }
          );
          setSchoolsData(schoolRes.data.schools_degrees || []);
        } catch {
          // ignore — domain may not have schools configured
        }
      }

      try {
        const actRes = await axios.get(`${API_URL}/api/elections`, {
          headers: getAuthHeader(),
        });
        const elections = actRes.data.elections || actRes.data || [];
        setActivity(Array.isArray(elections) ? elections.slice(0, 10) : []);
      } catch {
        setActivity([]);
      }
    } catch (err) {
      if (err.response?.status === 401) {
        clearAuthAndRedirect(navigate);
        return;
      }
      if (!err.response || err.code === 'ERR_NETWORK') {
        setError('Backend is waking up — please wait a moment and retry.');
      } else {
        setError(err.response?.data?.error || err.message || 'Error loading profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await axios.patch(
        `${API_URL}/auth/me/profile`,
        editForm,
        { headers: getAuthHeader() }
      );
      setProfile(res.data.user);
      if (setAuthUser && res.data.user.name) {
        const stored = localStorage.getItem('vtb-user');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            const updated = { ...parsed, name: res.data.user.name };
            localStorage.setItem('vtb-user', JSON.stringify(updated));
            setAuthUser(updated);
          } catch { /* ignore */ }
        }
      }
      setEditing(false);
      setSuccess('Profile updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Error saving profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (pwForm.next !== pwForm.confirm) {
      setPwError('New passwords do not match');
      return;
    }
    if (pwForm.next.length < 6) {
      setPwError('Password must be at least 6 characters');
      return;
    }
    setPwLoading(true);
    setPwError('');
    try {
      await axios.patch(
        `${API_URL}/auth/change-password`,
        { currentPassword: pwForm.current, newPassword: pwForm.next },
        { headers: getAuthHeader() }
      );
      setPwSuccess('Password changed successfully!');
      setPwForm({ current: '', next: '', confirm: '' });
      setTimeout(() => setPwSuccess(''), 4000);
    } catch (err) {
      setPwError(err.response?.data?.error || 'Error changing password');
    } finally {
      setPwLoading(false);
    }
  };

  const schools = [...new Set(schoolsData.map(s => s.school_name))];
  const degrees = schoolsData
    .filter(s => s.school_name === editForm.school)
    .map(s => s.degree_name);
  const maxYears = schoolsData.find(
    s => s.school_name === editForm.school && s.degree_name === editForm.degree
  )?.years || 4;

  const getRoleColor = (role) => {
    if (role === 'superadmin') return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
    if (role === 'admin') return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
    return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
  };

  const tabs = [
    { id: 'profile', label: '👤 Profile' },
    { id: 'security', label: '🔐 Security' },
    { id: 'activity', label: '📊 Activity' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        <p className="text-slate-500 dark:text-slate-400 text-sm">Loading profile...</p>
        <button
          onClick={() => navigate(-1)}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-sm underline"
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <button
            onClick={() => navigate(-1)}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm mb-4 flex items-center gap-1"
          >
            ← Back
          </button>

          <div className="flex items-center gap-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg flex-shrink-0"
            >
              {profile?.name?.charAt(0)?.toUpperCase() || '?'}
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {profile?.name}
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm">{profile?.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRoleColor(profile?.role)}`}>
                  {profile?.role}
                </span>
                {profile?.student_id && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    ID: {profile.student_id}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 text-sm text-green-700 dark:text-green-300">
            ✅ {success}
          </div>
        )}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
            <span>❌ {error}</span>
            <button
              onClick={loadProfile}
              className="shrink-0 px-3 py-1.5 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 rounded-lg text-xs font-medium transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === 'profile' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Personal information
              </h2>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
                >
                  ✏️ Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditing(false); setError(''); }}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
                  >
                    {saving ? 'Saving...' : '✓ Save'}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                  Full name
                </label>
                {editing ? (
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                ) : (
                  <p className="text-slate-900 dark:text-white text-sm font-medium">{profile?.name || '—'}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                  Email
                </label>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  {profile?.email}
                  <span className="ml-2 text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded-full">
                    Cannot be changed
                  </span>
                </p>
              </div>

              {/* Student ID */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                  Student ID
                </label>
                <p className="text-slate-900 dark:text-white text-sm">{profile?.student_id || '—'}</p>
              </div>

              {/* Member since */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                  Member since
                </label>
                <p className="text-slate-900 dark:text-white text-sm">
                  {profile?.created_at
                    ? new Date(profile.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })
                    : '—'}
                </p>
              </div>
            </div>

            {/* Academic info */}
            {(profile?.school || editing) && (
              <>
                <hr className="border-slate-200 dark:border-slate-700 my-6" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                  Academic information
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      School / Faculty
                    </label>
                    {editing && schools.length > 0 ? (
                      <select
                        value={editForm.school}
                        onChange={(e) => setEditForm(p => ({ ...p, school: e.target.value, degree: '', year: '' }))}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">Select school...</option>
                        {schools.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <p className="text-slate-900 dark:text-white text-sm">{profile?.school || '—'}</p>
                    )}
                  </div>

                  {(editForm.school || profile?.degree) && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                        Degree / Programme
                      </label>
                      {editing && degrees.length > 0 ? (
                        <select
                          value={editForm.degree}
                          onChange={(e) => setEditForm(p => ({ ...p, degree: e.target.value, year: '' }))}
                          className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          <option value="">Select degree...</option>
                          {degrees.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      ) : (
                        <p className="text-slate-900 dark:text-white text-sm">{profile?.degree || '—'}</p>
                      )}
                    </div>
                  )}

                  {(editForm.degree || profile?.year) && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                          Year
                        </label>
                        {editing ? (
                          <select
                            value={editForm.year}
                            onChange={(e) => setEditForm(p => ({ ...p, year: e.target.value }))}
                            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                            <option value="">Select year...</option>
                            {Array.from({ length: maxYears }, (_, i) => i + 1).map(y => (
                              <option key={y} value={y}>Year {y}</option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-slate-900 dark:text-white text-sm">
                            {profile?.year ? `Year ${profile.year}` : '—'}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                          Group
                        </label>
                        {editing ? (
                          <input
                            type="text"
                            value={editForm.study_group}
                            onChange={(e) => setEditForm(p => ({ ...p, study_group: e.target.value }))}
                            placeholder="e.g. A, B..."
                            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        ) : (
                          <p className="text-slate-900 dark:text-white text-sm">{profile?.study_group || '—'}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ── SECURITY TAB ── */}
        {activeTab === 'security' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">
              Change password
            </h2>

            {pwError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 text-sm text-red-700 dark:text-red-300">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-4 text-sm text-green-700 dark:text-green-300">
                ✅ {pwSuccess}
              </div>
            )}

            <div className="space-y-4 max-w-sm">
              {[
                { key: 'current', label: 'Current password' },
                { key: 'next', label: 'New password' },
                { key: 'confirm', label: 'Confirm new password' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {label}
                  </label>
                  <input
                    type="password"
                    value={pwForm[key]}
                    onChange={(e) => setPwForm(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              ))}

              <button
                onClick={handleChangePassword}
                disabled={pwLoading || !pwForm.current || !pwForm.next}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl transition"
              >
                {pwLoading ? 'Updating...' : '🔐 Update password'}
              </button>
            </div>

            <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                🔒 Your password is encrypted with bcrypt. VTB never stores passwords in plain text.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {activeTab === 'activity' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">
              Election activity
            </h2>

            {activity.length === 0 ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                <p className="text-4xl mb-3">🗳️</p>
                <p className="text-sm">No elections found for your account.</p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="mt-4 text-blue-500 hover:underline text-sm"
                >
                  Go to Dashboard →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activity.map(election => (
                  <div
                    key={election.id}
                    className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {election.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {election.isActive ? '🟢 Active' : '⚫ Closed'}
                        {election.has_voted && ' · ✅ Voted'}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(
                        election.isActive
                          ? `/voting/${election.id}`
                          : `/results/${election.id}`
                      )}
                      className="ml-4 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition"
                    >
                      {election.isActive ? 'Vote →' : 'Results →'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
