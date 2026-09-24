import { Link } from 'react-router-dom';
import { LegalLayout, Fill, ComplianceGap, H2, H3, P, Ul, Table } from './LegalLayout';

export function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Política de privacidad"
      lastUpdated={<>Conforme al RGPD y la LOPDGDD. Última actualización: <Fill>[RELLENAR: fecha de publicación]</Fill>.</>}
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
            NIF <Fill>[RELLENAR]</Fill>, domicilio <Fill>[RELLENAR]</Fill>, contacto <Fill>[RELLENAR: email]</Fill>.
          </P>
        </div>
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/40">
          <H3>B) Votación de una institución</H3>
          <P className="mb-0">
            Si votas en una elección convocada por tu universidad u organización, <b>la institución es la
            responsable</b> del tratamiento de tu censo y tu voto; nosotros actuamos como <b>encargados del
            tratamiento</b> (art. 28 RGPD) — contrato pendiente de formalizar con cada institución. Para ejercer
            tus derechos sobre estos datos, dirígete primero a tu institución.
          </P>
        </div>
      </div>

      <H2>1. Qué datos tratamos, de dónde salen y para qué</H2>
      <Table
        head={['Datos', 'De dónde salen', 'Finalidad']}
        rows={[
          ['Nombre, email, identificador de estudiante, escuela, titulación, año, grupo', 'Los aportas al autorregistrarte, o los importa el administrador de tu institución por CSV', 'Crear y gestionar la cuenta; verificar que puedes votar en una elección concreta'],
          ['Contraseña (solo su hash)', 'La eliges tú, o el sistema genera una temporal si el alta la hace un administrador (con cambio obligatorio en el primer acceso)', 'Autenticación'],
          ['Candidato elegido, ligado a tu cuenta', 'Lo generas al votar', 'Registrar el voto y prevenir el doble voto (ver sección 4)'],
          ['Historial de correos enviados (destinatario, plantilla, asunto)', 'Se genera al enviarte invitaciones, confirmaciones o enlaces de recuperación', 'Poder reenviar y depurar incidencias de entrega'],
          ['Cookies de sesión', 'Se generan al iniciar sesión', 'Mantenerte identificado; seguridad (CSRF)'],
          ['Solo si eres administrador: cada cambio que haces desde el panel (qué acción, sobre qué elemento, con qué resultado, cuándo y desde qué IP)', 'Se genera al usar el panel de administración, también si la acción se rechaza', 'Poder responder de quién creó, modificó o cerró cada elección si se impugna una votación'],
        ]}
      />

      <H2>2. Datos de personas que no se han registrado ellas mismas</H2>
      <P>Tres casos en los que tratamos datos de alguien antes de que haya hecho nada:</P>
      <Ul>
        <li><b>Censo importado por la institución.</b> Un administrador puede subir un fichero con nombre, email e
          identificador de estudiante de las personas convocadas a una elección. La cuenta se crea ya aprobada,
          con una contraseña temporal, y se obliga a cambiarla en el primer acceso.</li>
        <li><b>Lista de pre-autorización.</b> Cuando un administrador importa un censo general, esos mismos datos
          se guardan también en una lista interna que aprueba automáticamente a esa persona si más adelante se
          autorregistra con ese email y confirma, con el enlace que le enviamos, que el correo es suyo. Esa entrada
          se borra cuando se anonimiza su cuenta.</li>
        <li><b>Candidatos.</b> El nombre y la descripción de cada candidato los aporta la institución al configurar
          la elección, no la persona candidata. Si eres candidato y quieres ejercer tus derechos, dirígete a la
          institución que convocó la elección.</li>
      </Ul>

      <H2>3. Dónde se almacenan los datos y quién los procesa</H2>
      <Table
        head={['Proveedor', 'Qué hace', 'Ubicación']}
        rows={[
          ['Supabase', 'Base de datos (PostgreSQL): usuarios, censo, elecciones, registro de votos', 'Frankfurt, Alemania (eu-central-1) — dentro del EEE'],
          ['Render', 'Aloja el servidor (backend)', 'Frankfurt, Alemania — dentro del EEE'],
          ['Vercel', 'Aloja la aplicación web (frontend), ficheros estáticos desde su red global', 'Empresa con sede en EE. UU. El contenido estático puede servirse desde fuera del EEE; no procesa datos de formularios ni votos'],
          ['Resend', 'Envío de correos transaccionales', <Fill key="r">[RELLENAR]</Fill>],
          ['Proveedor de nodo RPC (Alchemy, Infura u otro)', 'Transmite la transacción del voto a Ethereum', <Fill key="rpc">[RELLENAR]</Fill>],
          ['Red Ethereum (Sepolia, cadena pública)', 'Registro público e inmutable del voto', 'Distribuida globalmente — ver sección 4'],
        ]}
      />
      <ComplianceGap>
        Resend y el proveedor de nodo RPC siguen sin confirmar. Para los que queden fuera del Espacio Económico
        Europeo, hay que comprobar que tienen cláusulas contractuales tipo (SCC) antes de publicar esta política.
      </ComplianceGap>

      <H2>4. La cadena de bloques: qué se escribe y por qué no se puede borrar</H2>
      <P>Cada voto genera una transacción pública en Ethereum (Sepolia) con estos datos, visibles para cualquiera:</P>
      <Ul>
        <li>El identificador de la elección y su <b>nombre</b>, en texto plano.</li>
        <li>Un <b>testigo único</b> (nullifier): un valor criptográfico derivado de tu identidad y de un secreto que
          solo tenemos nosotros — es un <b>seudónimo</b>, no tu email ni tu nombre.</li>
        <li>El candidato elegido (su número de orden en la papeleta, no su nombre).</li>
        <li>La fecha y hora del voto.</li>
      </Ul>
      <P><b>No escribimos en la cadena tu nombre, email, identificador de estudiante, ni el nombre de los
        candidatos</b> — de estos últimos solo una huella criptográfica del conjunto.</P>
      <P><b>Por qué esto limita el derecho de supresión:</b> una cadena de bloques pública es, por diseño, un
        registro que nadie —tampoco nosotros— puede alterar ni borrar. No podemos atender una solicitud de
        supresión sobre lo ya escrito en la cadena.</P>
      <P><b>Sobre el seudónimo y quién puede relacionarlo contigo:</b> el testigo único no es anónimo. Nuestra base
        de datos guarda, en la misma fila, tu identificador de usuario, la elección y el candidato elegido —{' '}
        <b>sin plazo de borrado definido hoy</b>. Desde que la elección se cierra, una sal aleatoria propia de cada
        elección impide recalcular el testigo único desde cero — pero eso no borra la fila ya escrita, solo cierra
        una vía adicional de correlación. <b>No afirmamos que el voto sea anónimo.</b> Es un registro con
        seudónimo, verificable por terceros, con doble voto prevenido criptográficamente — no secreto frente a
        quien opera el sistema.</P>

      <H2>5. Cookies y almacenamiento local</H2>
      <P>Usamos cookies técnicas de sesión y, si tú lo pides activamente, datos guardados en tu navegador para
        recordar tu idioma o tu tema visual. No hace falta tu consentimiento para ninguno de los dos — ver la{' '}
        <Link to="/legal/cookies" className="text-blue-600 dark:text-blue-400 hover:underline">Política de
        Cookies</Link> completa.</P>

      <H2>6. Plazos de conservación</H2>
      <Table
        head={['Dato', 'Plazo']}
        rows={[
          ['Enlace de recuperación de contraseña', '15 minutos'],
          ['Enlace de invitación al censo', '7 días'],
          ['Sesión (cookie de acceso)', '15 minutos'],
          ['Sesión (renovación automática)', '7 días'],
          ['Tokens de recuperación e invitación, usados o caducados', 'Se eliminan a las 24 horas'],
          ['Solicitudes de registro sin confirmar el correo', 'Se eliminan a las 48 horas'],
          ['Solicitudes de registro rechazadas', 'Se eliminan a los 30 días'],
          ['Historial de correos enviados (email_log)', 'Se elimina a los 90 días'],
          ['Cuenta de usuario dada de baja', 'Se anonimiza a los 30 días de la baja (nombre, email e identificador dejan de ser legibles). A la vez se borran su solicitud de registro y su entrada en la lista de pre-autorización'],
          ['Registro de acciones de administración (incluye la IP)', 'Se elimina a los 12 meses'],
          ['Registro de voto (nullifier_audit): usuario, elección y candidato en la misma fila', 'Sin plazo definido hoy — ver sección 4'],
        ]}
      />
      <ComplianceGap>
        Los plazos de la tabla están decididos e implementados; un abogado debe confirmar que son adecuados para
        cada finalidad antes de darlos por definitivos. El plazo de <code>nullifier_audit</code> sigue siendo un
        hueco real: hoy no tiene fecha de caducidad ni separación técnica del resto de la cuenta.
      </ComplianceGap>

      <H2>7. Tus derechos y cómo ejercerlos</H2>
      <Table
        head={['Derecho', 'Cómo se ejerce hoy']}
        rows={[
          ['Acceso', 'Desde tu perfil, en la propia aplicación'],
          ['Rectificación de nombre, escuela, titulación, año y grupo', 'Desde tu perfil, en la propia aplicación'],
          ['Rectificación de email o identificador de estudiante', <>No es autoservicio. Solicítalo al administrador de tu institución o a <Fill key="c1">[RELLENAR: email de contacto]</Fill></>],
          ['Supresión', <>Puedes pedir la baja de tu cuenta desde tu perfil, o escribiendo a <Fill key="c2">[RELLENAR]</Fill>. Se anonimiza a los 30 días. No alcanza a lo ya escrito en la cadena ni a <code>nullifier_audit</code> (sección 4)</>],
          ['Portabilidad', 'Puedes descargar tus propios datos en JSON desde tu perfil'],
          ['Oposición y limitación', <>Sin mecanismo automático — solicítalo a <Fill key="c3">[RELLENAR]</Fill>, indicando el motivo</>],
          ['Reclamación', <>Ante la <a key="aepd" href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Agencia Española de Protección de Datos</a> si no atendemos tu solicitud correctamente</>],
        ]}
      />

      <H2>8. Menores de edad</H2>
      <P><Fill>[RELLENAR: política respecto a menores — si el servicio es solo para mayores de edad o si las
        instituciones pueden convocar a menores]</Fill>.</P>
    </LegalLayout>
  );
}
