# VTB - SESIÓN 2: IMPLEMENTACIÓN COMPLETA

## 📊 RESUMEN DE PROGRESO

**Completado en esta sesión (Sesión 2):**
- ✅ FIX A: ErrorBoundary integrado en App.jsx
- ✅ FIX B: CORS configurado correctamente para dev/prod
- ✅ FIX C: Rate limiting NODE_ENV configurado (5 intentos/prod, 100 intentos/dev)
- ✅ FIX D: Endpoint GET /elections filtrado por usuario (tabla election_voters)
- ✅ 5.4: Persistencia de sesión y expiración JWT implementada
- ✅ 3.1: Flujo completo de solicitud de registro (Self-Enrolment)
- ✅ 5.3: Validación eligibility antes de cabina de votación
- ✅ 5.2: LoadingSpinner component reutilizable
- ✅ 4.2: setup.sh script para inicialización automática

---

## 🔧 DETALLES TÉCNICOS

### FIX A - ErrorBoundary Integration
**Archivos modificados:**
- `frontend/src/App.jsx` - Importado ErrorBoundary, envuelto Router

**Cambios:**
```jsx
import ErrorBoundary from './components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  )
}
```

**Beneficios:**
- Captura errores en el árbol de componentes
- Muestra UI amigable en lugar de white screen
- Impide crash silencioso de la aplicación

---

### FIX B - CORS Configuration
**Archivos modificados:**
- `backend/src/index.ts` - Configuración avanzada CORS
- `.env.example` - Añadido CORS_ORIGINS variable

**Cambios:**
```typescript
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // En dev: permitir sin origin (Postman, curl)
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    // En prod: rechazar requests sin origin
    if (!origin) {
      return callback(new Error('CORS: origen requerido en producción'));
    }
    // Validar contra whitelist
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origen no permitido: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 horas
}));
```

**Configuración .env:**
```env
CORS_ORIGINS=http://localhost:5173
# Producción: CORS_ORIGINS=https://tu-dominio.com
```

---

### FIX C - Rate Limiting NODE_ENV
**Archivos modificados:**
- `backend/src/index.ts` - Rate limiter sensible a NODE_ENV
- `.env` - NODE_ENV=development añadido

**Cambios:**
```typescript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 100,
  skip: (req) => process.env.NODE_ENV === 'development',
  message: { error: 'Demasiados intentos. Inténtalo en 15 minutos.' }
});
```

**Comportamiento:**
- Dev: 100 intentos, sin límite actual (skip: true)
- Prod: 5 intentos/15 min, rate limit activo

---

### FIX D - Filter Elections by User
**Archivos modificados:**
- `backend/src/config/database.ts` - Nueva tabla election_voters
- `backend/src/routes/elections.ts` - GET /elections con filtrado por usuario

**Nueva tabla:**
```sql
CREATE TABLE election_voters (
  election_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (election_id, user_id),
  FOREIGN KEY (election_id) REFERENCES elections(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
)
```

**Endpoint actualizado:**
```typescript
// GET /elections ahora requiere JWT
// Solo devuelve elecciones donde usuario está en election_voters
SELECT e.* FROM elections e
INNER JOIN election_voters ev ON e.id = ev.election_id
WHERE ev.user_id = ? AND e.is_active = 1
```

---

### 5.4 - Session Persistence & JWT Expiration
**Archivos modificados:**
- `frontend/src/context/AuthContext.jsx` - isTokenValid function
- `frontend/src/pages/Login.jsx` - Session expired banner

**Validación JWT (cliente):**
```javascript
function isTokenValid(token) {
  try {
    const parts = token.split('.')
    const payload = JSON.parse(atob(parts[1]))
    // Comparar exp * 1000 (segundos a ms) con Date.now()
    return payload.exp && payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}
```

**Flujo:**
1. Al cargar app: validar token en localStorage
2. Si expirado: limpiar localStorage, hacer logout
3. Mostrar "Tu sesión ha expirado" en login si hay query param `?reason=expired`

