import { useEffect, useState } from 'react';
import { api } from './apiClient.js';

/**
 * ¿Está activo el acceso de demostración en el backend? (GET /auth/config)
 *
 * Empieza en false y se queda en false si la consulta falla: un botón que da
 * error es peor que un botón que no aparece. La respuesta se comparte entre
 * componentes para no repetir la petición.
 */
let consulta = null;

export function useDemoEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let vivo = true;
    consulta ??= api
      .get('/auth/config')
      .then((res) => res.data?.demoLoginEnabled === true)
      .catch(() => {
        consulta = null; // reintentar en el siguiente montaje
        return false;
      });
    consulta.then((v) => vivo && setEnabled(v));
    return () => { vivo = false; };
  }, []);

  return enabled;
}
