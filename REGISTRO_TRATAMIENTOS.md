# Registro de actividades de tratamiento (art. 30 RGPD)

> **Versión borrador pendiente de revisión jurídica · 9 de octubre de 2026.**
> Redactado a partir del código (esquema de `backend/migrations/`, `services/retention.ts`,
> `routes/`) y de `SEGURIDAD.md`. Si el código cambia, esto cambia con él; si discrepan, manda
> el código. Lo que no se puede saber desde el código está como **[RELLENAR: …]**.

## Por qué hay que llevarlo

El art. 30.5 del RGPD exime de llevar el registro a las organizaciones de menos de 250 personas
**salvo** que el tratamiento pueda entrañar un riesgo para los derechos y libertades, **no sea
ocasional** o incluya categorías especiales de datos. VTB trata datos de forma continuada y en
elecciones, así que el registro es obligatorio. Se pone a disposición de la AEPD si lo pide (art. 30.4).

Fuentes leídas: Reglamento (UE) 2016/679, art. 30 (DOUE L 119, 4.5.2016); LO 3/2018, BOE-A-2018-16673.

## Dos registros, según el papel

VTB actúa con dos papeles (ver la Política de Privacidad, sección 0):

| Papel | Cuándo | Qué registro |
|---|---|---|
| **Responsable** | Web pública y registro abierto (caso A) | Parte 1 (art. 30.1) |
| **Encargado** | Votación convocada por una institución (caso B) | Parte 2 (art. 30.2), y la institución lleva el suyo con estos mismos tratamientos |

## Parte 1. Registro del responsable (art. 30.1)

**a) Responsable, corresponsable y delegado de protección de datos**

| Campo | Valor |
|---|---|
| Responsable | **[RELLENAR: razón social o nombre]** |
| NIF | **[RELLENAR: NIF]** |
| Domicilio | **[RELLENAR: dirección postal]** |
| Contacto | **[RELLENAR: email de contacto]** |
| Delegado de protección de datos | **[RELLENAR: nombre y contacto, o motivo por el que no hay]** |
| Corresponsables / representante | **[RELLENAR: si aplica]** |

**b–g) Tratamientos**

### T1. Cuentas y autenticación

| Campo | Contenido |
|---|---|
| Fines | Crear y gestionar la cuenta; autenticar; recuperar la contraseña |
| Base jurídica | Art. 6.1.b (servicio solicitado) |
| Interesados | Personas registradas |
| Datos | Email, nombre, identificador de estudiante, escuela, titulación, año, grupo, rol, dominio de administración, hash de la contraseña (`users`) |
| Destinatarios | Supabase (base de datos), Render (servidor); administrador de la institución, para su dominio |
| Transferencias | Ninguna fuera del EEE para la base de datos y el servidor (Frankfurt). La entidad contratante de Supabase es de Singapur (SCC en su DPA) |
| Plazo | Mientras exista la cuenta. Baja: se marca `deleted_at` y a los **30 días** se anonimiza (email, nombre, identificador, escuela, titulación, año, grupo y hash) |
| Medidas | Hash de contraseñas; HTTPS; cookies httpOnly; autorización en servidor; ver "Medidas comunes" |

### T2. Sesiones

| Campo | Contenido |
|---|---|
| Fines | Mantener la sesión; protección CSRF |
| Base jurídica | Art. 6.1.b; exentas de consentimiento por el art. 22.2 LSSI |
| Datos | Cookies `vtb_auth` (15 min), `vtb_refresh` (7 días), `vtb_csrf` (15 min); hash del token de renovación y caducidad en `refresh_tokens` |
| Destinatarios | Render; Vercel (proxy de `/backend`) |
| Plazo | Los de cada cookie; logout revoca en servidor |
| Medidas | Renovación con rotación; JWT firmado HS256; `requireAuth` comprueba `deleted_at` en cada petición |

### T3. Solicitudes de registro

