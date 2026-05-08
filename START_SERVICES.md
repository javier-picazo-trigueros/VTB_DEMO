# VTB - Inicio Rapido de Servicios

Este archivo resume como levantar el MVP en local. Para una guia completa, lee `README.md`.

## Antes de Empezar

Si has descargado el proyecto desde GitHub, recuerda que no incluye `.env`. Crea primero:

- `backend/.env`
- `frontend/.env.local`
- `blockchain/.env` solo si vas a desplegar contratos

Sin esos archivos el backend puede arrancar sin blockchain o fallar por falta de secretos.

Web publicada:

```text
https://vtb-frontend-git-main-javier-picazo-trigueros-projects.vercel.app/
```

## Opcion Recomendada

Usa dos terminales.

Terminal 1:

```bash
cd backend
npm install
npm start
```

Terminal 2:

```bash
cd frontend
npm install
npm run dev
```

Abre:

```text
http://localhost:3000
```

Comprueba backend:

```text
http://localhost:3001/health
```

## Blockchain Local Opcional

Solo hace falta si quieres probar contrato local con Hardhat.

Terminal 3:

```bash
cd blockchain
npm install
npm run node
```

Terminal 4:

```bash
cd blockchain
npm run deploy:local
```

Copia la direccion del contrato desplegado en `backend/.env` como `CONTRACT_ADDRESS`.

## Scripts del Repositorio

Tambien existen scripts historicos:

| Script | Sistema | Nota |
| --- | --- | --- |
| `start.bat` | Windows | Abre servicios en ventanas separadas |
| `start.ps1` | Windows PowerShell | Puede requerir politica de ejecucion |
| `start.sh` | Linux/macOS/Git Bash | Lanza servicios desde terminal |

Si algun script falla, usa la opcion recomendada de dos terminales. Es mas facil de depurar.

## Cuentas Demo

| Rol | Email | Password |
| --- | --- | --- |
| Votante demo | `student@vtb.demo` | `demo123` |
| Votante demo 2 | `student2@vtb.demo` | `demo123` |
| Admin demo | `admin@vtb.demo` | `admin123` |
| Superadmin demo | `superadmin@vtb.demo` | `superadmin123` |

Tambien puedes usar el selector de cuentas demo dentro del login.

## Puertos

| Servicio | URL | Puerto |
| --- | --- | --- |
| Frontend | `http://localhost:3000` | 3000 |
| Backend | `http://localhost:3001` | 3001 |
| Hardhat | `http://localhost:8545` | 8545 |

## Problemas Frecuentes

### Puerto 3001 ocupado

Comprueba si ya hay un backend VTB funcionando:

```bash
curl http://localhost:3001/health
```

En Windows:

```powershell
Get-NetTCPConnection -LocalPort 3001 | Select-Object LocalAddress,LocalPort,State,OwningProcess
Stop-Process -Id <PID>
```

### PowerShell bloquea scripts

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### npm no existe

Instala Node.js 20 desde:

```text
https://nodejs.org/
```
