# VTB — GUÍA DE CONTINUACIÓN (Sesión 3)

> **Creado en:** Sesión 2 - 19 Febrero 2026
> **Estado general:** 52% completo (11/21 bloques implementados)

---

## 📊 PROGRESO ACUMULADO

```
BLOQUE 1 — BUGS CRÍTICOS                ✅ 100% (4/4)
BLOQUE 2 — SEGURIDAD                    ✅ 100% (4/4)
BLOQUE 3 — FUNCIONALIDADES              ✅ 25% (1/5)  ← 3.1 solo
BLOQUE 4 — HOSTING                      ✅ 25% (1/4)  ← 4.2 solo
BLOQUE 5 — CALIDAD Y UX                 ✅ 75% (3/4)  ← falta 5.1
─────────────────────────────────────────────────────
TOTAL                                   ✅ 52% (11/21)
```

---

## 🎯 PRÓXIMAS TAREAS ORDENADAS (Sesión 3)

Ejecutar **exactamente en este orden** para no romper nada:

### BLOQUE 3 — Funcionalidades (5 tareas)

**3.2 — Página de Resultados con Gráfico Recharts** (2-3 horas)
- [ ] `npm install recharts` en frontend
- [ ] Crear `frontend/src/pages/ElectionResults.jsx`
- [ ] Ruta GET `/api/elections/:id/results` en backend
- [ ] BarChart de Recharts con candidatos/votos
- [ ] Refresh cada 30 seg si election activa
- [ ] Tabla con números exactos
- [ ] Dashboard: botón "Ver resultados" en tarjetas completadas

**3.3 — Live Feed Mejorado** (1-2 horas)
- [ ] Filtrar eventos por electionId actual
- [ ] Máximo 8 eventos recientes
- [ ] Truncamiento: `0x1a2b...ef34 — hace 3 seg`
- [ ] Tiempo relativo actualizado cada segundo
- [ ] Badge "⚡ Reconectando..." si desconecta
- [ ] Máx 3 reintentos (5 seg cada uno)
- [ ] CleanUp listeners en useEffect

**3.4 — Feedback de Transacción** (2-3 horas)
- [ ] 3 pasos: proof (800ms) → sending → confirm
- [ ] Overlay modal no navegable durante votación
- [ ] Modal éxito: txHash + botón copiar + explorer link
- [ ] Modal error: mensaje exacto del contrato + reintentar
- [ ] Env vars: `VITE_EXPLORER_URL`

**3.5 — Tab Auditoría en Resultados** (1-2 horas)
- [ ] 2 tabs: `[📊 Resultados]` `[🔗 Auditoría]`
- [ ] GET `/api/elections/:id/audit` → nullifier/txHash/timestamp
- [ ] Tabla con columnas truncadas → links al explorer
- [ ] Banner: 🔒 privacidad garantizada
- [ ] Botón "Exportar CSV" (client-side, sin llamada extra)

---

### BLOQUE 4 — Hosting (4 tareas)

**4.1 — Dockerizar** (2-3 horas)
- [ ] `frontend/Dockerfile` (builder pattern, nginx)
- [ ] `frontend/nginx.conf` (SPA routing + API proxy)
- [ ] `backend/Dockerfile` (production-ready)
- [ ] `docker-compose.yml` (servicios frontend/backend/hardhat con profiles:dev)
- [ ] `.dockerignore` en raíz, frontend y backend

**4.3 — README Completo** (1 hora)
- [ ] Stack y requisitos
- [ ] Instalación (script y manual)
- [ ] Docker deployment
- [ ] Credenciales de prueba en tabla
- [ ] Arquitectura: diagrama ASCII
- [ ] Flujo de votación paso a paso
- [ ] Seguridad: bcrypt, JWT, rate limiting
- [ ] Troubleshooting con errors comunes

