import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export const CONSENT_KEY = 'vtb-cookie-consent';

/** true si el usuario rechazó el almacenamiento opcional. */
export function optionalStorageDeclined() {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'declined';
  } catch {
    return false;
  }
}

export function CookieBanner() {
  const { t } = useTranslation();
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
    // Limpia lo opcional que ya estuviera guardado, para que "rechazar"
    // signifique algo. Lo necesario (sesión, idioma) no se toca.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('vtb-tour-done-'))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* almacenamiento no disponible */ }
    setVisible(false);
  };

  const storageItems = [
    { key: 'vtb_auth (httpOnly cookie)',    desc: t('cookies.items.auth'),    required: true },
    { key: 'vtb_refresh (httpOnly cookie)', desc: t('cookies.items.refresh'), required: true },
    { key: 'vtb_csrf (cookie)',             desc: t('cookies.items.csrf'),    required: true },
    { key: 'vtb-tour-done-{user}',          desc: t('cookies.items.tour'),    required: false },
    { key: 'vtb-cookie-consent',            desc: t('cookies.items.consent'), required: false },
    { key: 'i18nextLng',                    desc: t('cookies.items.lang'),    required: false },
  ];

  // La franja ocupa todo el ancho de la pantalla (fixed inset-x-0), así que sin
  // `pointer-events-none` capturaba los clics también en las zonas vacías a los
  // lados de la tarjeta. Eso dejaba inaccesible el botón flotante de demo
  // (DemoModeButton, esquina inferior derecha), que cae justo debajo: el banner
  // está en z-50 y el botón en z-40. La tarjeta recupera los eventos con
  // `pointer-events-auto` para que sus propios botones sigan funcionando.
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6 pointer-events-none"
          role="region"
          aria-label={t('cookies.ariaLabel')}
        >
          <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 sm:p-6 pointer-events-auto">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg" aria-hidden="true">🍪</span>
                  <h3 className="font-semibold text-white text-sm">{t('cookies.title')}</h3>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  {t('cookies.body')}{' '}
                  <button
                    type="button"
                    onClick={() => setShowDetails(!showDetails)}
                    aria-expanded={showDetails}
                    aria-controls="cookie-storage-details"
                    className="text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded"
                  >
                    {showDetails ? t('cookies.showLess') : t('cookies.learnMore')}
                  </button>
                </p>
                {showDetails && (
                  <div id="cookie-storage-details" className="mt-3 space-y-1.5">
                    {storageItems.map(item => (
                      <div key={item.key} className="flex items-start gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${
                          item.required
                            ? 'bg-red-900/40 text-red-300'
                            : 'bg-slate-700 text-slate-400'
                        }`}>
                          {item.required ? t('cookies.required') : t('cookies.optional')}
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
                  type="button"
                  onClick={accept}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                >
                  {t('cookies.acceptAll')}
                </button>
                <button
                  type="button"
                  onClick={decline}
                  className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm font-medium transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                >
                  {t('cookies.declineOptional')}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
