import { LegalLayout, ComplianceGap, P, H2, Table } from './LegalLayout';

/*
 * Fuentes normativas consultadas (texto oficial) para redactar esta página:
 *   - Ley 34/2002 (LSSI-CE), BOE-A-2002-13758, art. 22.2: el uso de dispositivos de almacenamiento y
 *       recuperación de datos exige consentimiento informado, salvo que sea para permitir la
 *       comunicación o "estrictamente necesario" para prestar un servicio solicitado por el usuario.
 *       (La exención está en el art. 22.2, no en el 22.1.)
 *   - Guía sobre el uso de las cookies de la AEPD, edición actualizada en mayo de 2024 (aepd.es):
 *       apartado 1 (exceptuadas: entrada del usuario, autenticación de sesión, seguridad,
 *       personalización de la interfaz) y apartado 2.1.2.b (las preferencias que elige el propio
 *       usuario, como el idioma, están exentas y no tienen que ser de sesión, si se limitan a su
 *       fin); apartado 4.1 (si todas están exceptuadas no hace falta consentimiento ni información,
 *       aunque se recomienda informar al menos de forma genérica, que es lo que hace esta página).
 *   - Reglamento (UE) 2016/679, art. 13, y LO 3/2018 (LOPDGDD), art. 11, para el deber de informar.
 * El inventario sale del código: cookies en backend/src/routes/auth.ts y utils/auth.ts;
 * almacenamiento local en frontend/src. Lo vigila legal-pages.test.ts: si se añade una cookie o una
 * clave de localStorage sin listarla aquí, el test falla.
 */

export function CookiePolicy() {
  return (
    <LegalLayout title="Política de cookies" lastUpdated="Conforme al art. 22.2 de la LSSI-CE y a la guía de cookies de la AEPD (edición de mayo de 2024).">
      <P>
        No mostramos ningún aviso de cookies al llegar a VTB. No es un descuido: todo lo que usamos es, o bien
        estrictamente necesario, o bien una preferencia de interfaz que solo guardamos cuando tú la eliges — las
        categorías que el art. 22.2 de la LSSI-CE y la{' '}
        <a href="https://www.aepd.es/guias/guia-cookies.pdf" target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-300 hover:underline">
          Guía sobre el uso de las cookies de la AEPD
        </a>{' '}
        (edición de mayo de 2024) exceptúan del consentimiento. Esta página existe igualmente porque la guía
        recomienda informar, al menos de forma genérica, también de las exceptuadas.
      </P>

      <H2>Cookies que pone el servidor (estrictamente necesarias)</H2>
      <P>
        Son cookies propias, del mismo dominio que la aplicación (el servidor de la API se publica bajo{' '}
        <code>/backend</code>). Todas llevan <code>SameSite=Lax</code> y <code>Secure</code> en producción.
      </P>
      <Table
        head={['Nombre', 'Tipo', 'Duración', 'Finalidad']}
        rows={[
          ['vtb_auth', 'Cookie httpOnly', '15 minutos', 'Mantener la sesión iniciada'],
          ['vtb_refresh', 'Cookie httpOnly', '7 días', 'Renovar la sesión sin volver a iniciar sesión'],
          ['vtb_csrf', 'Cookie legible por la página (no httpOnly)', '15 minutos', 'Protección contra falsificación de peticiones (seguridad)'],
        ]}
      />
      <P>
        Se crean al iniciar sesión y se borran al cerrarla. Bloquearlas te impedirá iniciar sesión.
      </P>

      <H2>Almacenamiento local del navegador</H2>
      <P>
        Estas claves se guardan en tu navegador (<code>localStorage</code>) y no se envían a nuestro servidor.
        Solo se escriben cuando tú usas el control correspondiente: si nunca lo tocas, no se guarda nada, y la
        página recalcula el idioma y el tema por defecto en cada visita.
      </P>
      <Table
        head={['Nombre', 'Se guarda cuando…', 'Finalidad']}
        rows={[
          ['i18nextLng', 'Eliges un idioma en el selector', 'Recordar esa elección en tu próxima visita'],
          ['vtb-theme', 'Pulsas el interruptor de modo claro/oscuro', 'Recordar esa elección en tu próxima visita'],
        ]}
      />

      <H2>Recursos de terceros que tu navegador carga</H2>
      <P>
        Las tipografías, los estilos y los scripts se sirven desde el mismo dominio que la aplicación: tu
        navegador no pide nada a terceros al cargar la página.
      </P>
      <P>
        <b>Nodo de Ethereum.</b> En la cabina de votación, si el despliegue lo configura, tu navegador se conecta al
        nodo público para mostrar los votos en vivo; el nodo recibe tu IP, sin cookies.
      </P>

      <H2>No usamos</H2>
      <P>
        Ninguna cookie ni script de analítica, publicidad o seguimiento de terceros (Google Analytics, Meta Pixel
        u otros). La aplicación no incluye ninguna herramienta de ese tipo. Por eso no necesitamos pedirte permiso
        para nada de lo de arriba.
      </P>

      <H2>Cómo gestionarlas</H2>
      <P>
        Puedes borrar en cualquier momento <code>i18nextLng</code> o <code>vtb-theme</code> desde los ajustes de
        almacenamiento de tu navegador, sin ningún efecto sobre tu sesión. Bloquear las cookies necesarias, en
        cambio, te impedirá iniciar sesión.
      </P>
    </LegalLayout>
  );
}
