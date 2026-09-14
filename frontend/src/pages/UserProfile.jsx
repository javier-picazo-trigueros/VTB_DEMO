import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { clearAuthAndRedirect } from '../utils/auth';
import toast from 'react-hot-toast';
import { api } from '../utils/apiClient';

export function UserProfile() {
  const navigate = useNavigate();
  const { setAuthUser } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState(null);
  const [schoolsData, setSchoolsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');

  const [activity, setActivity] = useState([]);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/auth/me/profile');
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
          const schoolRes = await api.get(`/api/schools-degrees?domain=${domain}`);
          setSchoolsData(schoolRes.data.schools_degrees || []);
        } catch {
          // ignore — domain may not have schools configured
        }
      }

      try {
        const actRes = await api.get('/api/elections');
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
        setError('El backend se está reactivando — espera unos segundos y vuelve a intentarlo.');
      } else {
        setError(err.response?.data?.error || err.message || 'No se ha podido cargar el perfil.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.patch('/auth/me/profile', editForm);
      setProfile(res.data.user);
      // Update the in-memory user object (no localStorage)
      if (setAuthUser && res.data.user.name) {
        setAuthUser(prev => ({ ...prev, name: res.data.user.name }));
      }
      setEditing(false);
      toast.success('Perfil actualizado correctamente');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se ha podido guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (pwForm.next !== pwForm.confirm) {
      setPwError('Las contraseñas nuevas no coinciden.');
      return;
    }
    if (pwForm.next.length < 6) {
      setPwError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setPwLoading(true);
    setPwError('');
    try {
      await api.patch('/auth/change-password', {
        currentPassword: pwForm.current,
        newPassword: pwForm.next,
      });
      toast.success('Contraseña actualizada correctamente');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPwError(err.response?.data?.error || 'No se ha podido cambiar la contraseña.');
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
    if (role === 'superadmin') return 'bg-purple-100 text-purple-700';
    if (role === 'admin') return 'bg-emerald-100 text-emerald-700';
    return 'bg-brand-50 text-brand-700';
  };

  const tabs = [
    { id: 'profile', label: 'Perfil' },
    { id: 'security', label: 'Seguridad' },
    { id: 'activity', label: 'Actividad' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-50 flex flex-col items-center justify-center gap-4">
        <div className="w-6 h-6 border-2 border-warm-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Cargando perfil…</p>
        <button
          onClick={() => navigate(-1)}
          className="text-slate-400 hover:text-slate-600 text-sm underline"
        >
          ← Volver
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Header */}
      <div className="bg-white border-b border-warm-200">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <button
            onClick={() => navigate(-1)}
            className="text-slate-500 hover:text-slate-700 text-sm mb-4 flex items-center gap-1"
          >
            ← Volver
          </button>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-brand-600 flex items-center justify-center text-white text-xl font-semibold flex-shrink-0">
              {profile?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                {profile?.name}
              </h1>
              <p className="text-slate-500 text-sm">{profile?.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${getRoleColor(profile?.role)}`}>
                  {profile?.role}
                </span>
                {profile?.student_id && (
                  <span className="text-xs text-slate-400 tabular">
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
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
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

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-4 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              onClick={loadProfile}
              className="shrink-0 px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded text-xs font-medium transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === 'profile' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg shadow-sm border border-warm-200 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-slate-900">
                Información personal
              </h2>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded text-sm font-medium transition-colors"
                >
                  Editar
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditing(false); setError(''); }}
                    className="px-4 py-2 border border-slate-200 text-slate-700 rounded text-sm transition-colors hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
                  >
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                  Nombre completo
                </label>
                {editing ? (
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                ) : (
                  <p className="text-slate-900 text-sm font-medium">{profile?.name || '—'}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                  Email
                </label>
                <p className="text-slate-500 text-sm">
                  {profile?.email}
                  <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                    No se puede modificar
                  </span>
                </p>
              </div>

              {/* Student ID */}
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                  Identificador
                </label>
                <p className="text-slate-900 text-sm tabular">{profile?.student_id || '—'}</p>
              </div>

              {/* Member since */}
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                  Miembro desde
                </label>
                <p className="text-slate-900 text-sm">
                  {profile?.created_at
                    ? new Date(profile.created_at).toLocaleDateString('es-ES', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })
                    : '—'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                  Guía de bienvenida
                </label>
                <button
                  onClick={() => {
                    try {
                      const stored = localStorage.getItem('vtb-user');
                      const user = stored ? JSON.parse(stored) : null;
                      const ids = [
                        user?.id,
                        user?.email,
                        localStorage.getItem('vtb-user-id'),
                        localStorage.getItem('vtb-email'),
                      ].filter(Boolean);
                      ids.forEach((id) => localStorage.removeItem(`vtb-tour-done-${id}`));
                    } catch { /* ignore */ }
                    navigate('/dashboard');
                  }}
                  className="text-sm text-brand-600 hover:underline"
                >
                  Reiniciar guía de bienvenida
                </button>
              </div>
            </div>

            {/* Academic info */}
            {(profile?.school || editing) && (
              <>
                <hr className="border-warm-200 my-6" />
                <h3 className="text-sm font-semibold text-slate-900 mb-4">
                  Información académica
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                      Facultad / Escuela
                    </label>
                    {editing && schools.length > 0 ? (
                      <select
                        value={editForm.school}
                        onChange={(e) => setEditForm(p => ({ ...p, school: e.target.value, degree: '', year: '' }))}
                        className="w-full px-4 py-2.5 rounded border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                      >
                        <option value="">Selecciona una facultad…</option>
                        {schools.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <p className="text-slate-900 text-sm">{profile?.school || '—'}</p>
                    )}
                  </div>

                  {(editForm.school || profile?.degree) && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                        Titulación
                      </label>
                      {editing && degrees.length > 0 ? (
                        <select
                          value={editForm.degree}
                          onChange={(e) => setEditForm(p => ({ ...p, degree: e.target.value, year: '' }))}
                          className="w-full px-4 py-2.5 rounded border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                        >
                          <option value="">Selecciona una titulación…</option>
                          {degrees.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      ) : (
                        <p className="text-slate-900 text-sm">{profile?.degree || '—'}</p>
                      )}
                    </div>
                  )}

                  {(editForm.degree || profile?.year) && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                          Curso
                        </label>
                        {editing ? (
                          <select
                            value={editForm.year}
                            onChange={(e) => setEditForm(p => ({ ...p, year: e.target.value }))}
                            className="w-full px-4 py-2.5 rounded border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                          >
                            <option value="">Selecciona un curso…</option>
                            {Array.from({ length: maxYears }, (_, i) => i + 1).map(y => (
                              <option key={y} value={y}>{y}º curso</option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-slate-900 text-sm">
                            {profile?.year ? `${profile.year}º curso` : '—'}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                          Grupo
                        </label>
                        {editing ? (
                          <input
                            type="text"
                            value={editForm.study_group}
                            onChange={(e) => setEditForm(p => ({ ...p, study_group: e.target.value }))}
                            placeholder="p. ej. A, B…"
                            className="w-full px-4 py-2.5 rounded border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                          />
                        ) : (
                          <p className="text-slate-900 text-sm">{profile?.study_group || '—'}</p>
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
            className="bg-white rounded-lg shadow-sm border border-warm-200 p-6"
          >
            <h2 className="text-base font-semibold text-slate-900 mb-6">
              Cambiar contraseña
            </h2>

            {pwError && (
              <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-700">
                {pwError}
              </div>
            )}
            <div className="space-y-4 max-w-sm">
              {[
                { key: 'current', label: 'Contraseña actual' },
                { key: 'next', label: 'Contraseña nueva' },
                { key: 'confirm', label: 'Confirmar contraseña nueva' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {label}
                  </label>
                  <input
                    type="password"
                    value={pwForm[key]}
                    onChange={(e) => setPwForm(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                </div>
              ))}

              <button
                onClick={handleChangePassword}
                disabled={pwLoading || !pwForm.current || !pwForm.next}
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded transition-colors"
              >
                {pwLoading ? 'Actualizando…' : 'Actualizar contraseña'}
              </button>
            </div>

            <div className="mt-6 p-4 bg-slate-50 rounded">
              <p className="text-xs text-slate-500">
                Tu contraseña se cifra con bcrypt. VTB nunca almacena contraseñas en texto plano.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {activeTab === 'activity' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg shadow-sm border border-warm-200 p-6"
          >
            <h2 className="text-base font-semibold text-slate-900 mb-6">
              Actividad electoral
            </h2>

            {activity.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <svg className="w-8 h-8 mx-auto mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                </svg>
                <p className="text-sm">No hay elecciones asociadas a tu cuenta.</p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="mt-4 text-brand-600 hover:underline text-sm"
                >
                  Ir al panel →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activity.map(election => (
                  <div
                    key={election.id}
                    className="flex items-center justify-between p-4 rounded border border-warm-200 hover:bg-warm-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {election.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${election.isActive ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                        {election.isActive ? 'Activa' : 'Cerrada'}
                        {election.has_voted && ' · Ya has votado'}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(
                        election.isActive
                          ? `/voting/${election.id}`
                          : `/results/${election.id}`
                      )}
                      className="ml-4 px-3 py-1.5 text-xs font-medium rounded bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
                    >
                      {election.isActive ? 'Votar →' : 'Resultados →'}
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
