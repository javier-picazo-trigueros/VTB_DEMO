# Evaluación de impacto relativa a la protección de datos (art. 35 RGPD) — borrador

> **Versión borrador pendiente de revisión jurídica · 9 de octubre de 2026.**
> Breve a propósito: sirve para que quien revise (asesoría jurídica, delegado de protección de datos)
> parta de algo concreto. Las valoraciones de probabilidad e impacto son **propuestas** de quien
> redacta, no una conclusión. Lo que depende de una institución concreta está como
> **[RELLENAR: …]**. Detalle técnico: `SEGURIDAD.md`, `ARCHITECTURE.md`; tratamientos: `REGISTRO_TRATAMIENTOS.md`.

Fuente leída: Reglamento (UE) 2016/679, arts. 35 y 36 (DOUE L 119, 4.5.2016). El apartado 7 fija el
contenido mínimo: descripción sistemática (a), necesidad y proporcionalidad (b), riesgos (c) y medidas (d);
es la estructura de este documento.

## 0. Por qué se hace

El art. 35.1 pide la evaluación cuando un tratamiento, "en particular si utiliza nuevas tecnologías",
pueda entrañar un alto riesgo. Aquí concurren: (1) una tecnología nueva y con una propiedad que choca con el
RGPD, un registro público que no se puede borrar; (2) un voto que, según la elección, puede revelar
opiniones políticas o afiliación sindical (art. 9.1), y el art. 35.3.b cita el tratamiento a gran escala de
esas categorías. Se hace por prudencia, antes de un piloto, aunque ninguno de los dos criterios sea
seguro en una elección universitaria corriente.

| Campo | Valor |
|---|---|
| Responsable | **[RELLENAR: entidad responsable; la institución que convoca (caso B) o el titular de VTB (caso A)]** |
| Delegado de protección de datos (art. 35.2: se le pide consejo) | **[RELLENAR]** |
| Fecha de la evaluación y revisión prevista | 9 de octubre de 2026 (borrador); **[RELLENAR: fecha de revisión]** |

## 1. Descripción sistemática del tratamiento (art. 35.7.a)

**Qué es.** Plataforma para votar en elecciones institucionales (consejos de estudiantes, claustros,
delegados, gobernanza de una organización) con un registro en blockchain que cualquiera puede recontar.

**Interesados.** Votantes censados, personas candidatas, administradores de la institución.

**Datos.** Los de `REGISTRO_TRATAMIENTOS.md`, T1 a T10. Los que importan aquí:

| Dato | Dónde | Identifica a | Se puede borrar |
|---|---|---|---|
| Cuenta (email, nombre, identificador, escuela…) | PostgreSQL (Supabase, Frankfurt) | La persona | Se anonimiza a los 30 días de la baja |
| Participación (usuario + elección, sin hora) | PostgreSQL | La persona, y que votó | Con la cuenta |
| Voto (testigo único + candidato + transacción, hora al minuto, sin usuario) | PostgreSQL | Nadie directamente | **Sin plazo definido** |
| Voto en la cadena (elección, testigo único, candidato en claro, hora del bloque) | Ethereum Sepolia | Un seudónimo | **No** |
| Voto en curso (usuario + testigo único) | PostgreSQL, `vote_attempts` | La persona **y** su voto, mientras dura | Al confirmarse; 24 h fallido, 72 h colgado |

**Flujo del voto.** El servidor comprueba que la persona está censada y no ha votado, calcula el testigo
único (HMAC con un secreto del servidor y una sal propia de la elección), lo envía con el candidato al contrato
con la clave del relayer, y al confirmarse guarda por separado la participación y el voto. Al cerrar la
elección se destruye la sal.

**Destinatarios y encargados.** Supabase, Render, Vercel (proxy de toda la API), proveedor de correo, Alchemy,
la propia cadena pública. Ver `REGISTRO_TRATAMIENTOS.md`.

## 2. Necesidad y proporcionalidad (art. 35.7.b)

- **Finalidad legítima.** Organizar votaciones con un recuento que un tercero pueda verificar sin confiar en
  quien opera el sistema. La base jurídica la fija la institución **[RELLENAR: por institución]**.
