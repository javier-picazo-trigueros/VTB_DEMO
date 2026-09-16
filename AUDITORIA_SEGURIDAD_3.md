# Auditoría de seguridad 3 — estado de `main` tras el Sprint 1

**Fecha:** 16 sep 2026
**Alcance:** `main` en `b366810e`, 62 commits después de `3ab0eeff` (42 de Jaime, 19 de Dependabot, 1 de cierre de sprint).
**Método:** revisión estática del árbol completo más comprobación dinámica contra el backend en ejecución (`DB_CLIENT=postgres`, conectado a Supabase).

> **Actualización — 16 sep 2026, misma tarde.** Los tres hallazgos de mayor
> gravedad (C-1, A-1 y A-2) están **cerrados y verificados**, y cada uno lleva
> abajo el commit que lo cierra. Se añade A-3, detectado al arreglar C-1 y
> cerrado también. La rotación de la clave de Alchemy, que era el otro punto
> abierto, la hizo Javier por su cuenta.
>
> Lo que sigue abierto son las cuatro medias y las seis bajas.

Los hallazgos marcados **[CONFIRMADO EN EJECUCIÓN]** se han reproducido contra el servidor real; el resto son de lectura de código. La distinción importa: no es lo mismo "parece explotable" que "lo he explotado".

---

## Resumen

| Gravedad | Nº | Titular | Estado |
|---|---|---|---|
| 🔴 Crítica | 1 | Cualquiera en internet obtiene sesión de administrador sin credenciales | ✅ **Cerrado** `64e307e2` |
| 🟠 Alta | 1 | IDOR entre instituciones en 10 rutas de administración | ✅ **Cerrado** `aaa54be0` |
| 🟠 Alta | 1 | Hash bcrypt de la contraseña enviado al cliente | ✅ **Cerrado** `b1c89b5a` |
| 🟠 Alta | 1 | Credenciales y correos de cuentas demo en el bundle público | ✅ **Cerrado** `fae18e4b` |
| 🟡 Media | 4 | Resultados en vivo públicos, auditoría pública sin autenticar, registro público sin validar, políticas de contraseña incoherentes | ⚠️ Abiertos |
| ⚪ Baja | 6 | Exposición de metadatos, CSRF en refresh, rol en localStorage, dependencia vulnerable, afirmación de anonimato, código muerto | ⚠️ Abiertos |

**Las 10 regresiones que se pidió verificar siguen cerradas.** Lo grave es superficie nueva o preexistente no vista antes, no retrocesos.

---

# Parte 1 — Regresión: ¿siguen cerrados los arreglos anteriores?

| # | Control | Estado | Evidencia |
|---|---|---|---|
| 1 | Censo validado en `register-vote` | ✅ Cerrado | `backend/src/routes/elections.ts:628` — `SELECT election_id FROM election_voters WHERE election_id = ? AND user_id = ?`, con 403 si no está |
| 2 | Sin endpoints públicos que enumeren usuarios | ⚠️ Parcial | Login (`auth.ts:195`) y `forgot-password` (`auth.ts:676`) responden genéricamente ✅. Pero `registration.ts:51,61` sí enumera → **hallazgo M-3** |
| 3 | Ningún endpoint se salta auth según `NODE_ENV` | ✅ Cerrado | `NODE_ENV` solo aparece en cookies, helmet, rate limit y config. Ningún bypass condicional. *(Pero existe un bypass que no depende de `NODE_ENV` → **C-1**)* |
| 4 | CSRF global cubriendo admin y auth | ✅ Cerrado | `app.ts:179-202`, montado en línea 179 **antes** de todas las rutas (380-391). Cubre `/admin` y `/auth`. Verificado en ejecución: voto sin cabecera → `403 CSRF_MISMATCH` |
| 5 | Errores sin `err.message` al cliente | ✅ Cerrado | Único caso restante `elections.ts:692` y es un `VoteConflictError` tipado, con mensaje propio de la aplicación. No filtra interioridades |
| 6 | Token solo en cookie httpOnly | ✅ Cerrado | `auth.ts:45` `httpOnly: true`. Ningún token en `localStorage` ni en cuerpo de respuesta. `AuthContext.jsx:18,69` lo documenta |
| 7 | Rate limiting por usuario en el voto | ✅ Cerrado | `middleware/rateLimit.ts:125` `vote:user:${req.user?.userId}` + `app.ts:383` monta `requireAuth` **antes** del limitador, para que `req.user` exista |
| 8 | Sin claves privadas ni secretos en logs | ✅ Cerrado | Único `console.log` de entorno es `index.ts:73`, y es `CONTRACT_ADDRESS` (dato público) |
| 9 | Tokens de recuperación/invitación nunca en claro en `email_log` | ✅ Cerrado | `services/email/queue.ts:45-61` encola sin cuerpo; `link-emails.ts:91-112` emite el token al enviar; `CLEAR_BODIES` (`queue.ts:103`) vacía cuerpos al finalizar |
| 10 | Ids de elección desde `ElectionCreated`, no renumerados | ✅ Cerrado | `admin/elections.ts:153-159` inserta con `chain_status='pending'` e id 0; `scripts/syncElections.ts:153` lee el id del evento. La ruta que renumeraba está desactivada con 410 en `elections.ts:164` |

