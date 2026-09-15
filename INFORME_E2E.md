# Informe end-to-end sobre Supabase

**Fecha:** 15 de septiembre de 2026
**Entorno:** backend local (`tsx src/index.ts`) contra **Supabase PostgreSQL 17**
(proyecto `pxqejrptikoqoaokoqaq`, pooler `aws-1-eu-central-1:5432`), frontend
`vite` en 5173, navegador **Chromium real vía Playwright**.
**Método:** recorrido clicando la interfaz, con captura de consola del navegador y
de respuestas HTTP. Nada deducido del código: lo que va abajo se observó usando la
aplicación. Las referencias a fichero:línea se añadieron *después*, para localizar
la causa de lo ya observado.

El recorrido original no arregló nada. Los arreglos posteriores están en la sección siguiente.

---

## ⮕ Estado tras los arreglos (15-sep-2026, segunda ronda)

Los seis fallos pedidos, en orden, con build y tests entre cada uno. Suite del
backend final: **124 tests**, todos en verde. Cada arreglo se verificó además en
navegador real (Playwright/Chromium).

| Fallo | Estado | Verificación en navegador |
|---|---|---|
| **R3** Cerrar sesión | ⚠️ **No era un fallo: falso positivo de este informe** | El botón `Cerrar sesión` ya existía en el menú de usuario. `POST /auth/logout` → 200, las tres cookies borradas, `/dashboard` rebota a `/login` |
| **R6** Banner tapa el botón de demo | ✅ Arreglado | 5/5: el botón se pulsa con el banner visible y los botones del banner siguen funcionando |
| **R1** 401 del login de demo | ✅ Arreglado | 10/10: votante → `/dashboard`, administrador → `/admin`, sin 401 |
| **C1** "Registrado en la blockchain" en cuentas demo | ✅ Arreglado | 10/10: la API devuelve `onChain:false, isDemo:true` y la pantalla dice que es un hash sintético |
| **R5** `/health` con la base caída | ✅ Arreglado | Base que rechaza: 503 en 0,02 s · base que se cuelga: 503 en 3,02 s · Supabase: 200 |
| **R2** Errores del CSV en la interfaz | ✅ Arreglado | 9/9: panel persistente con "Línea 3" y "Línea 4" |
| **R4** Recuperación de contraseña | ✅ Arreglado | 18/18, con token real en entorno aislado |

### Correcciones a este informe

- **R3 era un falso positivo.** El botón de cerrar sesión existía. En el recorrido
  original, el overlay del tour de bienvenida (`react-joyride`, z-index 9999)
  interceptó el clic sobre el menú de usuario, así que el desplegable no se abrió y
  no llegué a ver su contenido. Lo que sí es real es C6: el tour bloquea toda la
  pantalla hasta que se cierra.
- **R2 tenía un matiz.** Decía que "no aparece absolutamente nada". No es exacto: sí
  aparecía un aviso con el mensaje genérico, **a los 280 ms, y desaparecía a los
  5,3 s** (medido). Yo miraba la pantalla 7 s después de subir el fichero. Lo que
  faltaba de verdad eran los números de línea, que el backend devuelve y nunca se
  mostraban.

### Cómo se arregló cada uno

- **R6** — `pointer-events-none` en la franja de ancho completo del banner y
  `pointer-events-auto` en su tarjeta. No se ha tocado ningún z-index: el problema
  era que la franja capturaba los clics también en las zonas vacías.
- **R1** — Nuevo endpoint `POST /auth/demo-login`. Las contraseñas de demo salen del
  mismo entorno que usa el seed y ya no están en el bundle; antes, además, **el modal
  las mostraba en pantalla**. Restricciones: lista cerrada de dos cuentas `@vtb.demo`,
  no acepta ningún email del cliente, devuelve 404 si la variable `SEED_*` no está
  definida, comprueba contra el hash como un login normal, y tiene el mismo rate limit
  y la misma exención CSRF que `/auth/login`. Se corrigió también el `if (ok)` que
  navegaba aunque el login fallase.
- **C1** — `/eligibility` devuelve `onChain` e `isDemo`, calculados con el mismo
  criterio que `/audit` (`block_number` presente y cuenta no demo). La pantalla elige
  el texto según esos campos, y el comprobante usa ahora i18n: antes estaba en inglés,
  escrito a mano.
