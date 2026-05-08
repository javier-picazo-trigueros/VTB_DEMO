import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CONSENT_KEY = 'vtb-cookie-consent';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    setVisible(false);
  };

  const storageItems = [
    { key: 'vtb-token', desc: 'Authentication JWT - expires in 24h', required: true },
    { key: 'vtb-role', desc: 'Your role for UI routing', required: true },
    { key: 'vtb-tour-done-{user}', desc: 'Onboarding tour completion flag per user', required: false },
    { key: 'vtb-cookie-consent', desc: 'Your consent choice (this banner)', required: false },
    { key: 'i18nextLng', desc: 'Preferred language (EN/ES)', required: false },
  ];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6"
        >
          <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🍪</span>
                  <h3 className="font-semibold text-white text-sm">We use local storage</h3>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  VTB stores your auth token and preferences in browser local storage.
                  No third-party tracking. No advertising.{' '}
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-blue-400 hover:underline"
                  >
                    {showDetails ? 'Show less' : 'Learn more'}
                  </button>
                </p>
                {showDetails && (
                  <div className="mt-3 space-y-1.5">
                    {storageItems.map(item => (
                      <div key={item.key} className="flex items-start gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${
                          item.required
                            ? 'bg-red-900/40 text-red-300'
                            : 'bg-slate-700 text-slate-400'
                        }`}>
                          {item.required ? 'Required' : 'Optional'}
                        </span>
                        <span className="text-xs">
                          <code className="text-blue-400">{item.key}</code>
                          <span className="text-slate-400 ml-1">- {item.desc}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3 sm:flex-col sm:gap-2 flex-shrink-0">
                <button
                  onClick={accept}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition whitespace-nowrap"
                >
                  Accept all
                </button>
                <button
                  onClick={decline}
                  className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm font-medium transition whitespace-nowrap"
                >
                  Decline optional
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
