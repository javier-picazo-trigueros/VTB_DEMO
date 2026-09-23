import { LegalLayout, P, H2, Table } from './LegalLayout';

export function CookiePolicy() {
  return (
    <LegalLayout title="Política de cookies">
      <P>
        No mostramos ningún aviso de cookies al llegar a VTB. No es un descuido: todo lo que usamos es, o bien
        estrictamente necesario, o bien algo que solo guardamos cuando tú lo pides de forma activa — las dos
        categorías que la{' '}
        <a href="https://www.aepd.es/guias/guia-cookies.pdf" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
          guía de cookies de la AEPD
        </a>{' '}
        exime de pedir consentimiento (art. 22.1 LSSI-CE). No hay nada que aceptar ni rechazar.
      </P>

      <H2>Estrictamente necesarias</H2>
      <Table
        head={['Nombre', 'Tipo', 'Duración', 'Finalidad']}
        rows={[
          ['vtb_auth', 'Cookie httpOnly', '15 minutos', 'Mantener la sesión iniciada'],
          ['vtb_refresh', 'Cookie httpOnly', '7 días', 'Renovar la sesión sin volver a iniciar sesión'],
          ['vtb_csrf', 'Cookie', 'Igual que la sesión que acompaña', 'Protección contra falsificación de peticiones (seguridad)'],
        ]}
      />

      <H2>Personalización que tú pides — exenta por cómo se guarda, no por su contenido</H2>
      <P>
        Estas solo se escriben cuando interactúas explícitamente con el control correspondiente (el selector de
        idioma, el interruptor de tema, cerrar la guía de bienvenida). Si nunca los tocas, no se guarda nada: la
        página recalcula el idioma y el tema por defecto en cada visita sin dejar rastro.
      </P>
      <Table
        head={['Nombre', 'Tipo', 'Se guarda cuando…', 'Finalidad']}
        rows={[
          ['i18nextLng', 'Almacenamiento local', 'Eliges un idioma en el selector', 'Recordar esa elección en tu próxima visita'],
          ['vtb-theme', 'Almacenamiento local', 'Pulsas el interruptor de modo claro/oscuro', 'Recordar esa elección en tu próxima visita'],
          ['vtb-tour-done-{usuario}', 'Almacenamiento local', 'Terminas o cierras la guía de bienvenida', 'No repetírtela'],
        ]}
      />

      <H2>No usamos</H2>
      <P>
        Ninguna cookie ni script de analítica, publicidad o seguimiento de terceros (Google Analytics, Meta Pixel
        u otros). No hay nada que rastrear entre sitios, y por eso no necesitamos pedirte permiso para nada de lo
        de arriba.
      </P>

      <H2>Cómo gestionarlas</H2>
      <P>
        Puedes borrar en cualquier momento <code>i18nextLng</code>, <code>vtb-theme</code> o{' '}
        <code>vtb-tour-done-{'{usuario}'}</code> desde los ajustes de almacenamiento de tu navegador — sin ningún
        efecto sobre tu sesión. Bloquear las cookies necesarias, en cambio, te impedirá iniciar sesión.
      </P>
    </LegalLayout>
  );
}
