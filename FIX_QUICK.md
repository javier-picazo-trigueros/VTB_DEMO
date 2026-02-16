# 🚨 FIX RÁPIDO - Error npm ERESOLVE

Tu error es por **conflicto de versiones** en las dependencias. Aquí el fix:

## ✅ OPCIÓN 1: Ejecutar Script Automático (RECOMENDADO)

```powershell
cd C:\Users\javie\OneDrive\Desktop\Trabajos_Universidad(3)\Proyectos\VTB_DEMO

# Ejecutar script de limpieza
powershell -ExecutionPolicy Bypass -File INSTALL_FIX.ps1
```

Este script:
- ✓ Limpia node_modules en los 3 proyectos
- ✓ Reinstala dependencias correctas
- ✓ Arregla el error de @typechain/ethers-v6
- ⏱️ Toma ~5 minutos

---

## ⚙️ OPCIÓN 2: Manual (Si quieres entender el fix)

### Paso 1: Fix Blockchain (El que tiene error)

```powershell
cd blockchain

# Limpiar
Remove-Item node_modules -Recurse -Force
Remove-Item package-lock.json -Force

# Verificar que package.json tiene la versión correcta:
# "@typechain/ethers-v6": "^0.5.0"   (NO ^11.1.2)

# Reinstalar
npm install
```

**Qué arreglé:** Cambié `@typechain/ethers-v6` de **^11.1.2** → **^0.5.0**
- La versión 11.1.2 es incompatible con hardhat-toolbox 4.0.0
- La versión 0.5.0 es la correcta para hardhat-toolbox 4.0.0

### Paso 2: Backend

```powershell
cd ..\backend

Remove-Item node_modules -Recurse -Force
Remove-Item package-lock.json -Force

npm install
```

### Paso 3: Frontend

```powershell
cd ..\frontend

Remove-Item node_modules -Recurse -Force
Remove-Item package-lock.json -Force

npm install
```

---

## 🚨 Si sigue fallando: Plan B

```powershell
cd blockchain

# Opción nuclear (funciona pero hay trade-offs)
npm install --legacy-peer-deps

# O:
npm install --force
```

**Nota:** `--legacy-peer-deps` permite versiones incompatibles. Funciona pero no es ideal.

---

## ✓ Verificación

Después de instalar, verifica cada uno:

```powershell
# BLOCKCHAIN
cd blockchain
npx hardhat --version
# Debería mostrar: hardhat 2.22.2

# BACKEND
cd ..\backend
npm list ethers
# Debería mostrar: ethers@6.11.1

# FRONTEND
cd ..\frontend
npm list react
# Debería mostrar: react@18.2.0
```

Si todo dice ✓, estás listo para empezar:

```powershell
# Terminal 1: Blockchain
cd blockchain
npm run node

# Terminal 2: Backend
cd backend
npm run dev

# Terminal 3: Frontend
cd frontend
npm run dev
```

---

## 📊 Qué cambié

| Archivo | Cambio | Razón |
|---------|--------|-------|
| `blockchain/package.json` | `@typechain/ethers-v6@^11.1.2` → `^0.5.0` | Compatibilidad con hardhat-toolbox 4.0.0 |

**Eso es todo.** El error era solo en blockchain.

---

## 💡 Causa del Error

```
hardhat-toolbox 4.0.0 dice: "Yo espero @typechain/ethers-v6 versión 0.5.x"
                               ↓
Pero package.json tenía: "@typechain/ethers-v6": "^11.1.2"
                               ↓
npm dijo: "No puedo satisfacer ambas. Error ERESOLVE"
```

**Solución:** Pedir npm que instale versión 0.5.0 en lugar de 11.1.2. ✓

---

**Ejecuta ahora el script y repórtame si funciona o no.** 🚀
