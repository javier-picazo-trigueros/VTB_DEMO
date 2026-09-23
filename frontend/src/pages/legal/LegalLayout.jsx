import { Link } from 'react-router-dom';
import { Navbar } from '../../components/Navbar';

const LEGAL_LINKS = [
  { to: '/legal/privacidad', label: 'Política de privacidad' },
  { to: '/legal/aviso-legal', label: 'Aviso legal' },
  { to: '/legal/terminos', label: 'Términos y condiciones' },
  { to: '/legal/cookies', label: 'Política de cookies' },
  { to: '/legal/accesibilidad', label: 'Declaración de accesibilidad' },
];

/** Resalta [RELLENAR: ...] dentro de un texto para que se note que es un hueco real. */
export function Fill({ children }) {
  return (
    <span className="inline-block bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 rounded px-1.5 py-0.5 font-mono text-[0.85em] font-medium">
      {children}
    </span>
  );
}

/** Caja de "esto es un hueco de cumplimiento real, no solo de redacción". */
export function ComplianceGap({ children }) {
  return (
    <div className="border-l-4 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 rounded-r-lg px-4 py-3 text-sm my-4">
      <b className="font-semibold">Hueco de cumplimiento: </b>
      {children}
    </div>
  );
}

// Sin @tailwindcss/typography instalado: helpers con clases explícitas en vez
// de una clase `prose` que no existe en este proyecto.
export function H2({ children }) {
  return <h2 className="text-xl font-semibold text-slate-900 dark:text-white mt-9 mb-3">{children}</h2>;
}
export function H3({ children }) {
  return <h3 className="text-base font-semibold text-blue-700 dark:text-blue-400 mt-6 mb-2">{children}</h3>;
}
export function P({ children, className = '' }) {
  return <p className={`text-slate-700 dark:text-slate-300 leading-relaxed mb-3.5 ${className}`}>{children}</p>;
}
export function Ul({ children }) {
  return <ul className="list-disc pl-6 space-y-2 text-slate-700 dark:text-slate-300 mb-4">{children}</ul>;
}
export function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto mb-4 -mx-1">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-700 py-2 px-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="align-top text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 py-2.5 px-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegalLayout({ title, lastUpdated, children }) {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-900">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        <div className="flex items-start gap-3 mb-6 border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-5 py-4">
          <span className="text-lg" aria-hidden="true">⚠️</span>
          <div className="text-sm text-amber-900 dark:text-amber-200">
            <p className="font-semibold">Borrador — pendiente de revisión legal.</p>
            <p>
              Este texto todavía no ha sido revisado por un abogado. Los huecos marcados{' '}
              <Fill>[RELLENAR]</Fill> son datos identificativos reales que faltan, no un error de maquetación.
            </p>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{title}</h1>
        {lastUpdated && (
          <p className="text-sm text-slate-400 dark:text-slate-500 mb-8">{lastUpdated}</p>
        )}

        <article className="max-w-none">
          {children}
        </article>

        <nav className="mt-12 pt-6 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">
            Otros documentos legales
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {LEGAL_LINKS.map(link => (
              <Link key={link.to} to={link.to} className="text-blue-600 dark:text-blue-400 hover:underline">
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </main>
    </div>
  );
}