El refactor de `admin.ts` en cuatro routers **no perdió ninguna guarda**: las 28 rutas conservan `requireAdmin`, verificadas una a una.

---

# Parte 2 — Hallazgos

## 🔴 C-1 · Sesión de administrador sin credenciales desde internet

> ### ✅ CERRADO en `64e307e2`
>
> `POST /auth/demo-login` responde **404 salvo `DEMO_LOGIN_ENABLED=true`**, que
> en Render va sin definir. Se elimina además el `fallback: 'demo123'` que
> estaba escrito en el código, y por tanto en un repositorio público.
>
> **No** se exige la contraseña al cliente, y es deliberado: cualquier secreto
> que llevara un botón público acabaría en el bundle de JavaScript, que es justo
> de donde se sacó en su día (ver la cabecera de `DemoLoginModal.jsx`). Quien
> aporta la autorización es el operador del despliegue, no el navegador.
>
> **Verificado relanzando el exploit** contra el backend ya parcheado: los dos
> perfiles devuelven `404 DEMO_DISABLED`, sin emitir cookies, y el panel sin
> sesión responde 401. 3 tests nuevos cubren la puerta cerrada.
>
> El botón de demo sigue funcionando en local con la variable puesta.

**Archivo:** `backend/src/routes/auth.ts:241-253` (definición) y `:255-316` (endpoint)
**[CONFIRMADO EN EJECUCIÓN]**

`POST /auth/demo-login` **no pide contraseña a quien llama**. Recibe solo `{ profile }`, y el servidor saca la contraseña de su propio entorno:

```ts
const password = process.env[account.envVar] || account.fallback;   // auth.ts:267
```

El llamante nunca aporta un secreto. Basta con acertar el nombre del perfil, y sólo hay dos: `student` y `admin`.

Prueba realizada contra el backend en ejecución, sin ninguna credencial:

```
POST /auth/demo-login  {"profile":"admin"}
→ HTTP 200 · rol admin · adminDomain vtb.demo · cookies vtb_auth + vtb_csrf
→ GET /auth/me          → 200, rol admin
→ GET /admin/dashboard  → 200, 948 bytes de datos reales
```

**Por qué importa.** No hay ninguna barrera:

- No está limitado a desarrollo. `IS_PROD` (`auth.ts:28`) sólo se usa para `secure` y `sameSite` de las cookies (`:46,47,91,92,641`). **En ningún punto desactiva el endpoint.**
- Está **exento de CSRF** por diseño (`app.ts:177`), porque crea la sesión.
- El `loginLimiter` (`app.ts:377`) limita la frecuencia, no impide el éxito. Un intento basta.
- El perfil `student` ni siquiera necesita variable de entorno: tiene `fallback: 'demo123'` codificado (`auth.ts:247`).
- El perfil `admin` no tiene fallback, pero **eso no protege nada**: si `SEED_DEMO_ADMIN_PASSWORD` está definida en Render — y tiene que estarlo, porque el seed aborta sin ella — el servidor la lee solo y autentica.

Con esa sesión de admin se alcanza todo el panel, y encadenando con **A-1** (abajo) también las elecciones de instituciones ajenas.

