import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';

/**
 * NotFound — página 404.
 * Se muestra para cualquier ruta que no coincide con las definidas en App.jsx.
 */
export const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-warm-50">
      <Navbar />
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-lg flex-col items-center justify-center px-4 text-center">
        <p className="font-mono-vtb text-sm text-slate-400 tabular">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Página no encontrada</h1>
        <p className="mt-2 text-sm text-slate-500 max-w-sm">
          La dirección no corresponde a ninguna página de VTB. Puede que el enlace esté roto o que la página se haya movido.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 rounded bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors"
          >
            Ir al panel
          </button>
          <button
            onClick={() => navigate('/landing')}
            className="px-4 py-2 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
