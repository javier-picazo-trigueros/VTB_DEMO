import { Link } from 'react-router-dom';
import { LegalLayout, Fill, H2, P } from './LegalLayout';

/*
 * Fuentes normativas consultadas (texto oficial) para redactar esta página:
 *   - Reglamento (UE) 2016/679 (RGPD), art. 6.1.b (tratamiento necesario para la ejecución del
 *       contrato) y art. 13 (información al recoger los datos): la aceptación de estos términos no
 *       sustituye a la información de la Política de Privacidad ni es un consentimiento RGPD.
 *   - LO 3/2018 (LOPDGDD), arts. 11 y 12: información por capas y ejercicio de derechos.
 *   - Ley 34/2002 (LSSI-CE), art. 10: identificación del prestador (ver Aviso legal).
 * Lo que VTB garantiza y lo que no sale de SEGURIDAD.md y del código; nunca se afirma voto anónimo.
 * La versión que se graba al aceptar (users.terms_version) es CURRENT_TERMS_VERSION; sube esa fecha
 * cuando cambie el contenido sustantivo de esta página o de la Política de Privacidad.
 */

export function TermsOfService() {
  return (
    <LegalLayout title="Términos y condiciones de uso">
      <H2>1. Aceptación</H2>
      <P>
        El registro en VTB implica la aceptación de estos términos y de la{' '}
        <Link to="/legal/privacidad" className="text-brand-600 dark:text-brand-300 hover:underline">Política de
        Privacidad</Link>, mediante una casilla independiente de cualquier otro consentimiento, no marcada por
        defecto. Junto con la aceptación se guarda qué versión de estos textos viste y cuándo. Las cuentas que crea
        un administrador de tu institución no pasan por esa casilla: en ese caso es la institución quien te informa
        y esta página y la Política de Privacidad quedan a tu disposición.
      </P>

      <H2>2. Qué es y qué no es VTB</H2>
      <P>
        VTB ofrece: registro inmutable del voto, recuento verificable por terceros de forma independiente, y
        prevención criptográfica del doble voto. <b>VTB no ofrece hoy voto anónimo ni voto secreto frente a quien
        opera el sistema</b> — ver la sección 4 de la <Link to="/legal/privacidad" className="text-brand-600 dark:text-brand-300 hover:underline">Política de Privacidad</Link>. Cualquier institución que convoque una elección a
        través de VTB debe comprobar que este nivel de garantía es compatible con su propio reglamento electoral
        antes de convocar.
      </P>
      <P>
        El registro se hace hoy en Ethereum Sepolia, una red de pruebas: no tiene las garantías de permanencia ni de
        seguridad de una red de producción.
      </P>

      <H2>3. Cuentas y elegibilidad</H2>
      <P>
        Cada persona puede tener una única cuenta. El acceso a una elección concreta lo determina la institución
        convocante. Dar información falsa en el registro, o intentar votar por otra persona, es motivo de
        suspensión de la cuenta.
      </P>

      <H2>4. El voto</H2>
      <P>
        Un voto emitido no se puede modificar ni retirar una vez confirmado en la cadena. La institución
        convocante es responsable de comunicar su propio reglamento electoral; VTB solo garantiza el registro
        técnico.
      </P>

      <H2>5. Uso por instituciones</H2>
      <P>
        Cuando una institución convoca una votación, es la responsable del tratamiento del censo y de los votos y
        nosotros somos sus encargados (art. 28 RGPD); ese contrato se firma aparte.{' '}
        <Fill>[RELLENAR: condiciones específicas para la institución que contrata VTB — nivel de servicio,
        facturación si aplica]</Fill>.
      </P>

      <H2>6. Modificación de los términos</H2>
      <P><Fill>[RELLENAR: procedimiento de aviso ante cambios — email, aviso en la aplicación, plazo de preaviso]</Fill>.</P>

      <H2>7. Legislación aplicable y jurisdicción</H2>
      <P><Fill>[RELLENAR: legislación y tribunales competentes]</Fill>.</P>
    </LegalLayout>
  );
}
