# 🎤 GUÍA DE PRESENTACIÓN - Script y Narrativa

**VTB (Vote Through Blockchain)**  
**Defensa Tribunal - 3º Ingeniería Informática**

---

## 📋 ESTRUCTURA DE PRESENTACIÓN (10-12 minutos)

### 1. INTRO (1 minuto)

**Decir:**
"Buenos días. Mi nombre es [tu nombre] y presento VTB: Vote Through Blockchain, un sistema de votación electrónica que combina tecnología Web2 tradicional con blockchain de última generación."

**Visual:** Mostrar landing page en grande en pantalla

**Clave:** Sonreír, contacto visual, hablar claro

---

### 2. PROBLEMA (1,5 minutos)

**Decir:**
"Los sistemas de votación electrónica enfrentan un dilema:

Si usamos bases de datos tradicionales:
- ✅ Autenticación rápida y fácil
- ❌ Punto central de fallo: si se hackea, todo se pierde
- ❌ Admin podrías cambiar resultados

Si usamos blockchain puro:
- ✅ Transparencia, inmutabilidad
- ✅ No hay punto central de fallo
- ❌ Pero... ¿cómo autenticar usuarios? ¿cómo mantener anonimato?

Mi solución: Combinar lo mejor de ambos mundos."

**Visual:** Mostrar diagrama de problema (dibujar en papel o slide):
```
Database ❌  →  Centralized but fast
          
Blockchain ❌  →  Decentralized but how to auth?

My Solution ✅  →  Best of both
```

**Clave:** Explicar el "por qué" antes del "cómo"

---

### 3. SOLUCIÓN ARQUITECTÓNICA (2 minutos)

**Decir:**
"Uso una arquitectura híbrida en 3 capas:

**Capa 1: Web2 - Autenticación**
- SQLite con base de datos de usuarios
- Backend Express valida email + contraseña
- Si eres válido, genero un 'nullifier'
- Un nullifier es un hash criptográfico único por usuario

**Capa 2: Generación de Nullifier (CRÍTICA)**
- Fórmula: nullifier = HMAC-SHA256(userId, electionId, SECRET)
- HMAC significa: Hash-based Message Authentication Code
- Propiedades:
  - Determinístico: mismo usuario → siempre el MISMO nullifier
  - Irreversible: imposible extraer userId del nullifier
  - Único: usuarios diferentes → nullifiers diferentes
  
¿Por qué importa esto? Impide doble voto:
  - Si intento votar 2 veces
  - Genero el MISMO nullifier
  - Smart Contract lo rechaza
  - (Porque ya existe en blockchain)

**Capa 3: Web3 - Auditoría Pública**
- Envío mi nullifier (anónimo) + voteHash (cifrado) al blockchain
- Smart Contract registra ambos
- Emite evento públicamente
- Cualquiera puede escuchar y auditar
- Pero nadie sabe:
  - Quién soy (nullifier es hash)
  - Por quién voté (voteHash está cifrado)"

**Visual:** Mostrar SETUP_GUIDE.md Sección 2 (diagrama arquitectura):
```
[Frontend]
    ↓ Login
[Backend + SQLite]
    ↓ Nullifier gen
[JWT token]
    ↓ Voto
[Backend Relayer]
    ↓ Firma transacción
[Smart Contract]
    ↓ Registra voto
[Live Feed]
```

**Clave:** Explicar HMAC con paciencia, es el corazón de la solución

---

### 4. DEMOSTRACIÓN EN VIVO (4 minutos)

**Preparación:**
- Hardhat node corriendo en Terminal 1
- Backend corriendo en Terminal 2
- Frontend en navegador en :5173
- Otra Terminal lista para ejecutar comandos

**PARTE A: Landing Page (30 seg)**

```
Click en Firefox/Chrome → http://localhost:5173
"Aquí está la landing page. Muestra la propuesta de valor: 
End-to-End, Secret, Auditable.
Tengo 4 features que explican qué hace cada capa..."
```

**PARTE B: Login (1 minuto)**

```
Hago click en "Enter Voting"
Llego a login...

[Leo campos pre-llenados]
"El sistema tiene usuarios pre-creados para demostración:
- Email: juan@universidad.edu
- Password: password123
- Election: 1"

[Hago click Login]
"Ahora el backend está:
1. Validando credenciales en SQLite
2. Generando nullifier
3. Creando JWT token
..."

[Espero respuesta]
"✅ Login exitoso. Ahora abro console del navegador..."
```

**En Terminal 4: Abro browser console**
```
F12 → Console → escribo:
localStorage.getItem('nullifier')

Muestra: "0x1a2b3c4d5e6f..."

"Este es el nullifier. Es un hash del userId 
y del ID de elección. Imposible de revertir.
Si intento votar 2 veces, generaré el MISMO,
y el blockchain lo rechazará."
```

**PARTE C: Voting (2 minutos)**

