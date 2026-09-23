import { LegalLayout, Fill, H2, P } from './LegalLayout';

export function AccessibilityStatement() {
  return (
    <LegalLayout title="Declaración de accesibilidad">
      <H2>Situación de cumplimiento</H2>
      <P>
        <Fill>[RELLENAR — hueco real, no solo de redacción]</Fill>: no se ha realizado ninguna auditoría de
        accesibilidad (WCAG 2.1) sobre la aplicación. No se puede afirmar, ni parcial ni totalmente, ningún nivel
        de conformidad (A, AA o AAA) sin que alguien la evalúe primero. Esta declaración debe redactarse{' '}
        <b>después</b> de una auditoría real, no antes.
      </P>

      <H2>Contenido no accesible conocido</H2>
      <P><Fill>[RELLENAR tras la auditoría]</Fill>.</P>

      <H2>Preparación de esta declaración</H2>
      <P><Fill>[RELLENAR: fecha de la auditoría, metodología usada, fecha de la última revisión]</Fill>.</P>

      <H2>Vía de contacto y reclamación</H2>
      <P>
        Si encuentras una barrera de accesibilidad, puedes comunicarlo a <Fill>[RELLENAR: email de contacto]</Fill>.
        Si no obtienes respuesta satisfactoria, puedes presentar una reclamación ante{' '}
        <Fill>[RELLENAR: organismo competente — p. ej. la Oficina de Atención de Accesibilidad si el titular es
        sujeto obligado por el RD 1112/2018]</Fill>.
      </P>
    </LegalLayout>
  );
}