La condición es que la cuenta demo exista en la base de producción. Existe: el seed se ejecutó contra la Supabase compartida el 15-sep.

**Cómo se cerró** (`64e307e2`): la ruta se niega a servir salvo que el despliegue lo pida explícitamente, y se elimina el `fallback: 'demo123'`.

```ts
// backend/src/routes/auth.ts, al principio del handler
if (process.env.DEMO_LOGIN_ENABLED !== 'true') {
  res.status(404).json({ error: '…', code: 'DEMO_DISABLED' });
  return;
}
```

Se lee en cada petición y no al cargar el módulo, para que los tests puedan alternar el valor por caso. La variable **no** se define en Render.

**Lo que sigue pendiente**, y es de diseño, no de código: lo correcto de verdad es que la demo viva en un despliegue aparte con su propia base, no en el mismo backend que las elecciones reales. Mientras compartan base, la única barrera es una variable de entorno bien puesta.

---

## 🟠 A-1 · IDOR entre instituciones: un admin puede operar elecciones de otro dominio

> ### ✅ CERRADO en `aaa54be0`
>
> Se añade `denyIfElectionOutOfScope()` en `admin/shared.ts`, con **exactamente**
> la condición del listado de `admin/elections.ts:77`, para que lo que un
> administrador puede modificar coincida con lo que puede ver. Responde **404 y
> no 403**: un 403 confirmaría que esa elección existe, y con ids correlativos
> eso es un inventario de las elecciones ajenas.
>
> **Eran diez rutas, no nueve.** Este informe excluyó `import-voters` por error,
> dando por buena su validación por fila: comprueba el dominio de *los correos
> que añade*, pero no el de *la elección*, así que permitía meter a tu propia
> gente en el censo de otra institución. La fila está añadida abajo.
>
> 21 tests nuevos que cubren las **dos** direcciones. Que el dueño legítimo siga
> pasando no es decoración: un guard que denegara a todo el mundo dejaría la
> suite igual de verde que uno correcto.

**Archivos y líneas:**

| Ruta | Archivo:línea | ¿Comprueba dominio? |
|---|---|---|
| `PUT /admin/elections/:id` | `admin/elections.ts:302` | ❌ No |
| `PATCH /admin/elections/:id` | `admin/elections.ts:329` | ❌ No |
| `POST /admin/elections/:id/image` | `admin/elections.ts:359` | ❌ No |
| `POST /admin/elections/:id/domains` | `admin/elections.ts:383` | ❌ No |
| `POST /admin/elections/:id/voters` | `admin/elections.ts:424` | ❌ No |
| `POST /admin/elections/:id/candidates` | `admin/elections.ts:467` | ❌ No |
| `GET /admin/elections/:id/stats` | `admin/election-census.ts:314` | ❌ No |
| `POST /admin/elections/:id/notify-open` | `admin/election-census.ts:397` | ❌ No |
| `POST /admin/elections/:id/notify-close` | `admin/election-census.ts:448` | ❌ No |
| `POST /admin/elections/:id/import-voters` | `admin/election-census.ts:32` | ❌ No — valida las filas, no la elección |

Todas toman `const { id } = req.params` y operan directamente sobre esa elección.

`requireAdmin` (`middleware/auth.ts:62-84`) sólo valida que el rol sea `admin` o `superadmin`. **No aplica ningún alcance por dominio** — eso es responsabilidad de cada ruta.

Y las rutas *de listado* sí lo hacen, lo que demuestra que la omisión no es intencionada:

- `GET /admin/elections` (`admin/elections.ts:70-79`) filtra por `election_access` según `getAdminDomain(req)`
- `GET /admin/users` (`admin/users.ts:52-57`) filtra por dominio del email
- `POST .../import-voters` (`admin/election-census.ts:65,93-95`) valida con `isSubDomain`
- `GET /admin/audit` (`admin/election-census.ts:214`) filtra

O sea: **el admin de la institución A ve sólo sus elecciones en la lista, pero puede modificar las de la institución B si adivina el id** — y los ids son enteros correlativos.

