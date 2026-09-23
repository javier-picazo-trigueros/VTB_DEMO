import { Link } from 'react-router-dom';
import { LegalLayout, Fill, H2, P } from './LegalLayout';

export function TermsOfService() {
  return (
    <LegalLayout title="Términos y condiciones de uso">
      <H2>1. Aceptación</H2>
      <P>
        El registro en VTB implica la aceptación de estos términos y de la{' '}
        <Link to="/legal/privacidad" className="text-blue-600 dark:text-blue-400 hover:underline">Política de
        Privacidad</Link>, mediante una casilla independiente de cualquier otro consentimiento, no marcada por
        defecto.
      </P>

      <H2>2. Qué es y qué no es VTB</H2>
      <P>
        VTB ofrece: registro inmutable del voto, recuento verificable por terceros de forma independiente, y
        prevención criptográfica del doble voto. <b>VTB no ofrece hoy voto anónimo ni voto secreto frente a quien
        opera el sistema</b> — ver la sección 4 de la <Link to="/legal/privacidad" className="text-blue-600 dark:text-blue-400 hover:underline">Política de Privacidad</Link>. Cualquier institución que convoque una elección a
        través de VTB debe comprobar que este nivel de garantía es compatible con su propio reglamento electoral
        antes de convocar.
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
        <Fill>[RELLENAR: condiciones específicas para la institución que contrata VTB — nivel de servicio,
        responsabilidades como responsable del tratamiento, facturación si aplica]</Fill>.
      </P>

      <H2>6. Modificación de los términos</H2>
      <P><Fill>[RELLENAR: procedimiento de aviso ante cambios — email, aviso en la aplicación, plazo de preaviso]</Fill>.</P>

      <H2>7. Legislación aplicable y jurisdicción</H2>
      <P><Fill>[RELLENAR]</Fill>.</P>
    </LegalLayout>
  );
}
