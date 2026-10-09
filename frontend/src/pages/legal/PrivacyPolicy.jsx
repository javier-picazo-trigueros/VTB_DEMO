import { Link } from 'react-router-dom';
import { LegalLayout, Fill, ComplianceGap, H2, H3, P, Ul, Table } from './LegalLayout';

/*
 * Fuentes normativas consultadas (texto oficial) para redactar esta página:
 *   - Reglamento (UE) 2016/679 (RGPD), arts. 6, 9, 13, 28, 30 y 35 (DOUE L 119, 4.5.2016):
 *       art. 6.1  bases de licitud; art. 9.1  categorías especiales (opiniones políticas,
 *       afiliación sindical); art. 12.3  respuesta en un mes; art. 13.1 y 13.2  información que
 *       debe darse al recoger los datos; art. 28.3  contrato con el encargado; art. 30  registro
 *       de actividades (ver REGISTRO_TRATAMIENTOS.md); art. 35  evaluación de impacto (ver EIPD.md).
 *   - Ley Orgánica 3/2018 (LO 3/2018, LOPDGDD), BOE-A-2018-16673, arts. 11 (información por capas)
 *       y 12 (ejercicio de derechos).
 *   - Ley 34/2002 (LSSI-CE), art. 22.2 (cookies); detalle en la Política de Cookies.
 * Si el código y esta página discrepan, manda el código: lo vigila legal-pages.test.ts.
 * Los DPA y la región de cada proveedor se comprobaron en su web el 9 de octubre de 2026;
 * los enlaces están en la sección 3 y conviene reverificarlos antes de publicar.
 */

const LINK = 'text-brand-600 dark:text-brand-300 hover:underline';

