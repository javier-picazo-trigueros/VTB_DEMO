import { LegalLayout, Fill, H2, Ul, Table } from './LegalLayout';

/*
 * Fuentes normativas consultadas (texto oficial) para redactar esta página:
 *   - Ley 34/2002 (LSSI-CE), BOE-A-2002-13758, art. 10 (información general): el prestador debe
 *       tener permanentemente accesibles su denominación o nombre, domicilio, correo electrónico y
 *       otro dato de contacto directo, datos del Registro Mercantil u otro registro público, NIF,
 *       información clara del precio (con o sin impuestos), y los códigos de conducta a los que se
 *       adhiera. Autorización administrativa y profesión regulada: no aplican a este servicio.
 *   - Reglamento (UE) 2016/679 y LO 3/2018: se remite a la Política de Privacidad para los datos
 *       personales.
 * Los datos identificativos no se conocen todavía: quedan como [RELLENAR]. No se inventa ninguno.
 */

export function LegalNotice() {
  return (
    <LegalLayout title="Aviso legal" lastUpdated="Conforme al artículo 10 de la LSSI-CE (Ley 34/2002).">
      <H2>1. Datos identificativos (art. 10 LSSI-CE)</H2>
      <Table
        head={['Campo', 'Valor']}
        rows={[
          ['Titular', <Fill key="1">[RELLENAR: razón social o nombre y apellidos]</Fill>],
          ['NIF', <Fill key="2">[RELLENAR: NIF]</Fill>],
          ['Domicilio', <Fill key="3">[RELLENAR: dirección postal]</Fill>],
          ['Correo de contacto', <Fill key="4">[RELLENAR: email de contacto]</Fill>],
          ['Otro dato de contacto directo', <Fill key="6">[RELLENAR: teléfono o formulario de contacto]</Fill>],
          ['Datos registrales', <Fill key="5">[RELLENAR: inscripción en el Registro Mercantil u otro registro público, si aplica]</Fill>],
          ['Precio', <Fill key="7">[RELLENAR: gratuito, o precio con indicación de si incluye impuestos]</Fill>],
          ['Códigos de conducta', 'Ninguno al que estemos adheridos a fecha de este borrador'],
        ]}
      />
      <p className="text-slate-700 dark:text-slate-300 mb-4">
        El servicio no está sujeto a autorización administrativa previa ni corresponde a una profesión regulada.
      </p>

      <H2>2. Objeto</H2>
      <p className="text-slate-700 dark:text-slate-300 mb-4">
        VTB es una plataforma de votación institucional con registro verificable en la cadena de bloques Ethereum.
        Hoy ese registro se hace en Sepolia, una red de pruebas sin garantías de permanencia. Este aviso legal regula
        el acceso y uso del sitio web y la aplicación. El tratamiento de datos personales se explica en la Política
        de Privacidad.
      </p>

      <H2>3. Condiciones de acceso y uso</H2>
      <p className="text-slate-700 dark:text-slate-300 mb-4">
        El acceso a la web es libre y gratuito. El acceso a la aplicación de voto requiere estar registrado y, en
        su caso, haber sido autorizado por la institución convocante. El uso indebido de la plataforma —incluido
        intentar votar más de una vez, suplantar a otra persona o interferir con el funcionamiento del servicio—
        puede dar lugar a la suspensión de la cuenta.
      </p>

      <H2>4. Propiedad intelectual e industrial</H2>
      <p className="text-slate-700 dark:text-slate-300 mb-4">
        <Fill>[RELLENAR: titularidad del código, marca "VTB"/"Vote Through Blockchain", licencias de terceros]</Fill>.
      </p>

      <H2>5. Exclusión de responsabilidad</H2>
      <Ul>
        <li>El titular no garantiza la disponibilidad continua e ininterrumpida del servicio.</li>
        <li>El titular no controla la red Ethereum ni el nodo RPC que transmite las transacciones; una incidencia
          en la red pública puede retrasar la confirmación de un voto.</li>
        <li><Fill>[RELLENAR: cláusulas adicionales — responsabilidad frente a la institución convocante vs. frente
          al votante]</Fill>.</li>
      </Ul>

      <H2>6. Legislación aplicable y jurisdicción</H2>
      <p className="text-slate-700 dark:text-slate-300 mb-4"><Fill>[RELLENAR: legislación y tribunales competentes]</Fill>.</p>
    </LegalLayout>
  );
}
