# Quick Start - VTB Demo

## ⚡ Inicio Rápido (5 minutos)

### Prerequisitos
- Python 3.8+
- Node.js 16+
- Terminal (PowerShell en Windows, Terminal en macOS/Linux)

---

## 🚀 OPCIÓN A: Inicio Manual (Recomendado)

### Paso 1: Terminal 1 - Backend

```bash
cd backend
pip install -r requirements.txt
python app.py
```

✅ Deberías ver:
```
🚀 VTB API iniciada en http://localhost:5000
```

### Paso 2: Terminal 2 - Frontend

```bash
cd frontend
npm install
npm run dev
```

✅ Deberías ver:
```
➜  Local:   http://localhost:3000/
```

### Paso 3: Abre el navegador

**URL**: http://localhost:3000

```
Landing Page
    ↓
Click "Ir a Votar"
    ↓
Login (auto-rellenado)
    ↓
Dashboard
    ↓
Votar en "Delegado 3º Ingeniería"
```

---

## 🔐 Credenciales Rápidas

### Para Votante:
- Email: `alumno@ufv.es`
- Contraseña: `alumno123`

**Interfaz**: Dashboard con elecciones activas → Click "Votar" → Selector de candidatos → Recibo con Hash

### Para Admin:
- Email: `admin@ufv.es`
- Contraseña: `admin123`

**Interfaz**: Panel de Administración → Ver estadísticas y blockchain

---

## 📊 Demostración en Defensa (Guión Sugerido)

### Escena 1: Mostrar Landing Page (30s)
- Abre http://localhost:3000
- Explica con "Vote Through Blockchain"
- Muestra características (Web2, Web3, Anonimato)
- Haz click en "Ir a Votar"

### Escena 2: Login como Votante (20s)
- Muestra pantalla de login
- Explica que se autentica contra SQL (Web2)
- El formulario está pre-rellenado con `alumno@ufv.es` / `alumno123`
- Haz click "Acceder"

### Escena 3: Votar (1m)
- Abre Dashboard
- Muestra tarjetas de elecciones
- Haz click en "🗳️ Votar" en "Delegado 3º Ingeniería"
- En el modal:
  - Explica "Selecciona candidato"
  - Explica "Tu voto será anónimo"
  - Selecciona un candidato (ej: "Alice García")
  - Haz click "⛓️ Registrar Voto en Blockchain"
  - Espera a que aparezca el modal de éxito
  - Muestra el **Hash de Transacción** (recibo para auditoría)
  - Explica que nadie puede vincular este hash a tu identidad

### Escena 4: Ver Resultados (1m)
- Vuelve a dashboard
- Busca "Presupuestos 2025" (cerrada)
- Haz click "Ver Resultados →"
- Muestra los resultados leyendo desde blockchain
- Explica que los datos NO vienen de SQL

### Escena 5: Admin Panel (1m)
- Logout (botón en Navbar)
- Login con admin@ufv.es / admin123
- Click en "Panel Admin"
- Muestra "Estadísticas"
  - Total de usuarios
  - Total de votos registrados
  - Integridad blockchain ✓
- Clica en "Blockchain"
  - Muestra bloques
  - Explica estructura (Index, Hash, Nonce, Votos)

### Escena 6: Auditoría Técnica (1m)
- Abre DevTools (F12)
- Mostrar Network tab
  - POST /api/vote
  - GET /api/results
- Explica que toda comunicación está segura

---

## 🔧 Troubleshooting

### Error: "Could not connect to Flask"
- ¿Backend está en `http://localhost:5000`? 
- ¿Ejecutaste `python app.py`?
- ¿La terminal de backend muestra "API iniciada"?

### Error: "npm not installed"
```bash
# Instala Node.js desde https://nodejs.org/
# Verifica
node --version
npm --version
```

### Error: "Python not found"
```bash
# Instala Python desde https://python.org/
# Verifica
python --version  # o python3 --version
```

### Base de datos corrupta
```bash
# Borra la BD y déjala recrearse
cd backend
rm instance/vtb_demo.db  # Elimina
python app.py  # Reinicia (recreará BD)
```

### Puerto 5000 o 3000 ya en uso
```bash
# Cambia puerto en vite.config.js (línea 7)
port: 3001  # Usa 3001 en lugar de 3000

# O termina proceso:
# Windows: netstat -ano | findstr :5000
# macOS/Linux: lsof -i :5000 | kill -9 <PID>
```

---

## 📱 Interfaz Usuario

