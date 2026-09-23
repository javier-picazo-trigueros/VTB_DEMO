import { Link } from 'react-router-dom';

/**
 * Pie de página global. Los cinco enlaces legales son textos en borrador
 * (ver cada página, todas marcadas "pendiente de revisión legal") — existen
 * para que el registro pueda enlazarlos y para que un abogado tenga algo
 * concreto que revisar, no porque ya sean definitivos.
 */
export function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-400 dark:text-slate-600">
            © {new Date().getFullYear()} VTB · Vote Through Blockchain
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Link to="/legal/privacidad" className="hover:text-slate-700 dark:hover:text-slate-200 hover:underline">
              Privacidad
            </Link>
            <Link to="/legal/aviso-legal" className="hover:text-slate-700 dark:hover:text-slate-200 hover:underline">
              Aviso legal
            </Link>
            <Link to="/legal/terminos" className="hover:text-slate-700 dark:hover:text-slate-200 hover:underline">
              Términos
            </Link>
            <Link to="/legal/cookies" className="hover:text-slate-700 dark:hover:text-slate-200 hover:underline">
              Cookies
            </Link>
            <Link to="/legal/accesibilidad" className="hover:text-slate-700 dark:hover:text-slate-200 hover:underline">
              Accesibilidad
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