- **R5** — `SELECT 1` con tiempo máximo (`HEALTH_DB_TIMEOUT_MS`, 3 s por defecto).
  El 503 no incluye el mensaje de error, que puede llevar host o usuario.
- **R2** — Panel de errores persistente en el panel de administración, visible desde
  cualquier pestaña, que se limpia al cerrarlo o tras una importación correcta.
- **R4** — `/forgot-password`, `/auth/reset-password` y `/auth/set-password` (las dos
  últimas, literalmente las que ya envían los correos), y enlace en el login. Todos los
  campos con `<label for>`.

### Incidentes y hallazgos de esta ronda — importante

1. **La suite de tests se ejecutó contra Supabase.** `setup.ts` no forzaba SQLite y
   `dotenv` cargó el `.env` con `DB_CLIENT=postgres`. El `beforeAll` volvió a sembrar
   la base real con las contraseñas de test, **que están en un repo público**, sobre
   `admin@vtb.demo`, `superadmin@vtb.demo` y `superadmin@vtb.system`. Arreglado en
   `setup.ts` y verificado comparando los recuentos de Supabase antes y después de una
   ejecución completa: no cambió nada. Las contraseñas se restauraron.
2. **`npm run seed` borra datos.** `runSeedScript` (seedDatabase.ts:422) elimina
   usuarios, elecciones, candidatos, censo y votos **si ya existe algún usuario**, a
   pesar de que la cabecera del fichero dice que es idempotente. Al restaurar las
   contraseñas **vacié y recreé el conjunto de datos de Supabase** (solo había datos
   de prueba). Peor: `DESPLIEGUE_RENDER.md` y `MIGRACION_POSTGRES.md` recomendaban
   `npm run seed && node dist/index.js` como *start command* de Render, lo que
   **borraría el censo y los votos en cada despliegue**. Ambos documentos están
   corregidos. **Resuelto después:** `npm run seed` aborta con código 1 si ya hay
   usuarios, y borrar exige `npm run seed:reset` (o `--reset`). El `README.md` y las
   dos guías describen ya el comportamiento nuevo.
3. **Uno de mis guards de test era vacío.** El que busca booleanos 0/1 tenía la regex
   escrita en un template literal con barras simples (la secuencia de escape de la b se convertía en un carácter de retroceso) y no podía
   coincidir con nada. Corregido y comprobado con una sonda: detecta un
   `is_active = 1` plantado y pasa sin él.
4. **P1-7 sigue abierto.** Los tokens de recuperación e invitación quedan **en claro**
   en `email_log` (`html_body`/`text_body`). Confirmado con el flujo real de
   recuperación en una base aislada. Quien lea esa tabla puede cambiar la contraseña de
   cualquier usuario con un correo pendiente.

---

## Lo que funciona

Conviene decirlo antes, porque es bastante:

- **Conexión a Supabase**, sin ningún fallback silencioso a SQLite. El arranque dice
  `✅ Usando PostgreSQL como motor de BD` y monta el job que solo existe en
  `PgClient`. El `vtb.db` local no se tocó.
- **Seed completo** sin un solo fallo de traducción SQLite→PostgreSQL: 5 usuarios,
  5 elecciones, 11 candidatos, 11 filas de censo.
- **Registro** de usuario nuevo y rechazo del duplicado.
- **Login** y dashboard con las elecciones del votante.
- **Voto completo**: selección → diálogo de confirmación → comprobante en ~16 s,
  con hash y aviso de que es un hash de demostración.
- **Doble voto bloqueado**: "Ya has votado en esta elección".
- **Resultados** con porcentajes y participación.
- **Importación de CSV correcta**: "Usuarios importados: 2 creados, 0 omitidos".
- **Rollback del CSV con fila mala, verificado en la base**: 0 usuarios `csvmal-*`,
  0 tokens de invitación huérfanos, y los 2 de la importación buena intactos.
- El **diálogo de confirmación del voto** está bien escrito: *"Una vez emitido, tu
  voto no puede modificarse ni retirarse. Esta acción es permanente."*

---

## ROTO

### R1 · El botón de demo de la portada no funciona, para ninguno de los dos perfiles

Es el primer botón que pulsa cualquiera a quien enseñéis la URL.

| Qué esperaba | Qué pasó |
|---|---|
| Entrar como votante de demostración | `POST /auth/login` → **401**, aterrizo en `/login?reason=expired` |
| Entrar como administrador de demostración | Idéntico: **401** y `/login?reason=expired` |

