# Sprint 2 — Integridad de la votación (parte de Jaime)

**Sprint:** 22–29 sep 2026 · **Rama:** `main` · **Commits:** `3f0b4469`, `d759944d`

Este documento resume en qué estado queda cada historia del Sprint 2, qué he
hecho yo, qué te afecta a ti (Javier), y qué hallazgos nuevos hay que decidir
entre los dos. El detalle técnico de cada cambio está en su mensaje de commit.

---

## Estado de las seis historias

| Historia | Quién | Estado | Qué queda |
|---|---|---|---|
| SCRUM-16 · El recuento no es público hasta el cierre | Javier | ⚠️ A medias | La interfaz ya oculta el reparto (`ccd319b0`), pero `GET /elections/:id/results` lo sigue devolviendo durante la votación. Ver [punto 4](#4-scrum-16-la-api-sigue-sirviendo-el-reparto) |
| SCRUM-17 · Separar la identidad del voto | Javier + Jaime | ❌ Sin empezar | Es una decisión de diseño que el ticket pide hablar antes de implementar |
| SCRUM-18 · Ningún voto se da por bueno fuera de la cadena | Javier | ✅ Hecha | Contrato v2: 503 `ELECTION_NOT_ON_CHAIN`, sin hashes inventados, votos pendientes visibles |
| SCRUM-19 · Aislamiento real entre instituciones | Jaime → Javier | ✅ Hecha | La cerraste tú desde la auditoría 3: `aaa54be0`, `fd5fc710`, `363fecca` |
| SCRUM-20 · Registro de acciones de administrador | Jaime | ✅ Hecha | `d759944d`. Falta aplicar la migración 014 en producción |
| SCRUM-21 · Una sola política de validación | Jaime | ✅ Hecha | `3f0b4469` |

Además rotaste la clave de Alchemy, así que `SCRUM-34` y `SCRUM-35` del Sprint 1
quedan cerradas.

---

## Lo que he hecho

### SCRUM-21 · Una sola política de email y contraseña (`3f0b4469`)

Cierra M-3 (la parte de validación) y M-4 de tu auditoría 3.

- **Eran cinco políticas de contraseña, no cuatro.** `POST /admin/users` no
  tenía ningún mínimo. Ahora todas las contraseñas nuevas pasan por
  `backend/src/utils/validation.ts`: de 8 a 128 caracteres, con el mismo
  mensaje en todas las rutas.
- **El login no aplica el mínimo, a propósito.** Una cuenta antigua con 6
  caracteres tiene que poder entrar para cambiarla.
- **El email se normaliza al crear la cuenta.** Se guarda sin espacios y en
  minúsculas. El login ya buscaba en minúsculas, así que una cuenta dada de
  alta como `Ana@Uni.edu` no podía entrar nunca (P1-17 de `AUDITORIA_2.md`).
- **El registro público usa zod.** Antes validaba el email con
  `includes("@")` y el curso con un `parseInt` que dejaba pasar `NaN`.
- **He quitado `POST /auth/admin/register`.** Duplicaba `POST /admin/users`
  y no la llamaba nadie. Su comprobación de dominio se saltaba entera con un
  administrador sin dominio asignado.
- **Frontend.** Los cuatro formularios que repetían su propio mínimo, tres de
  ellos con 6, leen ahora `frontend/src/utils/passwordPolicy.js`.

El test `validation-policy.test.ts` recorre las cinco rutas con los mismos
valores. También compara la constante del frontend con la del backend.
Comprobé que falla si se vuelve a poner 6 en una sola ruta.

### SCRUM-20 · Registro de acciones de administración (`d759944d`)

- **Tabla `admin_action_log`**, en la migración 014 con RLS y en el esquema de
  SQLite. No se llama `audit` porque `nullifier_audit` y `GET /admin/audit`
  ya son el registro de votos.
- **Un middleware montado una vez en `app.ts`**, delante de `/admin` y
  `/api/admin`. Cada escritura de un administrador deja una fila: quién, con
  qué rol y dominio, qué ruta, sobre qué elemento, con qué resultado, desde
  qué IP y cuándo.
- **Registra también los intentos rechazados.** Un 404 de tu
  `denyIfElectionOutOfScope` es un administrador tocando la elección de otra
  institución, y eso es lo primero que interesa ver.
- **No guarda el cuerpo de la petición**, que lleva contraseñas y censos
  enteros. Tampoco copia el email del administrador: guarda su id, para no
  saltarse tu anonimización de cuentas dadas de baja.
- **`GET /admin/action-log` filtra por dominio.** El superadministrador ve
  todo, con IP. Un administrador de dominio ve lo que hacen los
  administradores de su dominio y cualquier acción sobre sus elecciones, la
  haga quien la haga. No ve las IPs de otros.
- **Pestaña "Registro de acciones" en el panel**, en su propio componente.
- **Conservación de 12 meses**, añadida a `services/retention.ts` y a las
  secciones 1 y 6 de la Política de Privacidad. Un test ata el plazo del
  código al texto de la política.

Los tests sacan las 17 rutas de escritura del propio router, sin lista escrita
a mano, así que una ruta nueva queda cubierta sola. Probado también contra
PostgreSQL 17 en Docker: la migración sube, baja y vuelve a subir, y el
recorrido completo con dos instituciones funciona.

---

## Lo que te afecta

1. **Hay que aplicar la migración 014 en producción** con `npm run migrate`.
   Si el código se despliega antes, no se rompe nada: el middleware falla en
   silencio y lo deja en el log. Pero el registro no guarda nada, y la pestaña
   da error hasta que exista la tabla.
2. **`POST /auth/admin/register` ya no existe.** Si tenías algo que la usara
   fuera del repositorio, pásalo a `POST /admin/users`.
3. **Mínimo de 8 caracteres en todas las contraseñas nuevas.** El
   autorrelleno de demo del registro pasa de `demo123` a `demo1234`.
4. **`AdminPanel.jsx`:** saqué el botón de pestaña del componente. Estaba
   definido dentro y eslint lo marcaba en cada uso. Ese fichero pasa de 13 a
   6 errores de lint. Si tienes cambios en marcha ahí, puede haber un
   conflicto pequeño en la fila de pestañas.

---

## Hallazgos nuevos para decidir juntos

### 1. La lista blanca permite quedarse con el email de una baja (reproducido)

Importar un censo mete cada email en `email_whitelist` y nunca marca la
entrada como usada. Esto es lo que pasa:

1. Justo después de dar de baja la cuenta, el email sigue ocupado y el
   registro lo rechaza.
2. A los 30 días, la anonimización cambia el email de la cuenta, pero no toca
   la lista blanca. La entrada conserva el nombre y el identificador de la
   persona, y sigue sin usar.
3. Cualquiera puede registrar entonces ese email con su propia contraseña.
   Queda aprobado al momento, sin demostrar que el correo es suyo, y metido en
   las elecciones futuras de ese dominio.

Lo reproduje con un test que no he commiteado. Son dos problemas:

- **Suplantación:** la plataforma confía en un email que nadie ha verificado.
- **Protección de datos:** la política promete que a los 30 días esos datos
  dejan de ser legibles, y en la lista blanca siguen.

**Propuesta:** que el registro verifique el email con un enlace antes de
aprobar nada. Eso arregla también el punto 2. Mientras tanto, hay dos
parches baratos: borrar la entrada de la lista blanca al anonimizar, y
marcarla como usada cuando la importación ya crea la cuenta.

### 2. El registro público sigue revelando qué emails tienen cuenta

Es la otra mitad de M-3. Hay tres respuestas distintas: "ya tienes cuenta",
"ya tienes solicitud" y "aprobado automáticamente". No la he tocado porque
unificarlas sin verificación por email rompe el aviso de aprobación
automática. Con el punto 1 resuelto, todas pasan a ser "revisa tu correo".

### 3. Las cuentas que ya existen con mayúsculas

El código nuevo normaliza las altas, pero las filas de producción con
mayúsculas siguen sin poder entrar. Hace falta una migración de datos que
detecte colisiones antes, porque `Ana@x.edu` y `ana@x.edu` pueden ser dos
filas. Es tu terreno y toca Supabase, así que no la he escrito.

### 4. SCRUM-16: la API sigue sirviendo el reparto

Entiendo tu razonamiento en `SEGURIDAD.md`: con el contrato v2, el candidato
de cada voto ya es público en la cadena. Aun así, cortarlo en la API
encarece la consulta, porque pasa de "una petición HTTP" a "saber leer
eventos de un contrato". Son pocas líneas, y el ticket lo pide literalmente.
Tú decides si se cierra así o se hace.

### 5. Detalles menores

- `POST /admin/users` responde 500 con un identificador de estudiante
  repetido, cuando debería ser 409. Es anterior a este sprint.
- El plazo de 12 meses del registro de acciones es una decisión mía, pensada
  para cubrir la impugnación de cualquier votación de un curso. Confírmalo o
  cámbialo: la constante y la política van juntas y el test lo vigila.

---

## Actualización 25-sep: SCRUM-16 y SCRUM-123

Jaime decidió cortar el reparto también en la API (punto 4) y hacer la
verificación por correo (puntos 1 y 2).

### SCRUM-16 · El servidor no publica el reparto hasta la fecha de fin (`67e7894e`)

- `GET /elections/:id/results` ya no da votos por candidato antes de
  `end_time`. Da el total, la participación y los nombres de las
  candidaturas, y la marca `tallyHidden`. También quita `recuentoBase` y
  `recuentoCadena`, que eran el mismo reparto con otra forma.
- La referencia es `end_time` y no `status`. Ocultar una elección a mitad de
  plazo la marcaba como `closed` y habría destapado el recuento.
- El administrador de esa elección y el superadministrador lo siguen viendo
  en vivo. Saqué tu condición de alcance a `isElectionInScopeFor` para usarla
  sin `requireAdmin`.
- El PDF de resultados se podía exportar con la votación abierta y salía el
  recuento. Ya no.
- Actualicé tu párrafo de `SEGURIDAD.md` 2.2 sin cambiar lo esencial: sigue
  siendo legible en la cadena.
- Ajusté `results-chain.test.ts`: sus elecciones nacen ya terminadas, porque
  prueba el contraste con la cadena y no cuándo se publica.
- De paso corregí el texto de ejemplo de `/vote-feed`, que decía "hash
  anónimo del votante".

### SCRUM-123 · Confirmar el email en el registro (`baef39ab`)

- El registro ya no crea ni aprueba nada. Guarda la solicitud como
  `unverified` y manda un enlace, que dura 24 horas. Solo al abrirlo se
  aprueba la cuenta si el email está en la lista blanca, o la solicitud pasa
  al panel como `pending`.
- El formulario responde lo mismo en todos los casos. Quien ya tiene cuenta
  recibe un aviso con enlace a recuperar la contraseña.
- Al anonimizar una baja se borran también su entrada de la lista blanca y su
  solicitud. Las solicitudes sin confirmar se borran a las 48 horas.
- El panel no ve ni deja aprobar solicitudes sin confirmar, y ya no deja
  revisar dos veces la misma.
- He adaptado tus dos tests de `legal-acceptance`: ahora confirman el correo
  antes de comprobar lo mismo que antes.

### Antes de desplegar estos dos commits

Estos commits **no están subidos**. El orden importa:

1. **`npm run migrate` en producción**, que aplica la 014 y la 015. La 015
   cambia el `CHECK` de `registration_requests.status`: si el código llega
   antes, cada registro da 500.
2. **Comprobar que Resend envía de verdad en producción** (`RESEND_API_KEY`
   en Render). Hasta ahora el registro funcionaba sin correo. Desde ahora,
   sin correo nadie puede completarlo. Si los correos caen en spam, eso es
   `SCRUM-27`.
3. Después, `git push`.
