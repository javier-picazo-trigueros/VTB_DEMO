# VTB - Cambios Implementados (Sesión Actual)

## ✅ COMPLETADO

### BLOQUE 1 — BUGS CRÍTICOS
- **1.1** ✅ Crear ruta `/voting/:id` en App.jsx con protección de autenticación
- **1.2** ✅ Cargar candidatos dinámicamente en VotingBooth desde API
- **1.3** ✅ Refactorizar nullifier para generar en tiempo de votación (vote-time), no en login
- **1.4** ✅ Eliminar backend Flask (app.py, blockchain.py, models.py, requirements.txt)

### BLOQUE 2 — SEGURIDAD  
- **2.1** ✅ Migrar de SHA-512 a bcrypt para hashing de contraseñas
  - Instalado: `bcryptjs` y `@types/bcryptjs`
  - Actualizado: `hashPassword()` y `verifyPassword()` para ser async
  - Aplicado en: auth.ts, seedDatabase.ts, registration.ts, admin.ts
  
- **2.2** ✅ Setup de variables de entorno
  - Creado: `.env.example` con todas las variables documentadas
  - Creado: `.env` para desarrollo
  - Creado: `.gitignore` para excluir problemas de seguridad
  - Variables críticas: `JWT_SECRET`, `NULLIFIER_SECRET`, `CONTRACT_ADDRESS`, `PRIVATE_KEY`

- **2.3** ✅ Rate limiting en login
  - Instalado: `express-rate-limit`
  - Configurado: 5 intentos en 15 minutos para POST /auth/login
  - Deshabilitado en desarrollo

### BLOQUE 5 — CALIDAD Y UX
- **5.1** ✅ Crear ErrorBoundary para capturar errores globales
  - Creado: `/frontend/src/components/ErrorBoundary.jsx`
  - Muestra pantalla de error amigable con opción de reload

## 🏗️ CAMBIOS ARQUITECTÓNICOS IMPORTANTES

### 1. Nullifier Generation (BLOQUE 1.3)
**Antes**: Generado en login, incluido en JWT
```typescript
POST /auth/login { email, password, electionId }
// JWT contenía: { userId, email, electionId, nullifier }
```

**Ahora**: Generado en tiempo de votación en el backend
```typescript
// Login simple (sin electionId)
POST /auth/login { email, password }
// JWT contiene: { userId, email, role }

// Voto
POST /elections/register-vote {
  Authorization: "Bearer JWT",
  electionId,
  voteHash
}
// Backend calcula: nullifier = HMAC(userId + electionId)
```

**Ventajas**:
- ✅ Separación clara: JWT para autenticación, nullifier para votación
- ✅ Login más simple (sin necesidad de seleccionar elección primero)
- ✅ Nullifier generado en el endpoint exacto donde se usa

### 2. Candidatos Dinámicos (BLOQUE 1.2)
**Nuevo**:
- Tabla `candidates` en SQLite con estructura: `(id, election_id, name, description, position)`
- GET `/elections/:id` ahora retorna:
  ```json
  {
    "election": {
      "id": 1,
      "name": "Elección de Rector",
      "candidates": [
        { "id": 1, "name": "Juan García", "description": "..." },
        { "id": 2, "name": "María López", "description": "..." }
      ],
      "isActive": true,
      "status": "active"
    }
  }
  ```

### 3. Base de Datos - Nuevas Tablas
```sql
-- Nueva tabla para candidatos
CREATE TABLE candidates (
  id INTEGER PRIMARY KEY,
  election_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER DEFAULT 0
)
```

## 📦 DEPENDENCIAS AGREGADAS

### Backend
```json
{
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "express-rate-limit": "^7.1.5"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6"
  }
}
```

**Instalar con**: `cd backend && npm install`

## 🔐 VARIABLES DE ENTORNO REQUERIDAS

Ver `.env.example` para la lista completa. Variables más críticas:

```env
# Autenticación
JWT_SECRET=cambia_esto_en_produccion
NULLIFIER_SECRET=otro_secret_diferente

# Blockchain
CONTRACT_ADDRESS=0x...
PRIVATE_KEY=0x...
RPC_URL=http://localhost:8545

# Frontend
VITE_API_URL=http://localhost:3001
VITE_CONTRACT_ADDRESS=0x...
```

## 🚀 PRÓXIMOS PASOS (NO IMPLEMENTADOS AÚN)

### BLOQUE 3 — FUNCIONALIDADES FALTANTES (Priority)
- **3.1** Flujo de solicitud de registro (Self-Enrollment)
  - Backend: Tabla `registration_requests`, endpoints para CRUD
  - Frontend: Formulario de solicitud, panel de admin para revisión
  
- **3.2** Panel de resultados con gráfico
  - Instalar: `recharts`
  - Componente: Gráfico de barras con resultados en tiempo real
  
- **3.3** Live feed mejorado en VotingBooth
  - Ya existe pero necesita pulido
  
- **3.4** Feedback de transacción con estado real
  - Estados: "Generando prueba", "Enviando", "Confirmando"
  - Modal de éxito/error con txHash
  
- **3.5** Vista de auditoría pública (Hashes Tab)
  - Tab en resultados mostrando todos los hashes de transacciones

### BLOQUE 2 — SEGURIDAD (Remaining)
- **2.4** CORS configurado por dominio (actualmente abierto en desarrollo)

### BLOQUE 4 — HOSTING (Infrastructure)
- **4.1** Dockerizar (Dockerfile para frontend y backend)
- **4.2** Script de setup (`scripts/setup.sh`)
- **4.3** README completo
- **4.4** Build optimizado para producción

### BLOQUE 5 — CALIDAD (Remaining)
- **5.2** Loading spinners consistentes
- **5.3** Validación de estado de elección antes de votar
- **5.4** Persistencia de sesión mejorada

## ✅ TESTING RECOMENDADO

```bash
# 1. Backend
cd backend
npm install
npm run seed
npm run dev

# 2. Frontend (en otra terminal)
cd frontend
npm install
npm run dev

# 3. Blockchain
npx hardhat node

# 4. Pruebas básicas
# - Login: juan@universidad.edu / password123
# - Dashboard: Ver elecciones
# - Voting: Seleccionar y votar
```

## 📝 NOTAS

- **bcrypt**: Todos los `hashPassword()` ahora retornan una Promise. Asegúrate de `await` en todos los lugares.
- **Nullifier**: Ya NO es parte del JWT. Se genera en backend al recibir el voto.
- **Login**: Ya NO requiere seleccionar elección. Escoges elección al clickear "Vote Now" en dashboard.
- **Rate limiting**: Deshabilitado en desarrollo pero activo en producción.

## 🔧 TROUBLESHOOTING

### Error: "bcryptjs no encontrado"
```bash
cd backend
npm install bcryptjs @types/bcryptjs
```

### Error: "Cannot find module 'express-rate-limit'"
```bash
npm install express-rate-limit
```

### Nullifier generación falla
- Asegúrate que `NULLIFIER_SECRET` está en `.env`
- Verifica que `userId` y `electionId` son números válidos

### Rate limiting bloquea todos los logins
- Comprueba que `NODE_ENV != production` en desarrollo
- Espera 15 minutos o reinicia el servidor
