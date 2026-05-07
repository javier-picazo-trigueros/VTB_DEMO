import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const DEMO_ACCOUNTS = {
  student: {
    email: 'student@vtb.demo',
    password: 'demo123',
    label: 'Demo Student',
    sublabel: 'VTB Demo Sandbox',
    icon: '🎓',
    color: 'blue',
    description: 'Experience voting as a student. You have access to active elections, can cast anonymous votes, and view real-time blockchain results.',
    features: ['Cast anonymous votes', 'View live results', 'Blockchain audit trail', 'Personal profile'],
  },
  admin: {
    email: 'admin@vtb.demo',
    password: 'admin123',
    label: 'Demo Admin',
    sublabel: 'VTB Demo Sandbox',
    icon: '⚙️',
    color: 'emerald',
    description: 'Manage elections as an administrator. Create elections, approve registrations, and monitor participation across your institution.',
    features: ['Create & manage elections', 'Approve registrations', 'View participation stats', 'Export audit logs'],
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
        setError('Demo login failed. Please check the backend is running.');
      }
    } catch {
      setError('Could not reach the backend. Make sure it is running.');
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-6 text-white">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition text-white text-lg"
              >
                ×
              </button>
              <p className="text-blue-200 text-sm font-medium mb-1">🚀 Live Demo</p>
              <h2 className="text-2xl font-bold mb-1">Try VTB right now</h2>
              <p className="text-blue-100 text-sm">
                One click — no registration needed. Real blockchain, real elections.
              </p>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                {Object.entries(DEMO_ACCOUNTS).map(([type, account]) => (
                  <div
                    key={type}
                    className={`rounded-2xl border-2 p-5 flex flex-col ${
                      type === 'student'
                        ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
                    }`}
                  >
                    <div className="text-3xl mb-2">{account.icon}</div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-lg mb-0.5">{account.label}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{account.sublabel}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed flex-1">
                      {account.description}
                    </p>
                    <ul className="space-y-1 mb-5">
                      {account.features.map(f => (
                        <li key={f} className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <span className={type === 'student' ? 'text-blue-500' : 'text-emerald-500'}>✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="text-xs text-slate-400 dark:text-slate-500 font-mono mb-3 bg-white dark:bg-slate-900 rounded-lg px-3 py-2">
                      {account.email} / {account.password}
                    </div>
                    <button
                      onClick={() => handleDemoLogin(type)}
                      disabled={loading !== null}
                      className={`w-full py-2.5 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 ${
                        type === 'student'
                          ? 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60'
                      }`}
                    >
                      {loading === type ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        `Enter as ${account.label} →`
                      )}
                    </button>
                  </div>
                ))}
              </div>

              <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
                Demo data resets periodically · All votes are real blockchain transactions on Ethereum Sepolia
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