- **Minimización.** En la cadena no hay nombre, email ni identificador; solo un seudónimo y el candidato. La
  base no guarda `user_id` junto al voto. El correo de confirmación del voto se eliminó porque su fila en
  `email_log` se podía cruzar con la hora del voto.
- **Necesidad de la cadena pública.** Es lo que da el recuento verificable por terceros; también es lo que no se
  puede borrar. Hay una alternativa menos intrusiva, un recuento verificable sin cadena pública o con una cadena
  permisionada (la hoja de ruta apunta a salir de Sepolia), que la institución debe valorar. **[RELLENAR:
  decisión de la institución sobre si la cadena pública es proporcionada para su elección]**.
- **Plazos.** Implementados salvo el voto (`nullifier_audit`), el censo (`email_whitelist`, `election_voters`) y
  las copias de seguridad, que están sin decidir.
- **Derechos.** Acceso, rectificación de parte, baja y portabilidad desde el perfil. La supresión **no
  alcanza** a lo escrito en la cadena; la Política de Privacidad lo dice.
- **Información.** Política de Privacidad, de Cookies y Términos, en borrador.

## 3. Riesgos para los derechos y libertades (art. 35.7.c) y medidas (art. 35.7.d)

Escala propuesta: probabilidad y gravedad, de baja a alta; el residual es el que queda **con las medidas ya aplicadas**.

### R1. Vinculación votante-voto

Alguien reconstruye quién votó a quién. Es el riesgo central: **el voto no es anónimo**.

| Vía | Quién | Medida aplicada | Qué queda |
|---|---|---|---|
| El operador durante el voto: calcula el testigo único y conoce el candidato | Operador | Participación y voto en tablas separadas; sin `user_id` en el voto; hora al minuto; sal destruida al cerrar | Mientras la votación está abierta puede recalcularse |
| `vote_attempts` une usuario y testigo único | Quien lea la base | Se borra al confirmar; caduca a 24 h / 72 h | La ventana existe |
| Copias de seguridad anteriores a la migración 016 | Quien acceda a una copia | Ninguna técnica; dependen de la retención del proveedor | El vínculo sigue ahí hasta que caduquen |
| Registros de acceso de Render y Vercel (IP, hora, ruta) + hora del bloque + registros de inicio de sesión | Proveedor o quien lo requiera | Ninguna propia; el plazo es del proveedor | Reconstruible por correlación |
| Hora del bloque público y hora de la participación | Observador | Participación sin hora | Correlación débil |

Probabilidad: media (requiere acceso privilegiado o a registros). Gravedad: **alta**. **Residual: alto**
hasta que haya anonimato criptográfico (Semaphore, pendiente). Cualquier afirmación de anonimato queda
prohibida hasta entonces.

### R2. Cadena pública irreversible

Lo escrito no se puede borrar ni rectificar (derecho de supresión, art. 17).

Medidas: nada identificable en la cadena (solo seudónimo y candidato); lo dice la Política de Privacidad.
Probabilidad: cierta (es una propiedad del diseño). Gravedad: media si el seudónimo no se vincula; alta si
se vincula (R1). **Residual: medio-alto**; solo se elimina cambiando de arquitectura.

### R3. Recuento parcial legible en la cadena

El candidato va en claro (`VoteCast`, `getTally()`). La aplicación oculta el reparto hasta el cierre
(SCRUM-16), pero cualquiera puede leerlo en la cadena durante la votación: voto estratégico, presión,
influencia. Medida: ninguna técnica en la cadena; el ocultamiento es solo de la interfaz y de la API.
Probabilidad: alta. Gravedad: media (integridad del proceso, no del dato personal).
**Residual: medio**, decisión de producto: cifrado o compromiso-revelación (commit–reveal) por parte de la institución.

### R4. Categorías especiales (art. 9)

El voto puede revelar opiniones políticas o afiliación sindical. Medidas: separación de R1. Falta: la institución
debe fijar la excepción del art. 9.2 **[RELLENAR: por elección; sobre todo si hay listas con ideario]**.
Probabilidad: baja en elecciones académicas, alta en sindicales o de ideario. Gravedad: alta.