**Por qué importa.** El impacto no es leer, es escribir sobre un proceso electoral ajeno: cambiar candidatos, alterar `is_active` para abrir o cerrar la votación, meter votantes en el censo, añadir un dominio de correo entero al censo vía `/domains`, o disparar una notificación masiva por correo a los votantes de otra institución. En una plataforma multi-institución esto invalida el aislamiento que el resto del código se esfuerza en mantener.

**Cómo se cerró** (`aaa54be0`): `denyIfElectionOutOfScope(req, res, id)` en `admin/shared.ts`, invocado al principio de las **diez** rutas. Devuelve **404, no 403**: un 403 confirmaría que la elección existe, y con ids correlativos eso es un inventario de las elecciones ajenas.

Dos cosas que este párrafo daba por buenas y no lo eran. `import-voters` **no** servía de patrón: valida el dominio de cada fila del CSV, no el de la elección, así que era la décima ruta vulnerable, no el ejemplo a copiar. Y el patrón que sí se copió es la condición del listado de `admin/elections.ts:77`, para que lo que un administrador puede modificar coincida exactamente con lo que puede ver.

21 tests, en las dos direcciones.

---

## 🟠 A-2 · El hash bcrypt de la contraseña se envía al cliente

> ### ✅ CERRADO en `b1c89b5a`
>
> Lista explícita de columnas en lugar de la consulta comodín, y de paso se
> corrige el genérico de TypeScript, que ni siquiera coincidía con la tabla:
> declaraba `name` e `institution`, que no son columnas (son `full_name` y
> `org_unit`).
>
> La lista es la **intersección de los dos esquemas**, y eso importa:
> `approved_password` solo existe en SQLite (columna muerta) y `updated_at` solo
> en PostgreSQL. Una lista copiada de la migración habría funcionado en
> producción y fallado en los tests, y al revés.
>
> Las demás consultas comodín se revisaron una a una: las seis que llegan al
> cliente (`org_units`, `elections`, `schools_and_degrees`) **no tienen ninguna
> columna sensible hoy**. Se dejan — acotarlas es higiene, no seguridad.
>
> 4 tests que miran el JSON serializado y cualquier patrón `$2b$`, no solo las
> claves: si alguien vuelve a poner la consulta comodín, fallan.

**Archivos:** `backend/src/routes/admin/org.ts:315` y `:358`; mecanismo en `backend/src/db/postgres.ts:103-105`

```ts
let query = "SELECT * FROM registration_requests";        // org.ts:315  ← incluye password_hash
...
res.json({ requests: paginatedRequests, total, page, pageSize });   // org.ts:358
```

El tipo genérico de `db.run<{ id, email, name, ... }>` (`org.ts:351-355`) **no filtra nada**: es una anotación de TypeScript que desaparece al compilar. El cliente devuelve las filas tal cual:

```ts
async run<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await this.pool.query(toPositional(sql), params);
  return res.rows as T[];        // postgres.ts:181-182 — filas crudas, todas las columnas
}
```

Como `registration_requests` guarda `password_hash` (la contraseña que la persona eligió al solicitar el alta, ver `registration.ts:128-130`), **`GET /admin/registration-requests` entrega esos hashes a cualquier administrador autenticado**.

**Por qué importa.** Un hash bcrypt no es texto claro, pero tampoco es público: sacarlo del servidor permite crackeo offline sin límite de intentos ni rate limiting, contra contraseñas que — por **M-4** — pueden tener seis caracteres. Y la persona que las eligió probablemente las reutiliza en otros servicios. Encadenado con **C-1**, el atacante anónimo que obtiene sesión de admin se lleva también los hashes.

**Cómo se cerró** (`b1c89b5a`): lista explícita de columnas en lugar de la consulta comodín. La lista **no** se copió del tipo que había, porque ese tipo era falso: declaraba `name` e `institution`, que no son columnas de la tabla (son `full_name` y `org_unit`).

Corrección a lo que decía antes este párrafo: `org.ts:396` **no** merece el mismo tratamiento. Esa consulta alimenta el flujo de aprobación, que necesita `password_hash` internamente para reutilizar la contraseña que la persona eligió (`org.ts:415`). Acotarla rompería el alta. Su resultado no se serializa al cliente, así que no hay nada que arreglar ahí.

La lista es la intersección de los dos esquemas: `approved_password` solo existe en SQLite y `updated_at` solo en PostgreSQL. Copiarla de un solo motor habría fallado en el otro.

