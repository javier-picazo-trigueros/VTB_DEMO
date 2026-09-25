# Para Javier: tareas pendientes del Sprint 2

**De:** Jaime · **Fecha:** 25 sep 2026
**Contexto completo:** [`SPRINT_2_JAIME.md`](SPRINT_2_JAIME.md)

Hay cinco cosas que solo puedes hacer tú, porque tienes los accesos a
producción. Van en orden: las dos primeras desbloquean el despliegue del
registro nuevo.

| # | Tarea | Tiempo | Bloquea |
|---|---|---|---|
| 1 | Aplicar las migraciones 014 y 015 en producción | 10 min | El despliegue de SCRUM-123 |
| 2 | Comprobar que el correo sale en producción | 5 min | El despliegue de SCRUM-123 |
| 3 | Darme acceso a Supabase y Render | 10 min | Que la próxima vez no dependa de ti |
| 4 | Revisar los cambios que tocan tu código | 30 min | Nada, pero conviene antes de seguir |
| 5 | SCRUM-17, opción A | Unos días | Nada inmediato |

**Estado de lo que he subido:**
- En `main`, ya desplegado, están los dos arreglos que no necesitan migración:
  el panel ya no deja saber qué votó cada persona (`954b94c8`), y los
  resultados no se publican hasta la fecha de fin (`a30e3c80`, SCRUM-16).
- En la rama `JaimeOrdovas`, sin desplegar, está todo lo demás, incluida la
  migración 015 y el registro con confirmación por correo (`dd3c5332`,
  SCRUM-123).

---

## 1. Migraciones 014 y 015 en producción

**Qué son.**
- La **014** crea la tabla `admin_action_log`, el registro de acciones de
  administrador de SCRUM-20. Está en `main` desde el 24-sep, pero nadie la ha
  aplicado: hasta entonces el registro no guarda nada y su pestaña del panel da
  error.
- La **015** añade tres columnas a `registration_requests` y el estado
  `unverified`, para el registro con confirmación por correo de SCRUM-123.

**Por qué antes de desplegar.** Si el código de SCRUM-123 llega a producción
sin la 015, PostgreSQL rechaza el estado nuevo y cada intento de registro da
500.

**Por qué no hay riesgo.** Las dos solo añaden cosas. El código que está hoy
en producción funciona igual con ellas aplicadas, así que no importa cuánto
tiempo pase entre aplicarlas y desplegar.

**Pasos**

1. Ponte en la versión de mi rama que está en GitHub, que es la que tiene el
   fichero de la 015:
   ```
   git fetch origin
   git switch --detach origin/JaimeOrdovas
   cd backend
   npm ci
   ```
   Va con `--detach` a propósito. Si en tu ordenador hubiera una
   `JaimeOrdovas` antigua, `git switch JaimeOrdovas` te llevaría a esa y no a
   la de GitHub; a mí me pasó. Así vas directo a la de GitHub. Git te dirá
   "detached HEAD": es normal, solo vas a lanzar las migraciones.
2. En Supabase, en el **SQL Editor**, mira qué hay aplicado:
   ```sql
   SELECT name FROM pgmigrations ORDER BY id;
   ```
   Lo esperado es que la última sea `20260924000013_retention_jobs`. Si no lo
   es, para y avísame.
3. Avísame de que vas a migrar, para que nadie lo haga a la vez.
4. Lanza las migraciones con la dirección de producción puesta solo para esta
   ventana de terminal. Nunca en el `.env`.

   En PowerShell:
   ```
   $env:DATABASE_URL = "postgresql://...la de producción..."
   npm run migrate
   Remove-Item Env:DATABASE_URL
   ```
   En bash:
   ```
   DATABASE_URL="postgresql://...la de producción..." npm run migrate
   ```
   Tiene que terminar con `Migrations complete!`. Si sale un error, no lo
   reintentes: pásamelo. Nunca `npm run migrate:down` contra producción.
5. Repite la consulta del paso 2. Las dos últimas filas deben ser:
   ```
   20260924000014_admin_action_log
   20260925000015_registration_email_verification
   ```
6. Vuelve a tu rama:
   ```
   git switch JavierPicazo
   ```

Las dos migraciones están probadas contra un PostgreSQL 17 limpio en Docker:
subida, bajada y vuelta a subir, más el recorrido completo de la aplicación
encima.

---

## 2. Comprobar que el correo sale en producción

Hasta ahora el registro funcionaba sin correo. Con SCRUM-123, la cuenta no se
crea hasta que se abre el enlace que llega por email: **sin correo, nadie puede
registrarse.**