| Campo | Contenido |
|---|---|
| Fines | Aprobar o rechazar quién se autorregistra |
| Base jurídica | Art. 6.1.b |
| Datos | Nombre, email, identificador, escuela, titulación, año, grupo, hash de contraseña, versión y fecha de aceptación de los textos legales (`registration_requests`) |
| Plazo | Rechazadas: **30 días** desde el rechazo. Aprobadas: pasan a `users` |

### T4. Censo y pre-autorización

| Campo | Contenido |
|---|---|
| Fines | Saber quién puede votar en cada elección; aprobar automáticamente a quien esté en un censo importado |
| Base jurídica | La fija la institución (caso B): art. 6.1.e si es un organismo público; si no, 6.1.b o 6.1.f — **[RELLENAR: por institución]** |
| Interesados | Personas convocadas, aunque aún no se hayan registrado |
| Datos | Nombre, email, identificador (`email_whitelist`); pertenencia a elecciones (`election_voters`, `election_access`) |
| Plazo | **[RELLENAR: no hay plazo implementado para `email_whitelist` ni `election_voters`; decidir]** |

### T5. Participación y voto

| Campo | Contenido |
|---|---|
| Fines | Impedir el doble voto, calcular la participación, registrar y contar el voto |
| Base jurídica | La de la votación (caso B); art. 6.1.b (caso A) |
| Datos | **Participación**: elección y usuario, sin hora (`election_participations`). **Voto**: elección, testigo único (nullifier), candidato, transacción, bloque, hora al minuto, sin usuario (`nullifier_audit`). **Voto en curso**: usuario, elección, testigo único, candidato (`vote_attempts`) |
| Destinatarios | Supabase, Render, Alchemy (nodo RPC), **cadena pública Sepolia** (cualquiera) |
| Transferencias | La cadena es global y pública. Alchemy: EE. UU. (SCC en su DPA) |
| Plazo | Participación: mientras exista la cuenta. Voto: **sin plazo definido** (hueco abierto). Voto en curso: se borra al confirmarse; fallidos **24 h**, colgados **72 h**. En la cadena: **permanente e imborrable** |
| Medidas | Separación participación/voto (migración 016); sal efímera por elección que se destruye al cerrar; ningún dato identificable en la cadena; doble voto prevenido por nullifier |
| Nota | El voto **no es anónimo**: el operador conoce la correspondencia al procesar el voto. Ver `SEGURIDAD.md` |

### T6. Correo transaccional

| Campo | Contenido |
|---|---|
| Fines | Invitaciones, avisos de apertura y cierre, recuperación de contraseña. No se envía confirmación del voto |
| Base jurídica | Art. 6.1.b y 6.1.f |
| Datos | Destinatario, plantilla, asunto, estado (`email_log`). Los enlaces con token se generan al enviar y no se guardan |
| Destinatarios | Proveedor de correo: Resend (EE. UU.) o Brevo (Francia) según `EMAIL_PROVIDER` — **[RELLENAR: el activo en producción]** |
| Plazo | **90 días** |

### T7. Registro de acciones de administración

| Campo | Contenido |
|---|---|
| Fines | Poder responder de quién creó, modificó o cerró una elección si se impugna |
| Base jurídica | Art. 6.1.f |
| Interesados | Administradores |
| Datos | Identificador del actor, rol, dominio, acción, entidad afectada, código de respuesta, **IP**, fecha (`admin_action_log`) |
| Plazo | **12 meses** |

### T8. Seguridad y limitación de abuso

| Campo | Contenido |
|---|---|
| Fines | Limitar intentos de acceso y de voto |
| Base jurídica | Art. 6.1.f |
| Datos | IP en memoria del servidor durante la ventana (≤ 15 min); límite del voto por usuario. Registros de acceso de Render y Vercel (IP, hora, ruta) |
| Plazo | Memoria: la ventana. Plataformas: **[RELLENAR: plazo de cada proveedor]** |

### T9. Aceptación de textos legales

| Campo | Contenido |
|---|---|
| Fines | Demostrar qué versión de los términos y la política vio cada persona |
| Base jurídica | Art. 6.1.f |
| Datos | `terms_version` y `terms_accepted_at` en `users` y `registration_requests`. Las cuentas creadas por un administrador quedan en NULL |
| Plazo | Con la cuenta |

