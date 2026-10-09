import { useEffect, useState } from 'react';

/**
 * Segundos Unix actuales, refrescados cada `intervalMs`. Para pintar estados que
 * dependen de la hora (activa / próxima / cerrada, "hace 5 s") sin llamar a
 * Date.now() durante el render, que no es puro.
 */
export function useNowSeconds(intervalMs = 30000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