```
[Automáticamente llega a VotingBooth]
"Aquí puedo seleccionar un candidato.
Tengo A, B, C..."

[Selecciono Candidato A]
[Hago click "Confirmar Voto"]

"El frontend está:
1. Generando voteHash = SHA256(candidanoId + salt)
2. Enviando al backend"
```

**En Terminal 2 (Backend logs)**
```
"✅ Vote registered
✅ Relaying to blockchain..."
```

**En Terminal 1 (Hardhat)**
```
"Ven aquí en Hardhat: el contrato registró la transacción.
Se emitió un evento VoteCast con:
- nullifier (anónimo)
- voteHash (cifrado)
- timestamp"
```

**Volviendo a Frontend: Live Feed**
```
"Ven el Live Feed en tiempo real:
- Muestra nullifier (primeros 20 caracteres)
- Muestra timestamp
- Der contador dice '1 voto'

¿Qué NO muestra?
- Mi email (privacidad)
- Mi nombre (privacidad)
- Por quién voté (privacidad)

ESTO es lo que significa 'Secret Auditable'"
```

**PARTE D: Segundo Usuario (Opcional, 30 seg)**

```
[Abro navegador en incógnito]
[Hago login con maria@universidad.edu]
[Voto por Candidato B]

[Vuelvo a la ventana anterior]
"El Live Feed actualiza automáticamente.
Ahora muestra 2 votos.
Diferente nullifier (diferente usuario).
Live streaming de la blockchain."
```

**Clave:** No hables demasiado, deja que lo vean

---

### 5. ANÁLISIS DE SEGURIDAD (1,5 minutos)

**Decir:**
"Dijuse que el sistema es End-to-End, Secret y Auditable.
Déjame probar que realmente es seguro:

**¿Y si intento votar 2 veces?**
[Vuelvo a VotingBooth en primera ventana]
[Intento seleccionar otro candidato y votar]

[Especto respuesta del smart contract]
❌ Error: 'Nullifier already voted'

El blockchain rechazó la transacción porque el nullifier ya existe.

**¿Y si alguien hackea el backend?**
Incluso si logran cambiar datos en SQLite:
- No pueden cambiar votos en blockchain (inmutables)
- No pueden inventar nullifiers reales (porque usamos HMAC con SECRET)
- No pueden ver resultados más rápido que en blockchain

**¿Y si quiero auditar los resultados?**
La belleza: Yo PUEDO auditar sin confiar en el backend.
Solo necesito:
1. Dirección del smart contract
2. URL del RPC (blockchain)
3. Ejecutar código ethers.js para escuchar eventos
4. Verificar que no hay nullifiers duplicados
5. Contar votos de forma independiente"

**Visual:** Mostrar TECH_ARCHITECTURE.md Sección 5 (security)

**Clave:** Explicar que blockchain es "trustless" - no necesitas confiar en nadie

---

### 6. STACK TÉCNICO (1 minuto)

**Decir:**
"Para implementar esto use:

**Blockchain:**
- Hardhat para desarrollo local
- Solidity 0.8.24 para smart contract
- ethers.js v6 para interacción

**Backend:**
- Node.js + Express (TypeScript)
- SQLite para usuarios
- JWT para autenticación
- HMAC-SHA256 para nullifiers

**Frontend:**
- React + Vite (muy rápido)
- ethers.js para escuchar eventos blockchain
- Tailwind CSS para diseño
- i18next para soporte EN/ES (14 idiomas posibles)
- Framer Motion para animaciones

La solución es:
- OpenSource (código disponible en GitHub)
- Escalable (fácil migrar a Ethereum mainnet)
- Segura (cada capa validada)"

**Visual:** Mostrar TECH_ARCHITECTURE.md Sección 2 (Technical Foundation)

**Clave:** Mencione que es escalable - muestra que pensaste en producción

---

### 7. RESULTADOS ALCANZADOS (30 segundos)

**Decir:**
"El proyecto logra:

✅ Votación E2E completamente funcional
✅ Anonimato criptográfico garantizado
✅ Auditoría pública en tiempo real
✅ Anti-double-voting mediante nullifiers
✅ Privacidad: 0 PII en blockchain
✅ UX moderna con dark mode + multiidioma
✅ Documentación técnica completa
✅ Ready para defensa académica O producción

Todo funciona. Código está en repositorio.
Documentación en 4 archivos markdown."

**Visual:** Mostrar results.jsx o alguna página mostrando estadísticas

**Clave:** Resumir qué lograste en solo 4-5 bullets

---

### 8. CONCLUSIÓN (1 minuto)

**Decir:**
"Este proyecto demuestra que entiendo:

1. Criptografía: HMAC, SHA-256, hashing
2. Arquitectura: Separación Web2/Web3
3. Blockchain: Smart Contracts, eventos, inmutabilidad
4. Backend: Express, SQLite, APIs
5. Frontend: React, Web3 libraries, real-time updates
6. Seguridad: PII protection, anti-double-voting, audit trails

La solución es académicamente rigurosa:
- Cada componente tiene propósito claro
- Cada decisión tiene justificación
- Seguridad validated contro ataques realistas