function Ext({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>{children}</a>;
}

export function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Política de privacidad"
      lastUpdated="Conforme al RGPD (Reglamento UE 2016/679) y a la LOPDGDD (LO 3/2018)."
    >
      <H2>0. Dos responsables distintos según qué uses</H2>
      <P>
        VTB (Vote Through Blockchain) es una plataforma que unas instituciones usan para gestionar sus propias
        votaciones. Quién decide qué se hace con tus datos personales depende de por dónde has llegado a esta página:
      </P>
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/40">
          <H3>A) Web pública y registro abierto</H3>
          <P className="mb-0">
            Si visitas la web o te autorregistras sin que una institución te haya dado de alta,{' '}
            <b>somos responsables del tratamiento</b>: <Fill>[RELLENAR: razón social / nombre]</Fill>,
            NIF <Fill>[RELLENAR: NIF]</Fill>, domicilio <Fill>[RELLENAR: dirección postal]</Fill>, contacto{' '}
            <Fill>[RELLENAR: email de contacto]</Fill>. Delegado de protección de datos:{' '}
            <Fill>[RELLENAR: delegado de protección de datos, o indicar que no hay y por qué]</Fill>.
          </P>
        </div>
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/40">
          <H3>B) Votación de una institución</H3>
          <P className="mb-0">
            Si votas en una elección convocada por tu universidad u organización, <b>la institución es la
            responsable</b> del tratamiento de tu censo y tu voto; nosotros actuamos como <b>encargados del
            tratamiento</b> (art. 28 RGPD) — contrato pendiente de formalizar con cada institución. Para ejercer
            tus derechos sobre estos datos, dirígete primero a tu institución: <Fill>[RELLENAR: entidad responsable
            y su delegado de protección de datos, por institución]</Fill>.
          </P>
        </div>
      </div>

      <H2>1. Qué datos tratamos, de dónde salen, para qué y con qué base jurídica</H2>
      <P>
        La base jurídica es la del art. 6.1 del RGPD. En el caso B la fija la institución responsable, no
        nosotros; la columna indica la que proponemos para el caso A y la que habrá que confirmar en cada contrato.
      </P>
      <Table
        head={['Datos', 'De dónde salen', 'Finalidad', 'Base jurídica']}
        rows={[
          ['Nombre, email, identificador de estudiante, escuela, titulación, año, grupo', 'Los aportas al autorregistrarte, o los importa el administrador de tu institución por CSV', 'Crear y gestionar la cuenta; verificar que puedes votar en una elección concreta', 'Caso A: art. 6.1.b (prestarte el servicio que pides). Caso B: la de la institución (art. 6.1.e si es un organismo público; si no, 6.1.b o 6.1.f)'],
          ['Contraseña (solo su hash)', 'La eliges tú, o el sistema genera una temporal si el alta la hace un administrador (con cambio obligatorio en el primer acceso)', 'Autenticación', 'Art. 6.1.b'],
          ['Versión de estos textos que aceptaste y cuándo (solo si te registras tú)', 'Se genera al registrarte', 'Poder demostrar qué texto se aceptó', 'Art. 6.1.f (acreditar el cumplimiento)'],
          ['Que has participado en una elección (tu cuenta y la elección, sin fecha ni hora)', 'Se genera al votar', 'Saber que ya has votado, impedir el doble voto y calcular la participación (ver sección 4)', 'La de la votación (caso B) o art. 6.1.b (caso A)'],
          ['Tu voto: candidato, testigo único y transacción, sin tu cuenta y con la hora solo al minuto', 'Se genera al votar', 'Registrar y contar el voto (ver sección 4)', 'La de la votación (caso B) o art. 6.1.b (caso A)'],
          ['Mientras un voto está pendiente de confirmar: tu cuenta y su testigo único', 'Se genera al votar', 'Confirmar el voto si la red tarda; se borra al confirmarse o caduca (sección 6)', 'Art. 6.1.b'],
          ['Historial de correos enviados (destinatario, plantilla, asunto)', 'Se genera al enviarte invitaciones, avisos de elección o enlaces de recuperación. No se envía correo de confirmación del voto', 'Poder reenviar y depurar incidencias de entrega', 'Art. 6.1.b y 6.1.f'],
          ['Cookies de sesión', 'Se generan al iniciar sesión', 'Mantenerte identificado; seguridad (CSRF)', 'Art. 6.1.b; exentas de consentimiento (art. 22.2 LSSI)'],
          ['Tu dirección IP al hacer peticiones', 'Tu navegador, en cada petición', 'Limitar intentos de acceso y votos por abuso. Se mantiene en la memoria del servidor mientras dura la ventana del límite (15 minutos o menos) y no se guarda en la base de datos. Los registros de acceso de Render y Vercel la conservan además por su cuenta (sección 3)', 'Art. 6.1.f (seguridad del servicio)'],
          ['Solo si eres administrador: cada cambio que haces desde el panel (qué acción, sobre qué elemento, con qué resultado, cuándo y desde qué IP)', 'Se genera al usar el panel de administración, también si la acción se rechaza', 'Poder responder de quién creó, modificó o cerró cada elección si se impugna una votación', 'Art. 6.1.f'],
        ]}
      />
      <P>
        <b>Categorías especiales (art. 9 RGPD).</b> VTB no pide datos de salud, religión ni similares. Pero un voto
        puede <i>revelar</i> opiniones políticas o afiliación sindical si la elección es de ese tipo (por ejemplo,
        listas de un sindicato o de una asociación con ideario). La institución que convoque una elección así debe
        decidir en qué excepción del art. 9.2 se apoya antes de usar VTB; lo recogemos en la evaluación de impacto
        (<code>EIPD.md</code>).
      </P>
      <P>
        <b>Decisiones automatizadas.</b> No tomamos decisiones automatizadas ni elaboramos perfiles sobre ti (art. 22
        RGPD).
      </P>

      <H2>2. Datos de personas que no se han registrado ellas mismas</H2>
      <P>Tres casos en los que tratamos datos de alguien antes de que haya hecho nada:</P>
      <Ul>
        <li><b>Censo importado por la institución.</b> Un administrador puede subir un fichero con nombre, email e
          identificador de estudiante de las personas convocadas a una elección. La cuenta se crea ya aprobada,
          con una contraseña temporal, y se obliga a cambiarla en el primer acceso.</li>
        <li><b>Lista de pre-autorización.</b> Cuando un administrador importa un censo general, esos mismos datos
          se guardan también en una lista interna que aprueba automáticamente a esa persona si más adelante se
          autorregistra con ese email.</li>
        <li><b>Candidatos.</b> El nombre y la descripción de cada candidato los aporta la institución al configurar
          la elección, no la persona candidata. Si eres candidato y quieres ejercer tus derechos, dirígete a la
          institución que convocó la elección.</li>
      </Ul>
      <P>
        En estos casos la institución es quien debe informarte de que te ha incluido en el censo (art. 14 RGPD);
        esta política complementa esa información.
      </P>

      <H2>3. Dónde se almacenan los datos y quién los procesa</H2>
      <P>
        Estos son los proveedores que intervienen, con lo que hace cada uno y dónde. Los que están fuera del
        Espacio Económico Europeo (EEE) se apoyan en las cláusulas contractuales tipo de la Comisión (SCC) o en el
        Marco de Privacidad de Datos UE–EE. UU. (DPF); el enlace de cada uno lleva a su contrato de encargado.
      </P>
      <Table
        head={['Proveedor', 'Qué hace', 'Dónde', 'Contrato y transferencias']}
        rows={[
          ['Supabase', 'Base de datos (PostgreSQL): usuarios, censo, elecciones, registro de votos', 'Frankfurt, Alemania (eu-central-1), dentro del EEE. La entidad contratante es Supabase Pte. Ltd. (Singapur)', <><Ext key="s" href="https://supabase.com/legal/dpa">DPA estándar</Ext>, que se acepta con las condiciones del servicio e incorpora las SCC</>],
          ['Render', 'Aloja el servidor (backend)', 'Frankfurt, Alemania, dentro del EEE. Render Services, Inc. es una empresa de EE. UU.', <><Ext key="r" href="https://render.com/dpa">DPA estándar</Ext>; certificada en el DPF desde el 6 de enero de 2025. <Fill key="rp">[RELLENAR: comprobar que el DPA cubre el plan contratado]</Fill></>],
          ['Vercel', 'Aloja la aplicación web (frontend) y actúa de proxy: reenvía a Render todas las peticiones a /backend, y por tanto también el inicio de sesión, la contraseña y el voto en tránsito', 'Empresa de EE. UU. con red global: el tráfico puede pasar por nodos fuera del EEE', <><Ext key="v" href="https://vercel.com/legal/dpa">DPA estándar</Ext> con SCC, pero <b>solo para los planes Pro y Enterprise</b>; en el plan gratuito no hay contrato de encargado. <Fill key="vp">[RELLENAR: plan contratado de Vercel]</Fill></>],
          ['Proveedor de correo: Resend o Brevo, según la configuración', 'Envío de correos transaccionales (invitaciones, avisos, recuperación de contraseña)', 'Resend: EE. UU., sin región europea. Brevo: Francia, con centros de datos en la UE', <><Ext key="re" href="https://resend.com/legal/dpa">DPA de Resend</Ext> (SCC y DPF). Brevo: su{' '}<Ext key="br" href="https://www.brevo.com/legal/privacypolicy/">política de privacidad</Ext>; el DPA se firma desde la cuenta. <Fill key="rpv">[RELLENAR: proveedor activo en producción]</Fill></>],
          ['Alchemy', 'Nodo RPC de Ethereum: recibe del servidor las transacciones del voto y, en la cabina de votación, el navegador le pide los eventos en vivo si el despliegue define un nodo público', <>EE. UU. <Fill key="al">[RELLENAR: comprobar ubicación]</Fill></>, <><Ext key="a" href="https://www.alchemy.com/policies/dpa">DPA</Ext>, que incorpora las SCC (módulo dos). <Fill key="ap">[RELLENAR: comprobar si producción define VITE_RPC_URL]</Fill></>],
          ['Google Fonts', 'Sirve las tipografías de la página. Tu navegador las pide directamente a Google al cargar cualquier página, y Google recibe tu dirección IP', 'EE. UU. (Google)', <>Sin contrato con nosotros: es un tercero que recibe tu IP. Ver la nota de abajo</>],
          ['Ethereum Sepolia (cadena pública)', 'Registro público e inmutable del voto', 'Distribuida globalmente', 'No es un proveedor: ver sección 4'],
        ]}
      />
      <ComplianceGap>
        Dos puntos que un abogado tiene que cerrar antes de publicar: (1) el plan gratuito de Vercel no tiene DPA y por
        él pasan todas las peticiones; (2) las tipografías se piden a Google Fonts desde el navegador, algo que un
        tribunal alemán consideró ilícito sin consentimiento en 2022. La solución técnica habitual es alojar las
        tipografías en nuestro propio servidor; está pendiente de decisión.
      </ComplianceGap>

      <H2>4. La cadena de bloques: qué se escribe y por qué no se puede borrar</H2>
      <P>Cada voto genera una transacción pública en Ethereum (Sepolia) con estos datos, visibles para cualquiera:</P>
      <Ul>
        <li>El identificador de la elección y su <b>nombre</b>, en texto plano, junto con su fecha de inicio y de fin.</li>
        <li>Un <b>testigo único</b> (nullifier): un valor criptográfico derivado de tu identidad y de un secreto que
          solo tenemos nosotros — es un <b>seudónimo</b>, no tu email ni tu nombre.</li>
        <li>El candidato elegido (su número de orden en la papeleta, no su nombre).</li>
        <li>La fecha y hora exactas del bloque en que se registra el voto.</li>
      </Ul>
      <P><b>No escribimos en la cadena tu nombre, email, identificador de estudiante, ni el nombre de los
        candidatos</b> — de estos últimos solo una huella criptográfica del conjunto.</P>
      <P><b>Recuento parcial.</b> Como el candidato se registra en claro, cualquiera con conocimientos técnicos puede
        leer en la cadena el recuento parcial mientras la votación sigue abierta. La aplicación no lo muestra hasta el
        cierre, pero eso no impide leerlo directamente en la cadena.</P>
      <P><b>Por qué esto limita el derecho de supresión:</b> una cadena de bloques pública es, por diseño, un
        registro que nadie —tampoco nosotros— puede alterar ni borrar. No podemos atender una solicitud de
        supresión sobre lo ya escrito en la cadena.</P>
      <P><b>Sobre el seudónimo y quién puede relacionarlo contigo:</b> el testigo único no es anónimo.{' '}
        <b>La base de datos no conserva la correspondencia entre votante y voto una vez cerrada la elección, pero
        el operador la conoce en el momento de procesar el voto.</b> Guardamos por separado que has participado
        (tu cuenta y la elección, sin fecha ni hora) y los votos (candidato, testigo único y transacción, sin tu
        cuenta y con la hora al minuto). Cuando la elección se cierra se destruye la sal aleatoria propia de esa
        elección y ya no se puede recalcular el testigo único de nadie.</P>
      <P><b>Lo que sigue sin cubrirse:</b> mientras la votación está abierta, el servidor puede calcular el testigo
        único de cualquier persona; mientras un voto está pendiente de confirmar, una tabla interna une tu cuenta
        con su testigo único (se borra al confirmarse y caduca a las 24 o 72 horas); las copias de seguridad
        anteriores a esta separación conservan el vínculo hasta que caducan; y los registros de acceso de las
        plataformas que alojan el servicio (Render, Vercel) guardan la IP y la hora de cada petición de voto
        durante su plazo de retención (<Fill>[RELLENAR: plazo de cada proveedor]</Fill>), y con la hora del
        bloque y los registros de inicio de sesión permiten reconstruir el vínculo. <b>No afirmamos que el voto sea
        anónimo.</b> Es un registro verificable por terceros, con doble voto prevenido criptográficamente.</P>

      <H2>5. Cookies y almacenamiento local</H2>
      <P>Usamos cookies técnicas de sesión y, si tú lo pides activamente, datos guardados en tu navegador para
        recordar tu idioma o tu tema visual. No hace falta tu consentimiento para ninguno de los dos (art. 22.2
        LSSI) — ver la{' '}
        <Link to="/legal/cookies" className={LINK}>Política de Cookies</Link> completa, que lista cada una por su
        nombre.</P>

      <H2>6. Plazos de conservación</H2>
      <Table
        head={['Dato', 'Plazo']}
        rows={[
          ['Enlace de recuperación de contraseña', '15 minutos'],
          ['Enlace de invitación al censo', '7 días'],
          ['Sesión (cookie de acceso)', '15 minutos'],
          ['Sesión (renovación automática)', '7 días'],
          ['Tokens de recuperación e invitación, usados o caducados', 'Se eliminan a las 24 horas'],
          ['Solicitudes de registro rechazadas', 'Se eliminan a los 30 días'],
          ['Historial de correos enviados (email_log)', 'Se elimina a los 90 días'],
          ['Cuenta de usuario dada de baja', 'Se anonimiza a los 30 días de la baja (nombre, email e identificador dejan de ser legibles)'],
          ['Registro de acciones de administración (incluye la IP)', 'Se elimina a los 12 meses'],
          ['Participación (election_participations): tu cuenta y la elección, sin fecha ni hora', 'Mientras exista la cuenta; la cuenta se anonimiza a los 30 días de la baja'],
          ['Voto (nullifier_audit): candidato, testigo único y transacción, sin cuenta', 'Sin plazo definido hoy — ver sección 4'],
          ['Intento de voto en curso (vote_attempts): cuenta y testigo único', 'Se borra al confirmarse el voto; los fallidos a las 24 horas y los colgados a las 72 horas'],
          ['Copias de seguridad de la base de datos anteriores a la separación (migración 016)', <>Conservan el vínculo hasta que caducan: <Fill key="bk">[RELLENAR: plazo de retención de copias del proveedor]</Fill></>],
        ]}
      />
      <ComplianceGap>
        Los plazos de la tabla están decididos e implementados; un abogado debe confirmar que son adecuados para
        cada finalidad antes de darlos por definitivos. El plazo de <code>nullifier_audit</code> sigue sin definir, y
        el de las copias de seguridad anteriores a la migración depende de la configuración del proveedor.
      </ComplianceGap>

      <H2>7. Tus derechos y cómo ejercerlos</H2>
      <P>
        Puedes ejercerlos gratis y te contestamos en el plazo de un mes desde que recibimos tu solicitud, ampliable
        dos meses más si es compleja (art. 12.3 RGPD). No basamos ningún tratamiento en tu consentimiento, así que no
        hay consentimiento que retirar.
      </P>
      <Table
        head={['Derecho', 'Cómo se ejerce hoy']}
        rows={[
          ['Acceso', 'Desde tu perfil, en la propia aplicación'],
          ['Rectificación de nombre, escuela, titulación, año y grupo', 'Desde tu perfil, en la propia aplicación'],
          ['Rectificación de email o identificador de estudiante', <>No es autoservicio. Solicítalo al administrador de tu institución o a <Fill key="c1">[RELLENAR: email de contacto]</Fill></>],
          ['Supresión', <>Puedes pedir la baja de tu cuenta desde tu perfil, o escribiendo a <Fill key="c2">[RELLENAR: email de contacto]</Fill>. Se anonimiza a los 30 días. No alcanza a lo ya escrito en la cadena ni a los votos guardados sin tu cuenta (sección 4)</>],
          ['Portabilidad', 'Puedes descargar tus propios datos en JSON desde tu perfil: tu perfil, en qué elecciones estás censado y en cuáles has participado. Nunca a quién votaste: la base no conserva esa correspondencia, y esta descarga no la reconstruye'],
          ['Oposición y limitación', <>Sin mecanismo automático — solicítalo a <Fill key="c3">[RELLENAR: email de contacto]</Fill>, indicando el motivo</>],
          ['Reclamación', <>Ante la <Ext key="aepd" href="https://www.aepd.es">Agencia Española de Protección de Datos</Ext> si no atendemos tu solicitud correctamente</>],
        ]}
      />

      <H2>8. Menores de edad</H2>
      <P><Fill>[RELLENAR: política respecto a menores — si el servicio es solo para mayores de edad o si las
        instituciones pueden convocar a menores]</Fill>.</P>
    </LegalLayout>
  );
}