---

## 🟠 A-3 · Credenciales y correos de las cuentas demo en el bundle público

> ### ✅ CERRADO en `fae18e4b`
>
> Las dos listas van ahora tras `import.meta.env.DEV`, igual que ya hacía
> `Login.jsx:12,17`. Verificado reconstruyendo `dist`: `superadmin123`,
> `admin123` y `superadmin@vtb.system` pasan de estar presentes a **0**
> apariciones.

**Archivo:** `frontend/src/pages/InstitutionPortal.jsx:32-41`

Detectado al arreglar C-1, después de escribir la primera versión de este
informe. `ALL_VOTER_DEMOS` y `ALL_ADMIN_DEMOS` se declaraban **sin guarda de
entorno**, así que Vite se las llevaba enteras al bundle de producción: tres
contraseñas en texto plano y, peor, la dirección de `superadmin@vtb.system`, que
tiene `admin_domain` nulo y por tanto alcance global. `Login.jsx` sí usaba la
guarda; este fichero se quedó atrás.

**Por qué no era crítico.** Lo comprobé antes de calificarlo: las cinco parejas
de credenciales del bundle **están rechazadas** hoy contra la base real. Son
cadenas obsoletas — el seed las sustituyó por las de las variables `SEED_*`, y
`scripts/rotate-weak-admin-passwords.ts` existe justo para eso.

**Por qué importaba igualmente.** Un bundle público que enumera los correos
válidos de la plataforma, incluida la cuenta de superadministrador, es un mapa
para un ataque dirigido. Y las contraseñas volverían a ser válidas en el momento
en que alguien sembrara un despliegue con esos valores heredados.

Quedan dos apariciones de `demo123` en el bundle, de `RegisterRequest.jsx:134`:
son el autorrelleno de un formulario que crea una solicitud **nueva**, no la
credencial de una cuenta existente. No se tocan.

---

## 🟡 M-1 · Resultados en vivo, públicos y sin autenticar, durante la votación

**Archivo:** `backend/src/routes/elections.ts:388-489`

`GET /elections/:id/results` es pública (sin `requireAuth`) y **no restringe nada según el estado**. Calcula `status` en la línea 409 y lo devuelve como dato informativo, pero entrega el recuento por candidato igualmente:

```ts
candidates: candidatesWithVotes,      // :483  votos y porcentaje por candidato
totalVotes: realTotalVotes,           // :484
participationRate: ...                // :485
```

Con `status === 'active'`, cualquiera obtiene el escrutinio parcial en tiempo real.

**Por qué importa.** Es un problema de integridad electoral antes que técnico: publicar resultados parciales mientras se vota condiciona a quien aún no ha votado (efecto *bandwagon*), y en una votación pequeña permite además deducir el sentido del voto de la siguiente persona comparando dos consultas consecutivas. Ninguna normativa electoral seria lo permitiría.

**Coste de arreglo:** bajo. Devolver sólo participación agregada mientras `status !== 'closed'`, y el desglose por candidato al cerrar. Media docena de líneas, más la decisión de producto sobre si la participación en vivo se publica o no.

---

## 🟡 M-2 · Endpoint de auditoría público: lista completa de nullifiers con marca de tiempo

**Archivo:** `backend/src/routes/elections.ts:503-554`

Sin autenticación, devuelve para cada voto: `nullifier`, `txHash`, `blockNumber`, `timestamp`, `onChain`, `isDemo`.

**Aclaración importante, porque a primera vista parece peor de lo que es:** la consulta hace `JOIN users u` y selecciona `u.email` (`:527`), pero el `.map()` de `:535-551` **no lo incluye en la respuesta** — sólo lo usa para calcular `isDemo`. No hay fuga de correos. Está bien resuelto.

El problema es otro: publicar la secuencia ordenada de nullifiers con `generated_at` preciso, sin autenticar y sin límite de consultas. Con un censo pequeño y observación repetida, el orden temporal de los votos más cualquier señal externa (quién entró al centro, quién publicó algo) permite correlacionar. Es exactamente el vector que `AUDITORIA_BLOCKCHAIN.md:57` ya registra como BC-15 y `:588` describe.

