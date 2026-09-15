# Progreso contra el Plan de Trabajo

Sigue la estructura de **VTB — Plan de trabajo para pasar de un MVP a una
aplicación real** (Javier Picazo y Jaime Ordovás, julio de 2026). Cada línea
de ese documento tiene aquí su estado y, cuando existe, el commit o ticket de
Jira que la resuelve.

Este documento se actualiza a mano cada vez que un commit cierra algo de aquí.
No es una auditoría de código — para eso están `ESTADO.md`, `AUDITORIA_2.md` y
`AUDITORIA_BLOCKCHAIN.md`. Esto es solo: **de lo que dijisteis en julio, qué
está hecho.**

**Leyenda:** ✅ Hecho · ⚠️ Parcial · ❌ Pendiente

---

## Los cuatro problemas del plan (sección 3)

| Problema | Estado | Nota |
|---|---|---|
| La base de datos no es persistente | ⚠️ Parcial | Migración a PostgreSQL hecha en código (Javier, `a79640ab`). Falta confirmar copias de seguridad automáticas y su restauración — ver Fase 1 |
| El token de sesión es robable | ✅ Resuelto | JWT en cookie `httpOnly`, ya estaba antes de este plan |
| La clave privada está en una variable de entorno | ❌ Pendiente | Sigue en `process.env.PRIVATE_KEY`. Planificado: `SCRUM-25`, Sprint 3 |
| El voto no es anónimo de verdad | ❌ Pendiente | `nullifier_audit` sigue guardando `user_id` + `candidate_id` en la misma fila. Planificado: `SCRUM-17`, Sprint 2 (separación operativa) y Fase 6 completa (Semaphore, criptográfica) |

---

## Fase 1 — Que no se pierdan los datos

| Tarea del plan | Estado | Referencia |
|---|---|---|
| Migrar SQLite → PostgreSQL (Supabase) | ✅ Hecho | Javier, `a79640ab` — confirmado: `getDatabase()` ya no se usa en ninguna ruta, todo pasa por `getDbClient()` |
| Restricciones anti-doble-voto en la propia BD | ✅ Hecho | `UNIQUE (user_id, election_id)` en `vote_attempts` y `nullifier_audit`, migración inicial |
| Migraciones versionadas | ✅ Hecho | `node-pg-migrate`, 8 migraciones aplicadas |
| Copias de seguridad automáticas + prueba de restauración | ❌ Pendiente | Sin rastro en el repo ni en `DESPLIEGUE_RENDER.md` |
| Separar entornos de desarrollo y producción | ⚠️ Parcial | SQLite local vs. PostgreSQL en Supabase compartido — no es lo mismo que dev/prod separados de verdad (la base de Supabase la comparten los dos) |

*Fase asignada a Javier — fuera de mi parte del trabajo.*

---

## Fase 2 — Seguridad

| Tarea del plan | Estado | Referencia |
|---|---|---|
| JWT a cookies httpOnly + CSRF | ✅ Hecho | Ya estaba antes de este plan |
| Rate limiting en login y voto | ✅ Hecho | Ya estaba antes de este plan |
| Validar bien todo lo que entra por la API | ⚠️ Parcial | zod en la mayoría de rutas; 4 políticas de contraseña distintas sin unificar. Planificado: `SCRUM-21`, Sprint 2 |
| Cabeceras de seguridad (CSP, HSTS, CORS) | ✅ Hecho | Ya estaba antes de este plan |
| Sacar la clave privada de las variables de entorno | ❌ Pendiente | Planificado: `SCRUM-25`, Sprint 3 |
| Registro de auditoría de acciones de administrador | ❌ Pendiente | Planificado: `SCRUM-20`, Sprint 2 |
| **Revisar el historial por si se coló alguna clave** | ✅ Hecho | **`6697396e`** (yo, hoy) — encontrada y documentada la clave de Alchemy filtrada; el resto del historial son placeholders |
| Auditoría de dependencias automática | ✅ Hecho | **`b4a6ee6c`** (yo) — Dependabot semanal en los 3 `package.json` y las actions. **`ce12a9ca`** y **`30922c28`** (yo) — 0 vulnerabilidades en backend tras `npm audit fix` + subir `node-pg-migrate` 7→9 (probado end-to-end contra Postgres 17 en Docker; las 8 migraciones `.cjs` funcionan sin cambios) |

---

## Fase 3 — Que se pueda usar