### Landing Page
- Dark mode profesional
- Explicación clara del sistema
- Botón "Ir a Votar"

### Login
- Email + Contraseña
- Botones rápidos ("Demo: Votante", "Demo: Admin")
- Link de vuelta a inicio

### Dashboard (Votante)
- Tarjetas con elecciones
- Elecciones activas (verde) vs cerradas (gris)
- Modal de votación al seleccionar

### Modal de Voto
- Lista de candidatos (radio buttons)
- Descripción de cada candidato
- Info de privacidad
- Botón "Registrar Voto en Blockchain"
- **Recibo** con Hash SHA-256 después de votar

### Resultados
- Gráfico de barras (candidatos vs votos)
- % de votación
- Estado blockchain (✓ válida o ✗ manipulada)

### Admin Panel
- Tabs: "Estadísticas" y "Blockchain"
- Estadísticas: usuarios, elecciones, votos, bloques
- Blockchain: detalles de cada bloque (hash, nonce, votos)

---

## 🎯 Puntos Clave para la Defensa

1. **Separación Web2/Web3**
   - SQL: Verifica "¿puedes votar?" (autenticación)
   - Blockchain: Registra "¿por quién votaste?" (anónimamente)

2. **Anonimato Garantizado**
   - Hash SHA-256 del voto = recibo (sin identidad)
   - Usuario NO vinculado a candidato

3. **Inmutabilidad**
   - Proof-of-Work (2 ceros iniciales)
   - Si alguien cambia un voto → toda la cadena se invalida

4. **Auditoría Transparente**
   - Resultados se leen de blockchain (no SQL)
   - Admin puede verificar integridad
   - Público puede auditarfácilmente

5. **Tecnología Moderna**
   - React + Vite (frontend rápido)
   - Flask + SQLAlchemy (backend robusto)
   - Tailwind CSS + Dark Mode (UI profesional)

---

## 📚 Archivos Clave para Mostrar

En la defensa, puedes abrir estos archivos para explicar la arquitectura:

### Backend
- `backend/app.py` → Rutas API (15-20 líneas cada una)
- `backend/blockchain.py` → Clase Blockchain (claro y comentado)
- `backend/models.py` → Modelos SQL (3 clases simples)

### Frontend
- `frontend/src/context/AuthContext.jsx` → Global state
- `frontend/src/components/VoteModal.jsx` → Flujo de voto
- `frontend/src/pages/AdminPanel.jsx` → Panel admin

### Documentación
- `README.md` → Arquitectura y técnico
- Este archivo (`QUICK_START.md`) → Instrucciones simples

---

## ✅ Pre-defensa Checklist

- [ ] Backend corre en `http://localhost:5000`
- [ ] Frontend corre en `http://localhost:3000`
- [ ] Puedo hacer login con `alumno@ufv.es`
- [ ] Puedo hacer login con `admin@ufv.es`
- [ ] Puedo votar en "Delegado 3º Ingeniería"
- [ ] Recibo muestra Hash de Transacción
- [ ] Resultados aparecen en "Presupuestos 2025"
- [ ] Admin Panel muestra estadísticas
- [ ] Admin Panel muestra bloques de blockchain
- [ ] Laptop tiene batería suficiente para 30min

---

## 💡 Tips para Impresionar

1. **Explica el flujo usuario** de forma clara antes de clickear
2. **Abre VS Code** y muestra código mientras explicas conceptos
3. **Abre DevTools** (F12) para mostrar requests HTTP
4. **Ten una terminal extra abierta** por si necesitas reiniciar
5. **Practica la demo** al menos 2 veces antes
6. **Prepara respuestas** a posibles preguntas:
   - "¿Cómo garantizas anonimato?" → Voto no tiene user_id en blockchain
   - "¿Y si alguien manipula la BD?" → Blockchain no está vinculada, el hash cambiaría
   - "¿Y si dos personas votan igual?" → El hash es diferente por timestamp
   - "¿Es una blockchain real?" → Es simulada educativa, pero mismo concepto que Bitcoin

---

## 🎓 Al Finalizar la Defensa

Gracias a todo el tribunal por su atención.

**Puntos finales:**
- Sistema está completamente funcional y documentado
- Código sigue estándares educativos
- Escalable a blockchain real (Polygon, Ethereum)
- Útil para universidades, empresas, organizaciones

---

¡**Buena suerte en la defensa!** 🎓♦️

Si algo falla durante la presentación, mantén la calma y explica el concepto técnicamente. 
El tribunal valora más tu comprensión que que todo funcione perfecto.