**Por qué importa.** No rompe el anonimato por sí solo, pero es la materia prima que lo hace posible, y está servida a coste cero para cualquiera.

**Coste de arreglo:** bajo si se acepta reducir granularidad — redondear `timestamp` a la hora y barajar el orden dentro del bloque —, medio si se quiere exigir autenticación sin perder la verificabilidad pública que justifica el endpoint. Es una decisión de diseño, no un parche.

---

## 🟡 M-3 · El registro público no valida entrada y permite enumerar cuentas

**Archivo:** `backend/src/routes/registration.ts:13-63`

Es la **única ruta pública que no usa zod**. Lee `req.body` campo a campo con encadenados `||` (`:15-23`) y valida a mano:

- **Email:** `email.includes("@") && email.includes(".")` (`:34`). Acepta `a.@b`, entre otras cosas.
- **Contraseña:** `password.length < 6` (`:40`), sin complejidad.
- **`year`:** `parseInt(req.body.year)` sin rango ni comprobación de `NaN` (`:22`).
- **Enumeración de usuarios:**
  ```
  :51  409 "Ese email ya tiene una cuenta activa"
  :61  409 "Ya tienes una solicitud de registro pendiente"
  :133 200 "Solicitud enviada correctamente"
  ```
  Tres respuestas distinguibles. Cualquiera puede comprobar si un correo concreto tiene cuenta en la plataforma, y de paso si tiene solicitud pendiente. Contrasta con el cuidado de `forgot-password` (`auth.ts:676`), que responde genéricamente a propósito.
- **Mayúsculas inconsistentes:** la comprobación de existencia usa `email` crudo (`:48`) y la de whitelist usa `email.toLowerCase()` (`:69`). El `UNIQUE` de la tabla es sobre `TEXT` (`migrations/20260808000001_initial_schema.cjs:24`), que en PostgreSQL distingue mayúsculas. `Ana@x.edu` y `ana@x.edu` son dos cuentas distintas para la base y la misma para una persona.

Nota a favor: la ruta **sí** está limitada en frecuencia (`app.ts:390`, `registerLimiter`), lo que atenúa la enumeración masiva pero no la dirigida.

**Por qué importa.** Es la puerta de entrada pública del producto y la menos defendida. La enumeración, en un contexto universitario, revela quién está dado de alta en un censo electoral.

**Coste de arreglo:** bajo. Un `registrationSchema` de zod al estilo de los que ya existen en `auth.ts:35-40`, normalizar el email a minúsculas en un único punto, y unificar las tres respuestas en una sola genérica. Media hora, y conviene hacerlo junto con M-4.

---

## 🟡 M-4 · Cuatro políticas de contraseña distintas conviviendo

| Dónde | Mínimo | Archivo:línea |
|---|---|---|
| Registro público | 6 | `registration.ts:40` |
| Cambio de contraseña | 6 | `auth.ts:460` |
| Registro autenticado | 8 | `auth.ts:37` |
| Reset por token | 8 | `auth.ts:657` |

Ninguna exige complejidad ni comprueba contraseñas filtradas.

**Por qué importa.** El mínimo real de la plataforma es el más débil de los cuatro, no el más fuerte: da igual que el reset exija 8 si por el registro público se entra con 6. Y agrava **A-2**: hashes exportables de contraseñas de seis caracteres se rompen en minutos.

Jaime ya lo identificó y lo tiene planificado como `SCRUM-21` (ver `PROGRESO_PLAN.md`, Fase 2). Lo recojo aquí porque su interacción con A-2 lo hace más urgente de lo que parecía por separado.

**Coste de arreglo:** bajo. Una constante compartida y un validador zod único importado en los cuatro sitios.

---

## ⚪ B-1 · Metadatos de todas las elecciones, sin autenticar

`backend/src/routes/elections.ts:124-153`. `GET /elections/blockchain-sync-status` devuelve id, nombre, estado de cadena, `txHash` e intentos de **todas** las elecciones de la plataforma, sin filtro de dominio ni autenticación. El comentario de `:139` muestra que se pensó en el tema (excluye `chain_error`), pero los nombres de elecciones aún no anunciadas y el inventario completo entre instituciones siguen expuestos. *Arreglo: exigir `requireAuth` y filtrar por dominio; bajo.*