1. En Render, en el servicio del backend, pestaña **Environment**, deben existir
   `RESEND_API_KEY` y `RESEND_FROM`.
2. En la web de producción, pide recuperar la contraseña de tu propio email. Si
   el correo llega en un par de minutos, funciona. Si llega a spam también
   vale: eso se arregla en SCRUM-27.
3. Si no llega, avísame. En ese caso no desplegamos SCRUM-123 hasta arreglarlo.

**Cuando 1 y 2 estén bien, escríbeme.** Yo subo el resto a `main` y pruebo el
registro con un correo real.

---

## 3. Darme acceso

Todo lo de producción depende hoy de que estés tú disponible. Con acceso
propio puedo aplicar migraciones, mirar variables y revisar despliegues sin
esperarte. Da el rol mínimo que sirva, no el de propietario.

| Servicio | Qué hacer | Para qué lo necesito |
|---|---|---|
| **Supabase** | Invitarme como miembro del proyecto (Organization, Team, Invite), con rol Developer | SQL Editor, ver el estado de la base y los avisos del linter |
| **Contraseña de la base** | Pasármela por un canal privado: en persona, o un gestor de contraseñas compartido. Nunca por chat, email ni issue | Lanzar migraciones desde mi ordenador. Supabase no la muestra en el panel, ni a los miembros |
| **Render** | Invitarme al workspace (Workspace settings, Members) | Ver variables, logs y despliegues del backend |
| **Vercel** | Invitarme al equipo, si el plan lo permite (el plan gratuito Hobby no admite miembros) | Ver despliegues del frontend |
| **Resend** | Invitarme al equipo | Ver si los correos salen o rebotan |
| **Alchemy** | Invitarme al equipo | Ver el consumo del RPC y rotar la clave si hace falta |

**Lo que NO hay que compartir:**
- **La clave del owner del contrato.** Es la clave fría y tiene que seguir
  custodiada por separado (`CLAUDE.md`, BC-05). No la necesito para nada de
  esto.
- **Nadie debe pulsar "Reset database password" en Supabase**, tampoco yo. Deja
  sin conexión al backend de Render hasta que alguien actualice
  `DATABASE_URL` allí.

---

## 4. Revisar los cambios que tocan tu código

He tocado ficheros tuyos. Todo está explicado en su commit y con tests, pero
conviene que lo mires:

- **`admin/shared.ts`:** saqué tu condición de alcance a `isElectionInScopeFor`,
  para usarla en `/results` sin `requireAdmin`. `isElectionInScope` la llama y
  se comporta igual.
- **`services/retention.ts`:** `anonymizeDeletedAccounts` borra también la
  entrada de `email_whitelist` y la solicitud de registro de esa persona,
  dentro de una transacción. Conservaban su nombre e identificador, y la
  entrada sin usar de la lista blanca permitía a cualquiera ocupar su sitio en
  el censo. Añadí además los plazos de `admin_action_log` (12 meses) y de las
  solicitudes sin confirmar (48 horas).
- **`results-chain.test.ts`:** sus elecciones nacen ya terminadas. Desde
  SCRUM-16, `/results` no da el reparto antes de `end_time`, y ese test prueba
  el contraste con la cadena, no cuándo se publica.
- **`legal-acceptance.test.ts`:** los dos casos que usan el registro público
  confirman el correo antes de comprobar lo mismo que antes.
- **`SEGURIDAD.md`:** reescribí el párrafo "Medida en la interfaz" de la 2.2 y
  añadí la fila del administrador de institución en la sección 3.

---

## 5. SCRUM-17, opción A

La decidimos el 25-sep: separar en la base "esta persona ha votado" de "hay
un voto para este candidato". Así, cuando cierra la elección y se destruye su
sal, nadie puede reconstruir quién votó qué, tampoco nosotros.

El primer paso ya está hecho y desplegado (`954b94c8`). El panel enseñaba a
los administradores de institución el nullifier y la hora exacta de cada
votante, y eso bastaba para cruzarlo con `VoteCast` en la cadena.

El resto es tuyo, porque toca el camino del voto y la reconciliación. El plan
completo está en [`SPRINT_2_JAIME.md`](SPRINT_2_JAIME.md), sección "SCRUM-17,
opción A":
- las dos tablas;
- los sitios del código que leen `nullifier_audit`;
- las decisiones de producto (el recibo y la exportación de datos);
- la migración irreversible, con copia de seguridad antes;
- lo que seguirá sin cubrirse.

Hazlo en tu rama, con un pull request para que lo revise.