---

### 3.1 - Registration Request Flow (Self-Enrolment)
**Archivos creados:**
- `frontend/src/pages/RegisterRequest.jsx` - Nuevo componente público
- Backend endpoints en `routes/admin.ts`

**Backend endpoints:**

#### POST /auth/register-request (Público, sin JWT)
```typescript
Body: { fullName, email, studentId }

Validaciones:
- Todos campos no vacíos
- Email contiene @ y .
- Email no existe en tabla users
- Email no tiene request pending
- StudentId mínimo 4 caracteres

Response: { message: "Solicitud enviada correctamente..." }
```

#### GET /admin/registration-requests (Admin, con JWT)
```typescript
Query: ?status=pending|approved|rejected|all
Response: { requests: [...], total, page, pageSize }
```

#### PATCH /admin/registration-requests/:id (Admin, con JWT)
```typescript
Body: { action: 'approve'|'reject', reason?: string }

Si approve:
- Genera contraseña temporal: VTB_${studentId}_temp
- Crea usuario con role 'voter'
- Devuelve tempPassword para que admin la comunique

Si reject:
- reason es obligatorio
- Actualiza status a 'rejected'
```

**Frontend RegisterRequest.jsx:**

```jsx
- Formulario con 3 campos: fullName, email, studentId
- Validación client-side antes de enviar
- Estado submitted: mostrar card verde de confirmación
- Errores mostrados exactos de la API (no genéricos)
- Botones: "Enviar Solicitud", "Volver al Login"
```

**Estructura en Admin Panel:**

Tab "Solicitudes" (📬) muestra:
- Badge con cantidad de solicitudes pendientes
- Tarjetas por solicitud con:
  - Email, Nombre, ID, Fecha
  - Botones: ✅ Aprobar, ❌ Rechazar
- Al aprobar: mostrar modal con contraseña temporal
- Al rechazar: pedir motivo con prompt()
- Sección separada de "Solicitudes Procesadas"

**Ruta en App.jsx:**
```jsx
<Route path="/register-request" element={<RegisterRequest />} />
```

**Link en Login.jsx:**
```jsx
¿No tienes cuenta? → Solicitar acceso
```

---

### 5.3 - Eligibility Validation
**Archivos modificados:**
- `backend/src/routes/elections.ts` - GET /elections/:id/eligibility
- `frontend/src/pages/VotingBooth.jsx` - Validación antes de mostrar cabina

**Backend GET /elections/:id/eligibility:**

Valida en orden:
```
1. ¿Existe? → { eligible: false, reason: 'not_found' }
2. ¿Activa? → { eligible: false, reason: 'not_active', status: 'pending|closed' }
3. ¿Usuario en censo? → { eligible: false, reason: 'not_eligible' }
4. ¿Ya votó? → { eligible: false, reason: 'already_voted' }
5. OK → { eligible: true }
```

**Frontend VotingBooth.jsx cambios:**

```javascript
// 1. Primero validar elegibilidad
const eligRes = await axios.get(`${API_URL}/elections/${electionId}/eligibility`, {
  headers: { Authorization: `Bearer ${token}` }
});

if (!eligRes.data.eligible) {
  // Mostrar error y redirigir
  const mensajeMap = {
    'not_found': 'Esta elección no existe',
    'not_active + pending': 'Esta elección aún no ha comenzado',
    'not_active + closed': 'Esta elección ya ha finalizado',
    'not_eligible': 'No tienes permiso para votar',
    'already_voted': 'Ya has emitido tu voto ✓'
  };
  
  navigate('/dashboard', { state: { message: mensajeMap[reason] } });
  return;
}

// 2. Después: cargar elección y candidatos
```

---

### 5.2 - LoadingSpinner Component
**Archivo creado:**
- `frontend/src/components/LoadingSpinner.jsx`