## ⚪ B-2 · `/auth/refresh` exento de CSRF

`backend/src/app.ts:177`. Está en `CSRF_EXEMPT_PATHS` junto a los dos logins. A diferencia de ellos, refresh **sí** opera sobre una sesión existente: un sitio de terceros puede forzar la rotación del token de un usuario conectado. El impacto es molestia, no toma de control, porque el atacante no lee la respuesta. *Arreglo: sacarlo de la lista y que el frontend mande la cabecera; bajo, pero verificar que no rompe el flujo de reintento de `apiClient.js`.*

## ⚪ B-3 · Objeto de usuario (con el rol) en `localStorage`

`frontend/src/pages/Dashboard.jsx:194`, `UserProfile.jsx:323`, `OnboardingTour.jsx:9-12`. **No hay ningún token ahí** — eso está bien y documentado (`AuthContext.jsx:18,69`). Pero se guarda `vtb-user` con el rol y se usa como *fallback* para decidir qué pinta la interfaz. Manipularlo sólo engaña a la interfaz; el servidor revalida el rol contra la base en `middleware/auth.ts:80-84`. Es higiene, no un agujero. *Arreglo: leer el rol sólo de `AuthContext`; bajo.*

## ⚪ B-4 · Dependencia vulnerable: `fflate` (moderada)

`npm audit` del frontend: `fflate` 0.8.2, vía `jspdf@4.2.1` (cadena confirmada con `npm ls fflate`). GHSA-px8p-9vwx-vf98: bucle infinito al procesar ZIP64 malformados con `unzipSync`. **La aplicación no descomprime nada aportado por el usuario** — sólo genera PDF de resultados (`ElectionResults.jsx:104`) —, así que el camino vulnerable no se alcanza. El backend está a **0 vulnerabilidades**. *Arreglo: `npm audit fix` cuando jspdf publique; ninguno urgente.*

## ⚪ B-5 · Afirmación de anonimato sin matizar

`ARCHITECTURE.md:3`: *"VTB is a hybrid Web2+Web3 application for **anonymous**, auditable institutional voting."*

**Es la única afirmación no cualificada que queda en todo el repositorio**, y contradice al propio `README.md:690-699`, que explica con precisión que la anonimia es *operacional* y que `nullifier_audit` guarda la relación entre persona y elección. *Arreglo: una línea.*

## ⚪ B-6 · Código muerto con vocabulario engañoso

`frontend/src/components/VoteModal.jsx:99` renderiza `receipt.receipt.anonymous_credential`. El componente **no se importa desde ningún sitio** (comprobado: las únicas referencias a `VoteModal` están en su propio fichero, líneas 2, 18 y 239), así que no llega a ningún usuario. Ya estaba registrado en `AUDITORIA_2.md:131`. *Arreglo: borrar el fichero; trivial.*

---

# Parte 3 — Anonimato: ¿se ha reintroducido alguna afirmación?

**No.** Comparados el árbol previo y `main`, el recuento de menciones es idéntico: `VoteModal.jsx` 1, `i18n/config.ts` 6, `VotingBooth.jsx` 2. Los 62 commits no añadieron ninguna.

Revisado el texto que hay, en ambos idiomas, en interfaz, correos y PDF:

| Ubicación | Texto | Veredicto |
|---|---|---|
| `i18n/config.ts:134,756` | "One Person, One Vote" / "Un voto por persona" — describe el nullifier HMAC | ✅ Correcto. La *clave* se llama `anonymity`, el contenido no lo afirma |
| `i18n/config.ts:397,1018` | "They do not identify you **on-chain**" / "No identifican al votante **en la cadena**" | ✅ Preciso, y la matización es justo la correcta |
| `i18n/config.ts:429,1047` | "prevents voting more than once" | ✅ Habla sólo de doble voto |
| `services/email/templates.ts` | — | ✅ Ninguna afirmación de anonimato en las cinco plantillas |
| `ElectionResults.jsx:104-303` (PDF) | Resultados agregados | ✅ Sin identidades |
| `ARCHITECTURE.md:3` | "for anonymous ... voting" | ❌ Ver **B-5** |

