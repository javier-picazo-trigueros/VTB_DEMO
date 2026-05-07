import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Navbar } from '../components/Navbar';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function Transparency() {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/audit/public`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('audit failed')))
      .then(data => setTransactions(data.transactions || []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-white transition-colors duration-300">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <p className="text-blue-600 dark:text-blue-300 text-sm font-bold mb-3">
            🔗 {t('transparency.badge')}
          </p>
          <h1 className="text-4xl sm:text-5xl font-black mb-4 text-slate-900 dark:text-white">
            {t('transparency.title')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl">
            {t('transparency.subtitle')}
          </p>
        </motion.div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 dark:text-white">{t('transparency.tableTitle')}</h2>
            <span className="text-xs text-slate-400 dark:text-slate-500">Ethereum Sepolia</span>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-14 rounded-xl bg-slate-200 dark:bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-10 text-center text-slate-500 dark:text-slate-500">
              {t('transparency.empty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">{t('transparency.colElection')}</th>
                    <th className="text-left px-5 py-3 font-medium">{t('transparency.colNullifier')}</th>
                    <th className="text-left px-5 py-3 font-medium">{t('transparency.colTxHash')}</th>
                    <th className="text-left px-5 py-3 font-medium">{t('transparency.colRecorded')}</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, index) => (
                    <tr
                      key={`${tx.tx_hash || tx.nullifier_display}-${index}`}
                      className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-5 py-4 text-slate-800 dark:text-slate-200">{tx.election_name}</td>
                      <td className="px-5 py-4 font-mono text-xs text-blue-600 dark:text-blue-300">{tx.nullifier_display}</td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {tx.tx_hash || <span className="italic text-slate-400 dark:text-slate-600">{t('transparency.pending')}</span>}
                      </td>
                      <td className="px-5 py-4 text-slate-500 dark:text-slate-400">
                        {tx.generated_at ? new Date(tx.generated_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Transparency;