**4.4 — Limpiar localhost** (30 min)
- [ ] Buscar "localhost" hardcodeado en `/frontend/src`
- [ ] Reemplazar con `import.meta.env.VITE_API_URL`
- [ ] `vite.config.js`: asegurar proxy `/api`
- [ ] Build script en package.json raíz

---

### BLOQUE 5 — UX (1 tarea pendiente)

**5.1 — Spinners en componentes** (30 min)
- [ ] Dashboard: LoadingSpinner mientras carga elections
- [ ] VotingBooth: LoadingSpinner mientras carga candidatos
- [ ] ElectionResults: LoadingSpinner mientras carga resultados
- [ ] AdminPanel: LoadingSpinner en cada tab

---

## ⚡ RECOMENDACIONES PARA SESIÓN 3

### Por qué este orden:
1. **3.2, 3.3, 3.4, 3.5** primero: son features que enriquecen la demo
2. **4.1, 4.3, 4.4** después: hosting y deployment
3. **5.1** último: pulido UI mínimo

### Estimación de tiempo:
- 3.2: 2.5 h
- 3.3: 1.5 h
- 3.4: 2.5 h
- 3.5: 1.5 h
- 4.1: 2.5 h
- 4.3: 1.0 h
- 4.4: 0.5 h
- 5.1: 0.5 h
- **TOTAL: ~12.5 horas** (3+ días de trabajo)

### Dependencias entre bloques:
```
3.2 ← necesita GET /api/elections/:id/results
3.3 ← necesita listeners ethereum configurados
3.4 ← interfaz UI, sin deps backend nuevas
3.5 ← necesita 3.2 como base (misma página)
4.1 ← independiente (solo cambios config)
4.3 ← puede hacerse en paralelo con 4.1/4.4
4.4 ← búsqueda simple, sin lógica
5.1 ← final, solo UI
```

**Recomendación:** 3.2 + 3.5 juntas (misma página), luego 3.3 + 3.4 (blockchain), luego Docker/Docs

---

## 📝 ARCHIVOS PRINCIPALES POR BLOQUE

### 3.2 — Results
```
backend/src/routes/elections.ts
├─ GET /elections/:id/results
└─ Devuelve: { election, candidates: [{name, votes}], totalVotes, status }

frontend/src/pages/ElectionResults.jsx (NUEVO)
├─ useParams(:id)
├─ BarChart Recharts
├─ Refresh 30s si activa
└─ Tabla con detalles
```

### 3.3 — Live Feed
```
frontend/src/pages/VotingBooth.jsx (actualizar)
├─ useEffect: ethers Contract listener
├─ Filter por electionId actual
├─ Máx 8 eventos
├─ Tiempo relativo con interval
└─ Reconexión lógica
```

### 3.4 — Feedback
```
frontend/src/pages/VotingBooth.jsx (actualizar)
├─ States: waiting → proof → sending → confirm → success
├─ Modal con overlay
├─ txHash display + copy button
└─ Error handling con retry
```

### 3.5 — Audit
```
frontend/src/pages/ElectionResults.jsx (agregar Tab)
├─ [📊 Resultados] [🔗 Auditoría]
├─ GET /elections/:id/audit
└─ CSV export client-side

backend/src/routes/elections.ts
└─ GET /elections/:id/audit (público)
```

### 4.1 — Docker
```
frontend/Dockerfile (NUEVO)
├─ Stage 1: Build con Node
└─ Stage 2: Deploy en nginx

frontend/nginx.conf (NUEVO)
├─ SPA routing
└─ API proxy

backend/Dockerfile (NUEVO)
├─ Single stage
└─ npm run build

docker-compose.yml (NUEVO)
├─ backend service
├─ frontend service
└─ hardhat service (profile: dev)
```

### 4.3 — README
```
README.md (REESCRIBIR)
├─ Stack + requisitos
├─ Install rápido (script)
├─ Install manual
├─ Docker
├─ Credenciales
├─ Arquitectura
├─ Flujo votación
├─ Seguridad
└─ Troubleshooting
```

