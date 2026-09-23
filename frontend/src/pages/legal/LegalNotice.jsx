import { LegalLayout, Fill, H2, Ul, Table } from './LegalLayout';

export function LegalNotice() {
  return (
    <LegalLayout title="Aviso legal" lastUpdated="Conforme al artículo 10 de la LSSI-CE.">
      <H2>1. Datos identificativos</H2>
      <Table
        head={['Campo', 'Valor']}
        rows={[
          ['Titular', <Fill key="1">[RELLENAR: razón social o nombre y apellidos]</Fill>],
          ['NIF', <Fill key="2">[RELLENAR]</Fill>],
          ['Domicilio', <Fill key="3">[RELLENAR]</Fill>],
          ['Correo de contacto', <Fill key="4">[RELLENAR]</Fill>],
          ['Datos registrales', <Fill key="5">[RELLENAR: si aplica]</Fill>],
        ]}
      />

      <H2>2. Objeto</H2>
      <p className="text-slate-700 dark:text-slate-300 mb-4">
        VTB es una plataforma de votación institucional con registro verificable en la cadena de bloques Ethereum.
        Este aviso legal regula el acceso y uso del sitio web y la aplicación.
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
      <p className="text-slate-700 dark:text-slate-300 mb-4"><Fill>[RELLENAR]</Fill>.</p>
    </LegalLayout>
  );
}
