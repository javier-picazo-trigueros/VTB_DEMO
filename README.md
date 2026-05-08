# VTB - Vote Through Blockchain

VTB es una plataforma de votacion institucional que combina autenticacion Web2 con registro y auditoria Web3. El objetivo del MVP es permitir que universidades, colegios u organizaciones creen elecciones, asignen censos, reciban votos anonimos y muestren resultados auditables.

Web publicada:

```text
https://vtb-frontend-git-main-javier-picazo-trigueros-projects.vercel.app/
```

> Nota: la demo publica depende de que el backend desplegado este activo. En servicios gratuitos puede tardar unos segundos en despertar.

## Que Incluye

| Capa | Tecnologia | Funcion |
| --- | --- | --- |
| Frontend | React 18, Vite, Tailwind, i18next | Interfaz de votante, panel admin, resultados, auditoria publica, tema claro/oscuro |
| Backend | Express, TypeScript, SQLite | Autenticacion, censo, elecciones, resultados, relayer blockchain |
| Blockchain | Solidity, Hardhat, Sepolia | Contrato `ElectionRegistry` para registrar nullifiers y hashes de voto |
| Privacidad | JWT, bcrypt, HMAC-SHA256 | Un voto por usuario y eleccion sin publicar identidad en blockchain |

## Funcionalidades del MVP

- Login de votantes, administradores y superadmin.
- Portal institucional por dominio.
- Solicitud de acceso y aprobacion por administradores.
- Panel admin para crear usuarios, elecciones, candidatos y censos.
- Importacion CSV de usuarios.
- Dashboard de elecciones asignadas.
- Cabina de voto con prevencion de doble voto.
- Registro de voto con nullifier anonimo.
- Resultados y participacion.
- Auditoria publica de transacciones/nullifiers.
- Tema claro/oscuro, selector de idioma y onboarding por cuenta.

## Probar la Web Publicada

Abre:

```text
https://vtb-frontend-git-main-javier-picazo-trigueros-projects.vercel.app/
```

Puedes entrar desde el selector de demo del login o usar estas cuentas:

| Tipo | Email | Password |
| --- | --- | --- |
| Votante demo | `student@vtb.demo` | `demo123` |
| Votante demo 2 | `student2@vtb.demo` | `demo123` |
| Votante UFV | `demo.ufv@ufv.es` | `demo123` |
| Votante Highland | `demo.highland@highland.edu` | `demo123` |
| Votante Universidad | `demo.universidad@universidad.edu` | `demo123` |
| Admin demo | `admin@vtb.demo` | `admin123` |
| Admin UFV | `admin.demo@ufv.es` | `admin123` |
| Superadmin demo | `superadmin@vtb.demo` | `superadmin123` |

## Importante si lo Descargas de GitHub

El proyecto no se puede ejecutar directamente despues de clonar el repositorio porque los archivos `.env` no se suben a GitHub. Esto es intencionado: contienen secretos, claves privadas, URLs de RPC, direcciones de contrato y configuracion local.

Si lo clonas, debes crear tus propios archivos de entorno:

- `backend/.env`
- `frontend/.env.local`
- `blockchain/.env` solo si vas a desplegar contratos

Hay plantillas copiables en:

- `backend/.env.example`
- `frontend/.env.example`
- `blockchain/.env.example`

Sin esos archivos, el backend puede fallar al arrancar con errores como:

```text
FATAL: JWT_SECRET environment variable is not set
```

o los votos no podran enviarse a blockchain porque faltan `CONTRACT_ADDRESS`, `PRIVATE_KEY` o `RPC_URL`.

## Requisitos Locales

- Node.js 20.x
- npm
- Git
- Opcional: wallet Sepolia con ETH de test
- Opcional: RPC Sepolia de Alchemy, Infura u otro proveedor

Instala dependencias en cada carpeta, no en la raiz:

```bash
cd backend
npm install

cd ../frontend
npm install

cd ../blockchain
npm install
```

## Configuracion de Entorno

### Backend

Crea `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

```env
PORT=3001
NODE_ENV=development

JWT_SECRET=replace_with_random_64_char_hex
NULLIFIER_SECRET=replace_with_random_64_char_hex

DATABASE_PATH=./vtb.db

CORS_ORIGINS=http://localhost:3000,http://localhost:5173