Y es comercialmente viable:
- Arquitectura que escala
- Tech stack maduro (no experimental)
- UX que usuarios entenderían

Estoy contento con qué logramos en timeframe limitado.
Preguntas?"

**Clave:** Ponte de pie, abre espacio para tribunal

---

## 💬 PREGUNTAS ESPERADAS (Reference)

Si el tribunal pregunta, tienes FAQ_TRIBUNAL.md con respuestas. Aquí resumen:

- "¿Por qué blockchain si ya existe SQL?" → Auditoría pública + inmutabilidad
- "¿Cómo evitas doble voto?" → HMAC nullifier determinístico + Smart Contract check
- "¿Cómo proteges privacidad?" → Nullifier anónimo + voteHash cifrado en blockchain
- "¿Qué pasa si backend es hackeado?" → Votos en blockchain son inmutables
- "¿Por qué Hardhat y no Ethereum?" → Dev speed, pero código idéntico a mainnet

---

## 🎯 PRESENTACIÓN - CHECKLIST

### Antes de subir a tribunos (24 horas antes)

- [ ] Hardhat node corriendo ✅
- [ ] Contract deployed ✅
- [ ] Backend corriendo ✅
- [ ] Frontend accesible ✅
- [ ] Todos los archivos .env correctos
- [ ] Landing page se ve bien
- [ ] Live Feed funciona
- [ ] Dark mode persiste
- [ ] TECH_ARCHITECTURE.md impreso o en tablet
- [ ] FAQ_TRIBUNAL.md memorizados (o tener a mano)

### Día de presentación

- [ ] Laptop cargada
- [ ] Proyector/HDMI conectado
- [ ] 4+ navegadores tabs abiertos (Landing, Login, Voting, Console)
- [ ] varias Terminales abiertas (Backend logs visible)
- [ ] Agua
- [ ] Sonreír
- [ ] Pausar entre explicaciones

---

## 🎬 TIMELINE SUGERIDA (11 minutos)

```
0:00 - 0:30  | Intro + saludo
0:30 - 2:00  | Problema (por qué Web2+Web3)
2:00 - 4:00  | Solución arquitectónica (diagrama)
4:00 - 8:00  | Demostración en vivo (LOGIN → VOTO → LIVE FEED)
8:00 - 9:30  | Seguridad (double-vote, privacidad)
9:30 - 10:00 | Stack técnico
10:00-10:30  | Resultados
10:30-11:00  | Conclusión + preguntas abiertas
11:00+       | Responder tribunal
```

---

## 🗣️ FRASES CLAVE QUE DEBES DECIR

Aquí frases que resumen tu solución:

1. **"El problema es que necesito autenticación BUT anonimato"**
   - Muestra que entiendes el paradox

2. **"HMAC es una función hash que es determinística e irreversible"**
   - Muestra que sabes criptografía

3. **"Si intento votar dos veces, genero el MISMO nullifier, y el blockchain lo rechaza"**
   - Esta es la defensa contra el ataque más obvio

4. **"El blockchain no ve PII - solo hashes anónimos"**
   - Explica privacidad con una frase

5. **"El Live Feed prueba que cualquiera puede auditar sin confiar en el backend"**
   - Esto es el "Auditable" de E2E

6. **"Todo funciona - código está disponible para revisar"**
   - Demuestra confianza en tu código

---

## 😰 NERVIOS - CONSEJO MENTAL

Si te pones nervioso:

1. **Respira profundo 3 veces**
2. **Recuerda:** Hiciste TODO funcionar. Tribunal verá código funcionando.
3. **Habla lentamente.** Mejor parecer tranquilo que apresurado.
4. **Si no sabes respuesta típica:**
   - "Esa es una buena pregunta, déjame pensar..."
   - (Mira FAQ_TRIBUNAL.md en tu tablet)
   - Respond con confianza

---

## 📸 SCREENSHOTS PARA TENER LISTO

Toma screenshot de:
1. Landing page completa
2. Login exitoso (con nullifier en console)
3. VotingBooth mostrando candidatos
4. Live Feed con 2-3 votos
5. Hardhat terminal mostrando transacción
6. Dark mode activado
7. Interfaz en Español

Úsalos como backup si algo falla en demo en vivo.

---

## 🎬 SCRIPT FINAL (Memorizar)

"Buenos días, mi nombre es [nombre] y presento VTB.

El problema: Votación electrónica necesita autenticación rápida Y anonimato completo Y auditoría pública. Eso es casi imposible con una sola tecnología.

Mi solución: Combinar Web2 (SQL + autenticación rápida) con Web3 (blockchain + auditoría pública).

Usar: HMAC-SHA256 para generar nullifier único e imposible de invertir. Esto previene doble-voto criptográficamente.

Voy a mostrar funciona:
[Demo en vivo]

Resultados: E2E, Secret, Auditable. Código completo. Listo para producción.

Preguntas?"

---

**¡Estás listo! 🎓**