| Tarea del plan | Estado | Referencia |
|---|---|---|
| Integrar Resend (invitación, confirmación, recuperación, avisos) | ✅ Hecho | El servicio ya existía; Javier conectó las páginas que faltaban (`3f49b875`) — antes los enlaces daban 404 |
| SPF, DKIM, DMARC | ❌ Pendiente | Planificado: `SCRUM-27`, Sprint 3 |
| Dominio propio con certificado | ❌ Pendiente | Sigue en `vtb-frontend-git-main-....vercel.app`. Planificado: `SCRUM-27`, Sprint 3 |
| Monitorización y alertas | ❌ Pendiente | Solo `console.log`. Planificado: `SCRUM-26`, Sprint 3 |

---

## Fase 4 — Papeleo legal

| Tarea del plan | Estado | Referencia |
|---|---|---|
| Política de privacidad, aviso legal, términos, cookies | ❌ Pendiente | Planificado: `SCRUM-28`, Sprint 4 |
| Registro de actividades de tratamiento (RGPD) | ❌ Pendiente | Planificado: `SCRUM-28`, Sprint 4 |
| Contratos de encargado del tratamiento | ❌ Pendiente | No planificado todavía — es gestión, no código |
| Auditoría de accesibilidad WCAG 2.1 AA | ❌ Pendiente | Planificado: `SCRUM-31`, Sprint 4 |
| Derechos de acceso, rectificación y borrado | ❌ Pendiente | Planificado: `SCRUM-29`, Sprint 4 |

---

## Fase 5 — Producto

| Tarea del plan | Estado | Referencia |
|---|---|---|
| Multi-tenant sin fuga de datos entre instituciones | ❌ Pendiente | **Reverificado hoy tras el pull de Javier**: sigue sin existir ningún control de dominio en `PUT/PATCH /elections/:id`, `notify-open`, `notify-close`, etc. Planificado: `SCRUM-19`, Sprint 2 |
| Panel de administración con roles y permisos | ⚠️ Parcial | Roles admin/superadmin existen; sin permisos granulares |
| Exportación de actas con sello de tiempo y tx | ❌ Pendiente | Hay exportación PDF, sin sello de tiempo ni referencia a la transacción. Planificado: `SCRUM-32`, Sprint 4 |
| Página de verificación pública | ⚠️ Parcial | `Transparency.jsx` existe pero lee de la base de datos, no del contrato. Planificado: `SCRUM-32`, Sprint 4 |

---

## Fase 6 — Voto anónimo de verdad

| Tarea del plan | Estado |
|---|---|
| Zero-Knowledge Proofs con Semaphore | ❌ Sin empezar |
| Mecanismo anti-doble-voto sin conocer al votante | ❌ Sin empezar |
| Auditoría externa del circuito | ❌ Sin empezar |

Sin cambios desde julio. No planificada en los 4 sprints actuales — ver nota de
alcance en el [plan de sprints](README.md).

---

## Fase 7 — Red de producción

| Tarea del plan | Estado |
|---|---|
| Salir de Sepolia hacia Alastria o Wavext | ❌ Sin empezar |
| Gobernanza de nodos y costes | ❌ Sin empezar |

Sin cambios desde julio. No planificada en los 4 sprints actuales.

---

## Trabajo hecho que no estaba en el plan original

Cosas resueltas por el camino que no corresponden a ninguna línea del PDF —
constancia de que existen, para que no se confundan con progreso del plan:

- **`6ecf2c40`** (yo) — un usuario con contraseña temporal quedaba encerrado
  sin poder cerrar sesión ni recibir el código de error. Bug de acceso
  encontrado en auditoría propia (`ESTADO.md`), no mencionado en el plan.
- **`f8447c58`** (yo) — 3 rutas de `auth.ts` devolvían `err.message` crudo al
  cliente, y `config/env.ts` (validación de entorno al arrancar) era código
  muerto sin ningún import. Ambos, hallazgos de `ESTADO.md` (puntos 7 y 8),
  no líneas del PDF.
- Javier: página de censo/CSV con filas fallidas visibles, sincronización de
  elecciones sin esperar a Sepolia, `/health` con comprobación real de BD —
  todo mejoras operativas fuera del alcance literal del PDF.

---

## Cómo leer esto

- Las Fases 1, 3 y parte de la 5 avanzan por el lado de Javier.
- Las Fases 2 y 4 (y el resto de la 5) están en mi parte.
- El [plan de sprints](https://claude.ai/code/artifact/2e79664e-e5e6-47ab-9191-1440302e6ea0)
  reparte todo esto en 4 sprints de una semana; los tickets de Jira (`SCRUM-*`)
  son la unidad de trabajo real. Este documento es la vista "¿qué dice el PDF
  original?", no sustituye al tablero.
