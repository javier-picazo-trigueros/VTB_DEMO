import { useState } from 'react';
import { DemoLoginModal } from './DemoLoginModal';
import { useDemoEnabled } from '../utils/useDemoEnabled.js';

export function DemoModeButton() {
  const [open, setOpen] = useState(false);
  const demoEnabled = useDemoEnabled();

  if (!demoEnabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 px-4 py-3 rounded-full bg-slate-950/90 border border-white/10 text-white text-sm font-bold shadow-xl hover:bg-brand-600 transition flex items-center gap-2"
      >
        Demo
      </button>
      <DemoLoginModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