RPC_URL=http://localhost:8545
CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000000
EXPLORER_URL=http://localhost:8545
```

Genera secretos seguros:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Para usar Sepolia real, cambia:

```env
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
CONTRACT_ADDRESS=YOUR_DEPLOYED_CONTRACT_ADDRESS
PRIVATE_KEY=0xYOUR_SEPOLIA_RELAYER_PRIVATE_KEY
EXPLORER_URL=https://sepolia.etherscan.io
```

### Frontend

Crea `frontend/.env.local`:

```bash
cp frontend/.env.example frontend/.env.local
```

```env
VITE_API_URL=http://localhost:3001
VITE_EXPLORER_URL=https://sepolia.etherscan.io
```

No pongas claves privadas en variables `VITE_*`. Todo lo que empieza por `VITE_` queda visible en el navegador.

### Blockchain

Crea `blockchain/.env` si quieres desplegar el contrato:

```bash
cp blockchain/.env.example blockchain/.env
```

```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
ETHERSCAN_API_KEY=optional
```

## Ejecutar en Local

Abre dos terminales.

Terminal 1, backend:

```bash
cd backend
npm start
```

Comprueba que responde:

```bash
curl http://localhost:3001/health
```

Terminal 2, frontend:

```bash
cd frontend
npm run dev
```

Abre:

```text
http://localhost:3000
```

El backend inicializa SQLite y carga datos demo al arrancar.

## Blockchain Local Opcional

Si quieres probar con Hardhat local:

Terminal 1:

```bash
cd blockchain
npm run node
```

Terminal 2:

```bash
cd blockchain
npm run deploy:local
```

Copia la direccion desplegada a `backend/.env` como `CONTRACT_ADDRESS`.

Para Sepolia:

```bash
cd blockchain
npm run deploy:sepolia
```

## Flujo de Uso Recomendado

1. Entra como admin o superadmin.
2. Crea o revisa usuarios.
3. Crea una eleccion con candidatos.
4. Asigna votantes al censo.
5. Entra como votante.
6. Abre el dashboard y vota.
7. Consulta resultados y auditoria.

## URLs Locales Utiles

| Recurso | URL |
| --- | --- |
| Landing | `http://localhost:3000/landing` |
| Login | `http://localhost:3000/login` |
| Dashboard | `http://localhost:3000/dashboard` |
| Admin | `http://localhost:3000/admin` |
| Auditoria publica | `http://localhost:3000/transparency` |
| Backend health | `http://localhost:3001/health` |
| Stats API | `http://localhost:3001/api/stats` |
| Auditoria API | `http://localhost:3001/api/audit/public` |

## Validacion

Backend:

```bash
cd backend
npm test
npm run typecheck
```

Frontend:

```bash
cd frontend
npm run build
```

Blockchain:

```bash
cd blockchain
npm run compile
```

## Problemas Frecuentes

### El puerto 3001 esta ocupado

Ya hay un backend corriendo o un proceso usando ese puerto.

Windows:

```powershell
Get-NetTCPConnection -LocalPort 3001 | Select-Object LocalAddress,LocalPort,State,OwningProcess
Stop-Process -Id <PID>
```

Antes de pararlo, puedes comprobar si ya es VTB:

```bash
curl http://localhost:3001/health
```

### No puedo iniciar sesion

Revisa:

- Backend levantado en `http://localhost:3001`.
- `frontend/.env.local` apunta al backend correcto.
- `backend/.env` tiene `JWT_SECRET` y `NULLIFIER_SECRET`.
- La cuenta esta aprobada.
- El password es correcto.

### El voto falla por blockchain

Para voto real on-chain necesitas:

- `RPC_URL` valido.
- `CONTRACT_ADDRESS` valido.
- `PRIVATE_KEY` del relayer con ETH de Sepolia.
- Eleccion creada o sincronizada con el contrato.

En modo MVP puede existir fallback local para demo si una eleccion no esta registrada on-chain, pero la auditoria indicara si hay transaccion real.

### El tutorial vuelve a salir

El onboarding se guarda en `localStorage` con una clave por usuario. Si borras datos del navegador, cambias de navegador o usas modo incognito, volvera a mostrarse. Desde el perfil puedes reiniciarlo manualmente.

## Documentacion del Repositorio

- `README.md`: guia principal de instalacion, uso y demo.
- `ARCHITECTURE.md`: arquitectura tecnica del MVP.
- `API_DOCUMENTATION.md`: referencia de endpoints.
- `START_SERVICES.md`: comandos rapidos para levantar servicios.

## Seguridad

- No subas `.env`, `.env.local`, bases de datos ni claves privadas.
- No uses wallets con fondos reales.
- No pongas `PRIVATE_KEY` en variables del frontend.
- Usa secretos largos y aleatorios para JWT/nullifiers.
- Para produccion real, sustituir SQLite temporal por una base persistente y revisar el modelo de custodia del relayer.
