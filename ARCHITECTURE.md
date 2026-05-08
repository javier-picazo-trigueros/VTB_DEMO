# VTB - Arquitectura del MVP

VTB es una aplicacion hibrida Web2 + Web3 para votaciones institucionales anonimas y auditables.

## Objetivo

Permitir que una institucion gestione votantes y elecciones con una interfaz web normal, pero registre una prueba publica de cada voto mediante blockchain. La identidad del votante no se publica on-chain.

## Componentes

```text
Frontend React/Vite
       |
       | HTTPS/JSON
       v
Backend Express/TypeScript
       |
       | SQLite
       v
Base de datos local

Backend relayer
       |
       | ethers.js
       v
Smart contract ElectionRegistry
```

## Frontend

Ruta principal: `frontend/src`.

Responsabilidades:

- Landing y portal institucional.
- Login y seleccion de perfil votante/admin.
- Dashboard de elecciones asignadas.
- Cabina de voto.
- Resultados y auditoria publica.
- Panel de administracion.
- Tema claro/oscuro.
- Traducciones ES/EN con i18next.
- Onboarding persistido por cuenta en `localStorage`.

Tecnologias:

- React 18
- Vite
- Tailwind CSS
- Framer Motion
- i18next
- ethers.js

## Backend

Ruta principal: `backend/src`.

Responsabilidades:

- Autenticacion con JWT.
- Hash de passwords con bcrypt.
- Gestion de usuarios, roles y dominios.
- Solicitudes de registro.
- Censo electoral por eleccion.
- Creacion de elecciones y candidatos.
- Calculo de resultados.
- Generacion de nullifiers anonimos.
- Relayer hacia blockchain.

Base de datos:

- SQLite para el MVP.
- Se inicializa y se rellena con datos demo al arrancar.
- En despliegues gratuitos sin disco persistente, los datos pueden reiniciarse.

## Blockchain

Ruta principal: `blockchain`.

Contrato:

```text
ElectionRegistry
```

Guarda:

- Elecciones on-chain.
- Nullifier anonimo por voto.
- Hash del voto.
- Historial publico de votos.

No guarda:

- Email.
- Nombre.
- Student ID.
- Rol.
- Candidato en claro.

## Flujo de Voto

1. El usuario inicia sesion y recibe un JWT.
2. El frontend carga elecciones asignadas al usuario.
3. El usuario selecciona candidato.
4. El frontend genera `voteHash`.
5. El backend verifica el JWT.
6. El backend genera `nullifier = HMAC(userId:electionId, NULLIFIER_SECRET)`.
7. El backend envia `castVote(electionId, nullifier, voteHash)` al contrato.
8. El contrato rechaza nullifiers duplicados.
9. El backend guarda auditoria local con `txHash`, `blockNumber` y `candidate_id`.
10. El usuario ve confirmacion y puede consultar resultados/auditoria.

## Modelo de Privacidad

| Dato | Donde vive | Publico |
| --- | --- | --- |
| Email/nombre/student ID | SQLite | No |
| Password hash | SQLite | No |
| Censo electoral | SQLite | No |
| Nullifier | SQLite + blockchain | Si, pero anonimo |
| Vote hash | Blockchain | Si, pero no revela candidato |
| Candidate ID para resultados | SQLite | No directamente publico como identidad |

El MVP calcula resultados desde SQLite porque el contrato no descifra ni conoce el candidato. Blockchain actua como prueba de registro, unicidad y auditoria de voto.

## Roles

| Rol | Permisos |
| --- | --- |
| Student/voter | Ver elecciones asignadas, votar, consultar resultados |
| Admin | Gestionar usuarios, solicitudes y elecciones de su dominio |
| Superadmin | Gestion global de dominios, usuarios y elecciones |

## Despliegue

| Capa | Plataforma |
| --- | --- |
| Frontend | Vercel |
| Backend | Render u otro Node host |
| Blockchain | Ethereum Sepolia o Hardhat local |
| Base de datos | SQLite para MVP |

Web publicada:

```text
https://vtb-frontend-git-main-javier-picazo-trigueros-projects.vercel.app/
```

## Limitaciones Conocidas del MVP

- SQLite no es la opcion ideal para produccion real multiusuario.
- Si el hosting no tiene disco persistente, los datos pueden resetearse.
- El backend relayer custodia la clave que envia transacciones.
- El resultado por candidato depende de SQLite, no de conteo on-chain.
- JWT se guarda en `localStorage`; para produccion seria mejor cookie httpOnly.
- Algunas rutas de admin priorizan ergonomia de demo sobre endurecimiento completo.

## Seguridad Basica

- Nunca subir `.env`.
- Nunca exponer `PRIVATE_KEY` en frontend.
- Usar secretos largos para JWT y nullifiers.
- Usar una wallet Sepolia dedicada para demo.
- Revisar CORS y persistencia antes de usar fuera de contexto academico/demo.
