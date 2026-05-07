import { useState } from 'react';
import { DemoLoginModal } from './DemoLoginModal';

export function DemoModeButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 px-4 py-3 rounded-full bg-slate-950/90 border border-white/10 text-white text-sm font-bold shadow-xl hover:bg-blue-600 transition flex items-center gap-2"
      >
        🚀 Demo
      </button>
      <DemoLoginModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