**Props:**
```jsx
<LoadingSpinner 
  message="Cargando..."      // Texto a mostrar
  fullScreen={false}         // Pantalla completa o inline
  timeout={10000}            // Milisegundos para mostrar timeout warning
/>
```

**Características:**
- Spinner animado que gira
- Incluye mensaje configurable
- Timeout warning después de 10 segundos (configurable)
- fullScreen: cubre toda la pantalla con overlay
- Dark mode soportado

**Lugares de uso recomendados:**
- Dashboard mientras carga lista de elecciones
- VotingBooth mientras carga candidatos
- ElectionResults mientras carga resultados
- AdminPanel mientras carga listas

---

### 4.2 - setup.sh Script
**Archivo creado:**
- `scripts/setup.sh` (Unix/Linux/macOS)

**Funciones:**
1. Verifica Node.js 20+ está instalado
2. Copia .env.example → .env (si no existe)
3. npm install en backend y frontend
4. npx hardhat compile (smart contracts)
5. Opcionalmente: despliega contrato en red local
6. Opcionalmente: seed de base de datos
7. Muestra resumen: URLs, credenciales, dirección contrato

**Uso:**
```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

---

## 🚀 ESTADO ACTUAL DE LA APLICACIÓN

### Flujos Implementados:
1. ✅ **Acceso & Autenticación**
   - Login con email/password
   - JWT 24h con expiración
   - Rate limiting 5 intentos/15 min en producción
   - CORS whitelist

2. ✅ **Self-Enrolment**
   - Usuarios nuevos solicitan acceso
   - Admin aprueba/rechaza con motivo
   - Sistema genera contraseña temporal

3. ✅ **Votación**
   - Dashboard filtrado por permisos
   - Validación pre-votación (elegibilidad)
   - Cabina con candidatos dinámicos
   - Generación nullifier en backend
   - Live feed blockchain

4. ✅ **Administración**
   - Panel admin con tabs
   - Gestión solicitudes de registro
   - Estadísticas del sistema
   - Auditoría de nullifiers

### Próximas Tareas (Sesión 3):
- [ ] 3.2 - Página resultados con gráfico Recharts
- [ ] 3.3 - Live feed mejorado (filtrado, máx 8 eventos)
- [ ] 3.4 - Feedback de transacción (3 pasos, 10-15 segundos)
- [ ] 3.5 - Tab auditoría en resultados
- [ ] 4.4 - Limpiar localhost hardcoding
- [ ] 4.1 - Dockerfiles + docker-compose
- [ ] 4.3 - README completo

---

## 📋 CHECKLIST DE VALIDACIÓN

- [x] ErrorBoundary captura errores en tree
- [x] CORS bloquea origins no permitidos en prod
- [x] Rate limiter desactivado en dev, activo en prod
- [x] Elections endpoint requiere autenticación
- [x] JWT se valida en cliente - si expirado → logout
- [x] RegisterRequest público - sin JWT requerido
- [x] Admin panel maneja solicitudes de registro
- [x] GET /eligibility valida en correcto orden
- [x] VotingBooth redirige si no eligible
- [x] LoadingSpinner + timeout warning implementado
- [x] setup.sh automatiza initialización

---

## 🔒 SEGURIDAD VERIFICADA

- ✅ Contraseñas hasheadas con bcryptjs (12 rounds)
- ✅ JWT con expiración 24h (configurable)
- ✅ Rate limiting protege login
- ✅ CORS limita acceso cross-origin
- ✅ Nullifiers generados server-side (no en client)
- ✅ PII nunca va a blockchain
- ✅ Nullifier determinístico pero no reversible

---

## 📖 DOCUMENTACIÓN PARA CONTINUACIÓN

Refiere a `CAMBIOS_IMPLEMENTADOS.md` para:
- Estado de cada commit/cambio
- Diffs de archivos modificados
- Archivo previo vs nuevo por cada cambio

Refiere a `RESUMEN_IMPLEMENTACION.md` para:
- Contexto de la sesión anterior
- Estado de cada bloque

---