**Sin ningún mensaje de error.** El visitante acaba en una pantalla de login que le
dice que su sesión caducó, sin haber tenido sesión nunca.

Causa: [DemoLoginModal.jsx:11](frontend/src/components/DemoLoginModal.jsx#L11) y
[:20](frontend/src/components/DemoLoginModal.jsx#L20) llevan `demo123` y `admin123`
escritos a mano, pero el seed exige las variables `SEED_*`. Además
[DemoLoginModal.jsx:40](frontend/src/components/DemoLoginModal.jsx#L40) comprueba
`if (ok)` sobre el objeto `{success,user}` que devuelve `login()` — siempre cierto —
así que navega igualmente y es `ProtectedRoute`
([App.jsx:44-46](frontend/src/App.jsx#L44-L46)) quien rebota al login.

### R2 · La interfaz se traga los errores del CSV

El backend hace **exactamente lo correcto**:

```json
400 {"success":false,
     "error":"El fichero tiene errores. No se ha importado nada.",
     "errors":["Línea 3: faltan email, full_name o student_id",
               "Línea 4: faltan email, full_name o student_id"],
     "totalRows":3}
```

Y en pantalla **no aparece absolutamente nada**: medí el texto del `body` antes y
después de la subida y el diferencial es la cadena vacía. Cero toasts, cero alertas.

El administrador sube un censo con una fila mal formada y no ocurre nada visible:
no sabe si se importó, si falló, ni qué línea corregir. Es el peor tipo de fallo —
silencioso — sobre la operación más delicada del panel.

Sitio a mirar: el manejador de `users/import` en
[AdminPanel.jsx](frontend/src/pages/AdminPanel.jsx), que no contempla el 400 nuevo.

### R3 · No hay forma de cerrar sesión desde la interfaz

Enumeré **todos** los elementos interactivos visibles del dashboard y de `/profile`.
El desplegable de usuario contiene un único elemento: `Ver perfil →`. En `/profile`
los botones son `← Volver`, `Perfil`, `Seguridad`, `Actividad`, `Editar` y
`Reiniciar guía de bienvenida`. **Ningún "Cerrar sesión" en ninguna de las dos.**

Matiz honesto: el clic sobre `AF Alex Ferrer` daba timeout por intercepción, así que
no descarto que el desplegable tenga más elementos que no llegaron a renderizarse.
Pero por enumeración de lo visible, no hay salida.

### R4 · Las cuatro rutas de recuperación de contraseña dan 404

Probadas una a una en el navegador:

```
/auth/reset-password?token=abc  → 404
/auth/set-password?token=abc    → 404
/forgot-password                → 404
/reset-password                 → 404
```

Y **el login no tiene enlace de "he olvidado mi contraseña"**, ni en el selector de
portal ni en el formulario. El endpoint `POST /auth/forgot-password` existe y está
bien hecho, pero no hay forma de llegar a él ni de usar el enlace que envía.

### R5 · `/health` devuelve 200 con la base de datos caída

Con la `DATABASE_URL` apuntando a un host inalcanzable:

```
GET /health      → 200 {"status":"OK","uptime":42.6}
GET /api/stats   → 500
POST /auth/login → 500
```

[app.ts:211-217](backend/src/app.ts#L211-L217) no consulta la base. En Render, un
despliegue con la cadena de conexión mal puesta se pone **verde** y sirve 500 a todo
el mundo sin que la plataforma lo detecte.

### R6 · El banner de cookies tapa el botón flotante de demo

El banner es `fixed bottom-0 z-50`
([CookieBanner.jsx](frontend/src/components/CookieBanner.jsx)) y el botón de demo
`fixed bottom-5 right-5 z-40`
([DemoModeButton.jsx:11](frontend/src/components/DemoModeButton.jsx#L11)).

Playwright reintentó el clic 60 veces durante 30 s: *"div role=region aria-label=
Aviso de cookies y almacenamiento intercepts pointer events"*. Un visitante nuevo
**no puede pulsar el botón de demo** hasta que acepte o rechace las cookies.

---

## FUNCIONA PERO CONFUNDE

### C1 · Le dice al votante que su voto está en la blockchain cuando no lo está

Tras votar con una cuenta `@vtb.demo`, la pantalla muestra:

> "Ya has votado en esta elección — **Tu voto ha sido registrado en la blockchain**"

Es falso: esa cuenta toma el atajo sintético
([elections.ts:667-687](backend/src/routes/elections.ts#L667-L687)) y el hash no
existe en Sepolia. El comprobante inmediato **sí** avisa ("Demo Hash", "no está en
la blockchain real"), pero la pantalla de "ya votaste" afirma lo contrario. Dos
mensajes contradictorios sobre lo único que el proyecto promete.

### C2 · "Tu sesión ha caducado" a quien nunca tuvo sesión

Cualquier rebote de `ProtectedRoute` lleva a `/login?reason=expired`
([App.jsx:45](frontend/src/App.jsx#L45)), que muestra ese mensaje. Es lo que ve
quien pulsa el botón de demo (R1) y quien entra directo a `/dashboard`.

### C3 · Mezcla de idiomas en la misma pantalla

Registro: etiquetas en español, marcadores de posición en inglés
(`e.g. John Smith`, `you@university.edu`, `Min. 6 characters`), botón
`📤 Enviar Solicitud`, y confirmación **`Request submitted`**. En resultados, el
botón es `📄 Export PDF` dentro de una interfaz en español.

### C4 · Faltan tildes en textos visibles

En el selector de login: **"Administracion"**, *"consulta estadisticas de tu
institucion"*, y *"Usuario nuevo?"* sin la apertura `¿`.

### C5 · El botón de resultados se llama "Parcial"

En el dashboard, el botón que lleva a los resultados está etiquetado `Parcial` para
elecciones activas. Tardé tres intentos en encontrarlo buscando "Resultados". Un
votante no va a asociar "Parcial" con "ver cómo va".

### C6 · El tour de bienvenida bloquea toda la pantalla

Al entrar por primera vez, `react-joyride` monta un overlay de `z-index: 9999` que
cubre 918 px e intercepta todos los clics. Es el comportamiento normal de un tour,
pero: su botón de cierre es una **"×" sin texto** (solo `aria-label="Cerrar"`), y
mientras esté abierto nada más de la página responde.

### C7 · Ningún campo de formulario tiene `id`

Medido en las dos pantallas que recorrí:

| Formulario | Campos | Con `id` |
|---|---|---|
| Registro | 5 | **0** |
| Crear elección | 8 | **0** |

Sin `id` no hay `<label for>` posible. Una persona con lector de pantalla no puede
rellenar ninguno de los dos. Es el hallazgo P1-19 de AUDITORIA_2, ahora confirmado
usando la aplicación.

### C8 · Emojis como iconos en todo el panel

Las seis pestañas son `📊 Dashboard`, `📬 Solicitudes`, `👥 Usuarios`,
`🗳️ Votaciones`, `📈 Estadísticas`, `🔐 Auditoría`. Es la pantalla que verá el
secretario de un comité electoral.

---

## Lo que NO llegué a probar

Por honestidad, esto queda pendiente:

- **Aprobar y rechazar** una solicitud desde la interfaz. Vi los botones
  (`✓ Aprobar`, `✗ Rechazar`) y la solicitud listada, pero no llegué a pulsarlos.
- **Exportar resultados**: existe `📄 Export PDF`, no comprobé que el fichero se
  genere.
- **Cerrar una elección** desde el panel.
- **Crear la elección hasta el final**: abrí el formulario y enumeré sus 8 campos,
  pero no lo envié.

---

## Nota sobre el entorno

Tres cosas de configuración que tuve que resolver para poder arrancar:

1. `DATABASE_URL` estaba **duplicada** en `.env` (primero `./vtb.db`, luego
   Supabase). `dotenv` se queda con la última, así que funcionaba, pero es una
   trampa. Comenté la vieja.
2. Apuntaba al **host directo** `db.<ref>.supabase.co`, que resuelve **solo a
   IPv6** → `ENOTFOUND`. Lo cambié al pooler **`aws-1-eu-central-1`** (no `aws-0`,
   que es lo que te dije antes: me equivoqué).
3. Faltaban las variables `SEED_*`, sin las cuales el seed aborta. Las generé y
   están en `.env`. Copia de seguridad del original en `backend/.env.bak-*`.

Y un detalle: el `28P01` que viste al primer arranque era **propagación de la
contraseña recién cambiada**, exactamente como sospechabas. Desapareció solo.
