import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const DEMO_ACCOUNTS = {
  student: {
    email: 'student@vtb.demo',
    password: 'demo123',
    label: 'Votante',
    sublabel: 'Meridian University',
    color: 'brand',
    description: 'Vota como estudiante. Tienes acceso a las elecciones activas y puedes consultar resultados en tiempo real con respaldo en blockchain.',
    features: ['Emitir tu voto', 'Ver resultados en directo', 'Registro auditable en blockchain', 'Perfil personal'],
  },
  admin: {
    email: 'admin@vtb.demo',
    password: 'admin123',
    label: 'Administrador',
    sublabel: 'Meridian University',
    color: 'emerald',
    description: 'Gestiona elecciones como administrador. Crea procesos electorales, aprueba solicitudes de registro y supervisa la participación de tu institución.',
    features: ['Crear y gestionar elecciones', 'Aprobar solicitudes de registro', 'Ver estadísticas de participación', 'Exportar registros de auditoría'],
  },
};

export function DemoLoginModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');

  const handleDemoLogin = async (type) => {
    const account = DEMO_ACCOUNTS[type];
    setLoading(type);
    setError('');
    try {
      const ok = await login(account.email, account.password);
      if (ok) {
        onClose();
        navigate(type === 'admin' ? '/admin' : '/dashboard');
      } else {
        setError('No se ha podido iniciar sesión con la cuenta demo. Comprueba que el backend esté activo.');
      }
    } catch {
      setError('No se ha podido conectar con el backend. Comprueba que esté en ejecución.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50"
          />
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-2xl bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-warm-200 dark:border-slate-700 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-brand-600 px-8 py-6 text-white relative">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors text-white text-lg"
                aria-label="Cerrar"
              >
                ×
              </button>
              <p className="text-brand-100 text-xs font-semibold uppercase tracking-wider mb-1.5">Demo en vivo</p>
              <h2 className="text-xl font-semibold mb-1">Prueba VTB ahora</h2>
              <p className="text-brand-100 text-sm">
                Un clic, sin registro. Elecciones reales sobre Ethereum Sepolia.
              </p>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-4 p-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                {Object.entries(DEMO_ACCOUNTS).map(([type, account]) => (
                  <div
                    key={type}
                    className={`rounded border p-5 flex flex-col ${
                      type === 'student'
                        ? 'border-brand-200 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-900/10'
                        : 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/10'
                    }`}
                  >
                    <h3 className="font-semibold text-slate-900 dark:text-white text-base mb-0.5">{account.label}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{account.sublabel}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed flex-1">
                      {account.description}
                    </p>
                    <ul className="space-y-1 mb-5">
                      {account.features.map(f => (
                        <li key={f} className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <svg className={`w-3 h-3 flex-shrink-0 ${type === 'student' ? 'text-brand-600' : 'text-emerald-600'}`} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="text-xs text-slate-400 dark:text-slate-500 font-mono-vtb mb-3 bg-slate-50 dark:bg-slate-900 rounded px-3 py-2 tabular">
                      {account.email} / {account.password}
                    </div>
                    <button
                      onClick={() => handleDemoLogin(type)}
                      disabled={loading !== null}
                      className={`w-full py-2.5 rounded font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
                        type === 'student'
                          ? 'bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60'
                          : 'bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60'
                      }`}
                    >
                      {loading === type ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Entrando…
                        </>
                      ) : (
                        `Entrar como ${account.label} →`
                      )}
                    </button>
                  </div>
                ))}
              </div>

              <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
                Los datos de demostración se reinician periódicamente · Los votos son transacciones reales en Ethereum Sepolia
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