### 4.4 — Localhost
```
Buscar en: frontend/src/**/*.{jsx,ts}
Cambiar: "localhost:3001" → import.meta.env.VITE_API_URL
Archivos clave:
├─ pages/
├─ context/
└─ components/
```

### 5.1 — Spinners
```
frontend/src/pages/Dashboard.jsx
├─ {loading ? <LoadingSpinner /> : <ElectionGrid />}

frontend/src/pages/VotingBooth.jsx
├─ {loading ? <LoadingSpinner /> : <CabinaVotacion />}

frontend/src/pages/ElectionResults.jsx (NUEVO)
├─ {loading ? <LoadingSpinner /> : <ResultsChart />}

frontend/src/pages/AdminPanel.jsx
├─ {loading && <LoadingSpinner fullScreen />}
```

---

## 🔗 CONEXIONES CON SESIÓN 2

Todos estos cambios **dependen** de lo hecho en Sesión 2:

| Sesión 2 | Sesión 3 usa |
|----------|-------------|
| 5.4 JWT validity | headers Authorization en fetch |
| 3.1 registration | AuthProvider validando roles |
| 5.3 eligibility | Usuarios con permisos correctos |
| 4.2 setup.sh | Variables .env inicializadas |
| CORS config | Requests CORS al backend |
| ErrorBoundary | Captura errores en 3.2-5.1 |

**No hay conflictos.** Todo es aditivo.

---

## 🚨 PUNTOS CRÍTICOS A EVITAR

1. **No cambiar nullifier generation** ✅ Ya well-defined en 1.3
2. **No usar Redux/Zustand** ✅ Context API + estado local suficiente
3. **No modificar smart contract** ✅ Usar tal cual de Sesión 1
4. **No hacer breaking changes en Auth** ✅ JWT design ya locked
5. **Respetar election_voters table** ✅ FIX D lo añadió, no modificar schema

---

## ✅ VALIDACIÓN POST-SESIÓN 3

Cuando se completen todas las tareas, verificar:

- [ ] `npm run build` en frontend funciona sin errores
- [ ] `npm run dev` en backend inicia sin errores
- [ ] `npm run dev` en frontend en http://localhost:5173
- [ ] Login → Dashboard → Voting → Results → toda la flow
- [ ] Admin Panel: ver, aprobar, rechazar solicitudes
- [ ] Hacer: `docker compose build` (opcional, pero verificar)
- [ ] README en raíz tiene instrucciones claras
- [ ] Todos los localhost changeds a env vars
- [ ] Error boundary funciona (ej: romper un componente)

---

## 📚 DOCUMENTACIÓN GENERADA

Refiere a estos archivos en la raíz del proyecto:

1. **SESION_2_COMPLETA.md** ← Documento actual (nuevo en S2)
2. **CAMBIOS_IMPLEMENTADOS.md** ← Log de cambios por commit (de S1)
3. **RESUMEN_IMPLEMENTACION.md** ← Progreso S1 (de S1)
4. **API_DOCUMENTATION.md** ← Endpoints (original)
5. **ARCHITECTURE.md** ← Diagramas (original)

En Sesión 3, actualizar:
- SESION_2_COMPLETA.md → rename a SESION_COMPLETE.md
- Crear SESION_3_PLAN.md si se necesita doc de S3

---

## 🛠️ HERRAMIENTAS RECOMENDADAS

Para Sesión 3:
- Recharts docs: https://recharts.org/ (para 3.2)
- ethers.js listener docs: https://docs.ethers.org/ (para 3.3)
- Docker best practices: https://docs.docker.com (para 4.1)

---

## 📞 CONTACTO / SOPORTE

Si algo no funciona o hay dudas sobre:
- **Arquitectura**: Refiere a ARCHITECTURE.md
- **API contracts**: Refiere a API_DOCUMENTATION.md
- **Cambios S2**: Refiere a SESION_2_COMPLETA.md
- **Build/Deploy**: Refiere a setup.sh (s4.2)

---

**¡Listo para Sesión 3! 🚀**