Y en la dirección contraria, vale la pena registrarlo: el `PROGRESO_PLAN.md` que Jaime añadió lista *"El voto no es anónimo de verdad"* como **pendiente**, señalando que `nullifier_audit` guarda `user_id` y `candidate_id` en la misma fila. Está documentando el problema, no maquillándolo.

---

# Parte 4 — Superficie nueva de los 62 commits

**Los cuatro routers nuevos de administración.** Las 28 rutas llevan `requireAdmin`, verificado línea a línea. Ninguna quedó sin guarda al partir el fichero. El alcance por dominio, en cambio, estaba incompleto: presente en los listados y en `audit`, ausente en las **diez** rutas de **A-1**. `import-voters` parecía cubierto y no lo estaba: validaba el dominio de cada fila del CSV, no el de la elección. Conviene notar que esa carencia **es anterior** al refactor — se heredó del `admin.ts` original —, pero el refactor era el momento natural de detectarla. Cerrado en `aaa54be0`.

**Rutas nuevas sin autenticación.** Ninguna. El inventario completo de rutas públicas (`elections` 124/183/388/503/881, `auth` register/login/demo-login/verify/refresh/logout/forgot/reset, `registration` request, `organizations :domain`) coincide con el de antes del sprint.

**Consultas sin parametrizar.** Ninguna explotable. Los seis puntos con interpolación son todos seguros, revisados uno a uno:

| Punto | Por qué es seguro |
|---|---|
| `admin/elections.ts:224` | `conditions` son literales de código; los valores van por `?` |
| `admin/elections.ts:316` | `sets` son literales fijos; los valores por `?` |
| `admin/org.ts:31,35` | `dw` es una de dos cadenas constantes |
| `admin/org.ts:344` | `baseTable` es la constante `'registration_requests'` (`:341`) |
| `admin/users.ts:71` | `where` se compone de literales; parámetros aparte |
| `email/queue.ts:331,366` | `CLEAR_BODIES` es `const` de código (`:103`) |

**Datos devueltos de más.** Un caso: **A-2**. El resto de `SELECT *` (`elections.ts:209`, `admin/elections.ts:72,333`, `admin/org.ts:132`) no llegan crudos al cliente — `elections.ts:267-287` demuestra el patrón correcto, una lista blanca explícita de campos.

**Dependencias nuevas.** Backend a 0 vulnerabilidades tras el salto a Express 5 y `node-pg-migrate` 9. Frontend con la moderada de **B-4**. Entran paquetes nuevos por el cambio de bundler de Vite 8 (`rolldown`, `@rolldown/binding-win32-x64-msvc`, `lightningcss`, `@oxc-project/types`) y por i18next 26 (`qified`, `hookified`, `cacheable`, `keyv` 5). Ninguno con aviso de seguridad. Merece registrarse que Rolldown sustituye a Rollup en la cadena de construcción: es un compilador nuevo en el camino crítico del artefacto que se despliega.

---

# Parte 5 — Recomendación de orden

### Ya cerrado

| | Hallazgo | Commit |
|---|---|---|
| 🔴 | **C-1** — sesión de administrador sin credenciales | `64e307e2` |
| 🟠 | **A-1** — IDOR entre instituciones, diez rutas | `aaa54be0` |
| 🟠 | **A-2** — hash bcrypt al cliente | `b1c89b5a` |
| 🟠 | **A-3** — credenciales demo en el bundle | `fae18e4b` |
| — | **Rotar la clave de Alchemy** (`SCRUM-34`/`35`) | Hecho por Javier, fuera del repo |

Estado tras esos cambios: **183 tests en verde**, typecheck limpio, y C-1
verificado relanzando el exploit contra el backend parcheado.

### Lo que queda, por orden

1. **M-3** y **M-4** juntos: comparten el validador, y M-4 agrava lo que fue
   A-2 — mientras el registro público admita seis caracteres, cualquier hash
   que se escape se rompe en minutos.
2. **M-1** y **M-2** requieren una decisión de producto antes que código:
   cuánto se publica durante la votación y con qué granularidad.
3. Las ⚪ bajas, cuando toque. **B-5** es una línea y contradice al propio
   README, así que es la más barata de todas.

Aparte del bloque de arriba, este informe sigue siendo diagnóstico: las medias
y las bajas están descritas, no arregladas.
