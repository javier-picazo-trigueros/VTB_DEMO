# 🚀 VTB - Scripts de Inicio Rápido

Elige el script según tu sistema operativo para iniciar los 3 servicios (Backend, Frontend, Blockchain) con **un solo comando**.

---

## 📌 Opciones

### 🪟 **Windows - Opción 1: Batch Script (.bat)**
```bash
start.bat
```
- ✅ Más simple y directa
- ✅ Abre 3 ventanas de CMD separadas
- ✅ Recomendado para usuarios de Windows

### 🪟 **Windows - Opción 2: PowerShell Script (.ps1)**
```powershell
.\start.ps1
```
- ✅ Más control y manejo de procesos
- ⚠️ Requiere permitir ejecución de scripts (ver abajo)

### 🐧 **Linux / macOS / Git Bash**
```bash
bash start.sh
```
- ✅ Script universal para Unix-like systems
- ✅ Todos los servicios en una terminal

---

## 🔧 Instrucciones Detalladas

### Windows - Batch (.bat)
1. Haz doble clic en **`start.bat`** o:
```bash
start.bat
```
2. Se abrirán 3 ventanas automáticamente:
   - Ventana 1: Backend en puerto 3001
   - Ventana 2: Frontend en puerto 3000
   - Ventana 3: Blockchain en puerto 8545
3. Cada ventana se puede cerrar independientemente
4. Para cerrar todo, cierra las 3 ventanas

### Windows - PowerShell (.ps1)
1. Abre PowerShell como Administrador
2. Si es la primera vez, ejecuta:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
3. Navega a la carpeta del proyecto:
```powershell
cd ruta/a/VTB_DEMO
```
4. Ejecuta:
```powershell
.\start.ps1
```

### Linux / macOS / Git Bash
1. Abre terminal en la carpeta del proyecto
2. Dale permisos de ejecución (solo primera vez):
```bash
chmod +x start.sh
```
3. Ejecuta:
```bash
./start.sh
```
4. Presiona `Ctrl+C` para detener todos los servicios

---

## 📊 Servicios y Accesos

Una vez iniciados, accede a:

| Servicio      | URL                    | Puerto | Descripción              |
|---------------|------------------------|--------|--------------------------|
| **Frontend**  | http://localhost:3000  | 3000   | React Vite - Interfaz    |
| **Backend**   | http://localhost:3001  | 3001   | Express API              |
| **Blockchain**| http://localhost:8545  | 8545   | Hardhat Node             |

---

## 🔐 Credenciales de Prueba

**Estudiante:**
- Email: `juan@universidad.edu`
- Password: `password123`

**Administrador:**
- Email: `admin@universidad.edu`
- Password: `admin123`

---

## 📝 Archivos Incluidos

```
start.sh          ← Para Linux/macOS/Git Bash
start.bat         ← Para Windows (Batch)
start.ps1         ← Para Windows (PowerShell)
START_SERVICES.md ← Este archivo
```

---

## 🆘 Solución de Problemas

### Error: "npm: command not found"
→ Instala Node.js desde https://nodejs.org

### Error: "npx: command not found"
→ Actualiza npm: `npm install -g npm@latest`

### PowerShell: "cannot be loaded because running scripts is disabled"
→ Ejecuta: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

### Puerto ya en uso
- Backend (3001): `netstat -ano | findstr :3001` (Windows)
- Frontend (3000): `netstat -ano | findstr :3000` (Windows)
- Blockchain (8545): `netstat -ano | findstr :8545` (Windows)

---

## 🎯 Flujo Rápido de Demo

1. **Ejecuta un script** según tu SO (arriba)
2. **Abre navegador:** http://localhost:3000
3. **Ingresa credenciales:**
   - Usuario: `juan@universidad.edu`
   - Contraseña: `password123`
4. **Elige una elección** y **vota**
5. **Ve resultados** en tiempo real
6. **Admin panel:** Haz login como admin para ver estadísticas

---

✨ **¡Listo! Ahora VTB está corriendo con un solo comando.** ✨