### T10. Candidatos

| Campo | Contenido |
|---|---|
| Fines | Mostrar las opciones de una elección |
| Base jurídica | La de la institución (caso B) |
| Interesados | Personas candidatas, que no han aportado ellas los datos |
| Datos | Nombre y descripción (`candidates`); en la cadena solo una huella del conjunto |

### Recursos de terceros del navegador

Ninguno: las tipografías van autoalojadas (`@fontsource`) y la página no pide nada a Google. Lo vigila
`legal-pages.test.ts` y `npm run check:bundle`.

## Parte 2. Registro del encargado (art. 30.2)

| Campo | Contenido |
|---|---|
| a) Encargado | **[RELLENAR: razón social, contacto y delegado]** |
| a) Responsable por cuenta de quien actúa | Una fila por institución: **[RELLENAR: nombre, contacto y delegado de cada institución]** |
| b) Categorías de tratamientos | T1, T2, T4, T5, T6, T7, T9 y T10 de la parte 1, por cuenta de cada institución |
| c) Transferencias a terceros países | Las de la tabla de subencargados de abajo |
| d) Medidas de seguridad | "Medidas comunes" de abajo |
| Contrato (art. 28.3) | **[RELLENAR: pendiente de formalizar con cada institución]** |

### Subencargados

| Proveedor | Servicio | Ubicación | Contrato |
|---|---|---|---|
| Supabase Pte. Ltd. | Base de datos | Frankfurt (eu-central-1); entidad en Singapur | [DPA](https://supabase.com/legal/dpa), versión 1 de 1-ago-2026; se acepta con las condiciones; incorpora SCC |
| Render Services, Inc. | Servidor | Frankfurt; entidad en EE. UU.; certificada DPF desde 6-ene-2025 | [DPA](https://render.com/dpa). **[RELLENAR: comprobar que cubre el plan contratado]** |
| Vercel Inc. | Frontend y proxy de `/backend` | EE. UU., red global | [DPA](https://vercel.com/legal/dpa) con SCC, **solo planes Pro y Enterprise**. **[RELLENAR: plan contratado]** |
| Resend (Plus Five Five, Inc.) o Brevo | Correo | Resend: EE. UU. sin región UE. Brevo: Francia | [Resend DPA](https://resend.com/legal/dpa): SCC y DPF, aplicable a todos los clientes. Brevo: DPA desde la cuenta |
| Alchemy | Nodo RPC | EE. UU. (a confirmar) | [DPA](https://www.alchemy.com/policies/dpa) con SCC |

El art. 28.2 exige autorización previa del responsable para recurrir a otro encargado: la institución
debe autorizar esta lista por escrito (general o específica).

## Medidas comunes (art. 32; descripción general, art. 30.1.g)

- JWT en cookies httpOnly con `Secure` y `SameSite`; nunca en `localStorage`. CSRF global. Refresh con rotación.
- Autorización en servidor en cada ruta; un recurso ajeno responde 404. Administrador de dominio limitado a su dominio.
- SQL parametrizado; validación de toda entrada (zod). Cabeceras de seguridad (helmet), CORS acotado, límites de peticiones.
- Contraseñas con hash. Tokens de recuperación e invitación de un solo uso, generados al enviar, nunca en claro en la base.
- RLS activada sin políticas en todas las tablas (la API REST de Supabase no se usa).
- El camino del voto no escribe al usuario en logs ni en `email_log`; ninguna tabla junta `user_id` con el voto (lo vigilan los tests).
- Separación de claves: relayer (caliente, en el servidor) y owner del contrato (fría, fuera).
- Cuentas de baja pierden la sesión al instante; anonimización a los 30 días.
- Copias de seguridad de Supabase: **[RELLENAR: política de retención del proveedor]**; las anteriores a la migración 016 conservan el vínculo votante-voto hasta que caduquen.

## Revisión

Revisar al cambiar el esquema (migraciones), añadir un proveedor, cambiar un plazo de `services/retention.ts`
o cambiar `EMAIL_PROVIDER`. Responsable de mantenerlo: **[RELLENAR: persona]**.
