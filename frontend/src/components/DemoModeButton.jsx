import { useNavigate } from 'react-router-dom';

export function DemoModeButton() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate('/login')}
      className="fixed bottom-5 right-5 z-40 px-4 py-3 rounded-full bg-slate-950/90 border border-white/10 text-white text-sm font-bold shadow-xl hover:bg-blue-600 transition"
    >
      Demo mode
    </button>
  );
}