### R5. Terceros y transferencias

- Vercel recibe en tránsito toda la API (credenciales y voto); su DPA **no cubre el plan gratuito**.
- Resend, Alchemy, Vercel y Render son de EE. UU. (SCC y/o DPF).

Medidas: DPA y SCC enlazados en la Política; alternativa a revisar: pasar a plan con DPA, elegir Brevo (UE) para el correo.
Las tipografías ya van autoalojadas (no hay petición a Google). Probabilidad: media. Gravedad: media.
**Residual: medio** hasta cerrar esas dos acciones.

### R6. Compromiso del servidor o de las claves

Un atacante con el servidor puede emitir votos con la clave del relayer. El owner del contrato podría
autorizarse como relayer (`setRelayer`) y emitir votos nuevos, aunque no puede borrar ni reescribir los emitidos.

Medidas: claves separadas (relayer caliente, owner frío fuera del servidor); revocar el relayer sin
redesplegar; recuento verificable por un tercero (`RECUENTO_INDEPENDIENTE.md`); autorización en servidor;
JWT HS256 fijado; CSRF; límites de peticiones; sin secretos en el repositorio. Probabilidad: baja. Gravedad: alta.
**Residual: bajo-medio.**

### R7. Retención sin plazo

`nullifier_audit`, `email_whitelist`, `election_voters` y las copias de seguridad no tienen plazo
(art. 5.1.e, limitación del plazo de conservación). Medida: ninguna todavía. **Residual: medio**; acción: decidir plazos con
cada institución.

### R8. Datos de personas que no intervinieron

Candidatos y censados importados no aportaron sus datos. Medida: la institución informa (art. 14);
la Política lo recoge. **Residual: bajo.**

### R9. Disponibilidad e integridad: red de pruebas

Sepolia es una red de pruebas sin garantías de permanencia. Un reinicio o abandono de la red puede
perder el registro. Medida: la base conserva el voto; la hoja de ruta prevé salir de Sepolia. Probabilidad: media.
Gravedad: media (el voto sigue en la base, pero ya no sería verificable por terceros). **Residual: medio.**

## 4. Resumen

| # | Riesgo | Residual |
|---|---|---|
| R1 | Vinculación votante-voto | **Alto** (hasta Semaphore) |
| R2 | Cadena pública irreversible | Medio-alto |
| R3 | Recuento parcial legible | Medio |
| R4 | Categorías especiales | Depende de la elección |
| R5 | Terceros y transferencias | Medio |
| R6 | Compromiso de servidor o claves | Bajo-medio |
| R7 | Retención sin plazo | Medio |
| R8 | Datos de terceros no intervinientes | Bajo |
| R9 | Red de pruebas | Medio |

**Conclusión provisional.** Con las medidas actuales quedan riesgos residuales altos (R1) o medio-altos (R2).
El art. 36.1 exige consultar a la AEPD **antes** del tratamiento cuando la evaluación muestre un alto riesgo
que el responsable no mitiga; es una decisión del responsable y de su delegado, no de este borrador.
Para un piloto interno (una elección universitaria sin categorías especiales, con una institución informada
y el voto no anónimo comunicado de forma expresa) el riesgo puede ser asumible. Lo que no es asumible es
presentarlo como anónimo.

## 5. Acciones propuestas antes de un piloto

1. Decidir plazo de `nullifier_audit`, censo y copias de seguridad (R7).
2. Pasar Vercel a un plan con DPA o sustituir el proxy (R5).
3. Elegir el proveedor de correo (Brevo, UE) y firmar su DPA (R5).
4. Firmar el contrato de encargado (art. 28.3) con cada institución y que autorice los subencargados (R5).
5. Que la institución fije la base jurídica y, si procede, la excepción del art. 9.2 (R4).
6. Evaluar commit–reveal o cifrado del voto hasta el cierre (R3) y Semaphore (R1).
7. Revisar esta evaluación al cambiar de red, de contrato o de proveedor.
