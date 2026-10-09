import { LegalLayout, Fill, ComplianceGap, H2, P, Ul } from './LegalLayout';

/*
 * Fuentes normativas consultadas (texto oficial) para redactar esta página:
 *   - Real Decreto 1112/2018, de 7 de septiembre, sobre accesibilidad de los sitios web y
 *       aplicaciones para dispositivos móviles del sector público (BOE-A-2018-12699):
 *       art. 2 (ámbito: las Administraciones y entidades del sector público); art. 15 (la declaración
 *       de accesibilidad: contenido no accesible y motivos, mecanismo de comunicación, enlace
 *       "Accesibilidad" desde todas las páginas, revisión al menos anual); arts. 11 a 13 (queja:
 *       respuesta en veinte días hábiles; reclamación si no se está conforme, respuesta en dos meses).
 *   - Norma EN 301 549 a la que remite el real decreto. El texto del real decreto cita la V1.1.2; las
 *       versiones posteriores incorporan WCAG 2.1 nivel AA, que es el objetivo de este proyecto.
 *   - WCAG 2.1 (W3C), nivel AA.
 * Esta declaración NO afirma ningún nivel de conformidad: no hay auditoría. Se redacta cuando la haya.
 */

export function AccessibilityStatement() {
  return (
    <LegalLayout title="Declaración de accesibilidad">
      <H2>A quién obliga y qué se declara</H2>
      <P>
        El Real Decreto 1112/2018 obliga a los sitios web y aplicaciones del sector público. VTB lo usan
        instituciones que pueden serlo (una universidad pública, por ejemplo), y esa institución tendrá que
        declarar la accesibilidad de lo que ofrezca a su comunidad, también de VTB. Por eso esta página sigue
        la estructura del art. 15 aunque el titular de VTB no sea, por sí mismo, un sujeto obligado:{' '}
        <Fill>[RELLENAR: confirmar con asesoría jurídica si el titular es sujeto obligado]</Fill>.
      </P>

      <H2>Situación de cumplimiento</H2>
      <P>
        El objetivo es el nivel AA de las WCAG 2.1 (la norma EN 301 549 a la que remite el real decreto). No se ha
        realizado ninguna auditoría de accesibilidad sobre la aplicación, así que <b>no declaramos ningún nivel de
        conformidad</b>, ni total ni parcial. No se puede afirmar nada sin que alguien la evalúe primero; esta
        declaración debe completarse <b>después</b> de una auditoría real, no antes.
      </P>
      <ComplianceGap>
        Falta la auditoría: <Fill>[RELLENAR: quién la hace, con qué metodología (revisión manual con lector de
        pantalla y teclado, herramientas automáticas) y cuándo]</Fill>.
      </ComplianceGap>

      <H2>Contenido no accesible conocido</H2>
      <P><Fill>[RELLENAR tras la auditoría: contenido no accesible, motivo y alternativa]</Fill>.</P>

      <H2>Preparación de esta declaración</H2>
      <P><Fill>[RELLENAR: fecha de la auditoría, metodología usada, fecha de la última revisión]</Fill>. El real
        decreto pide revisarla al menos una vez al año y tras cada revisión de accesibilidad.</P>

      <H2>Vía de contacto y reclamación</H2>
      <P>
        Si encuentras una barrera de accesibilidad o necesitas la información en otro formato, puedes comunicarlo a{' '}
        <Fill>[RELLENAR: email de contacto o formulario accesible]</Fill>. Con el procedimiento del real decreto,
        la respuesta debe llegar en <b>veinte días hábiles</b>.
      </P>
      <P>Si no estás conforme con la respuesta o no la recibes, puedes presentar una reclamación:</P>
      <Ul>
        <li>ante la unidad responsable de accesibilidad de la institución que te ofrece la votación, que debe
          contestar en <b>dos meses</b>;</li>
        <li>o ante <Fill>[RELLENAR: organismo competente — p. ej. la unidad de accesibilidad de la Administración
          correspondiente]</Fill>.</li>
      </Ul>
    </LegalLayout>
  );
}
