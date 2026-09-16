# VTB — Contexto del proyecto

Plataforma de votación institucional con registro en blockchain.
Proyecto de Javier Picazo y Jaime Ordovás, Ingeniería Informática (UFV).

---

## Reglas de trabajo

- **No añadas `Co-Authored-By: Claude` ni ninguna referencia a Claude
  Code en los mensajes de commit.**
- No hagas cambios masivos sin explicar antes qué vas a tocar y por qué.
- Prefiere cambios pequeños y verificables a refactors grandes.
- Build y tests después de cada módulo tocado, no al final de todo.
- No inventes dependencias ni servicios: si algo requiere una cuenta o
  una clave, dilo y para.
- Si encuentras un problema que no se te ha pedido, señálalo igualmente.
- Un informe que dice "hecho" no es prueba de nada: verifica con
  `git diff`, con los tests, o usando la aplicación.

---

## Cosas que NO hay que romper

Esto es lo más importante del documento. Todo lo de esta sección se
rompió alguna vez y costó trabajo arreglarlo.

### Nunca afirmar que el voto es anónimo

El backend conoce hoy la correspondencia entre votante y voto:
`nullifier_audit` guarda `user_id`, `election_id` y `vote_choice` en la
misma fila. Se eliminaron unas cuarenta afirmaciones falsas repartidas
por interfaz, correos, PDFs exportados y los textos en ambos idiomas.

Lo que **sí** se puede decir: registro inmutable, recuento verificable,
y prevención criptográfica del doble voto mediante nullifier.

Cuando Semaphore esté implementado se podrá recuperar la afirmación.
Hasta entonces, no — ni en código, ni en comentarios, ni en textos de
ejemplo.

### Los tests nunca corren contra Supabase

`setup.ts` fuerza SQLite en memoria. No lo toques. Una ejecución contra
Supabase llegó a sobrescribir las contraseñas de administración con
valores que están en el repositorio público.

### `npm run seed` no borra sin `--reset`

Y nunca se pone como comando de arranque en Render: borraría el censo y
los votos en cada despliegue.

### No meter datos personales en la cadena

Solo hashes y compromisos. Es lo que hace defendible el proyecto ante
el RGPD: el derecho de supresión es incompatible con la inmutabilidad
si el dato identificable está on-chain.

### Los ids de elección salen del evento `ElectionCreated`

No se renumeran ni se asumen correlativos con la base de datos. Hubo un
fallo por el que las elecciones de la base se numeraban 1, 2, 3 y se
daba por hecho que eran las mismas del contrato, cuando no lo eran: un
voto real habría quedado registrado en la elección equivocada.

### Crear elección no espera a la confirmación en cadena

La elección y sus candidatos se guardan en una transacción, se responde
al momento en estado pendiente, y el registro en blockchain va por
detrás con reintentos. Si vuelve a bloquear esperando a Sepolia, el
formulario falla por timeout y se crean duplicados.

---

## Stack

| Capa | Tecnología | Dónde |
|------|-----------|-------|
| Frontend | React 19 + Vite | Vercel |
| Backend | Express 5 + TypeScript | Render |
| Base de datos | PostgreSQL | Supabase (Frankfurt) |
| Contratos | Solidity 0.8.24 | Ethereum Sepolia |
| Correo | Resend | — |

Migraciones con **node-pg-migrate** (ficheros `.cjs` en
`backend/migrations/`). No confundir con el formato del CLI de
Supabase: son incompatibles.

---

## Arrancar en local

```
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd frontend
npm run dev
```

Abre `http://localhost:3000`. El backend está en `:3001`.

En el log del backend deben salir "Usando PostgreSQL como motor de BD"
y "VTB Backend iniciado".

Variables imprescindibles en `backend/.env`: `DATABASE_URL`,
`DB_CLIENT=postgres`, `FRONTEND_URL=http://localhost:3000`,
`JWT_SECRET`, `NULLIFIER_SECRET`, y los `SEED_*`.

`NODE_ENV` debe ser `development` en local, o las cookies llevan
`Secure` y el navegador las rechaza sobre HTTP.

Ver **SETUP.md** para el detalle completo.

### Mensajes de arranque que confunden y no son errores

- "Blockchain configurado: 0x0000…" si no hay Sepolia configurado
- Un aviso sobre SQLite aunque se esté usando PostgreSQL
- Las elecciones creadas en local sin Sepolia salen como "Pendiente de
  blockchain"

---

## Seguridad: cómo está montado

- JWT en cookies httpOnly con `Secure` y `SameSite`, nunca en
  `localStorage` ni en el body de la respuesta
- CSRF montado globalmente, con exenciones solo en login, registro y
  endpoints sin sesión previa
- Refresh con rotación; logout revoca en servidor
- Todas las llamadas del frontend pasan por `apiClient` con
  `credentials: 'include'`. Ninguna manda cabecera `Authorization`
- Rate limiting del voto por `userId`, no por IP (una universidad
  entera sale por la misma IP pública)
- Los tokens de recuperación e invitación se generan en el momento del
  envío: nunca se guardan en claro en `email_log`
- Ningún `catch` debe volcar el objeto de error completo de ethers:
  contiene la transacción firmada

---

## Qué falta, por orden

1. **Anonimato criptográfico** con Semaphore. Hasta que esté, VTB no es
   lo que su nombre promete.
2. **Recuento verificable en cadena.** Hoy `castVote` recibe el
   nullifier pero no a quién se vota, así que nadie puede recontar
   desde fuera. Hace falta un contrato nuevo con `candidateId`, y
   conviene desplegarlo a la vez que Semaphore para no rediseñarlo dos
   veces.
3. **Salir de Sepolia.** Es una red de pruebas sin garantías. La opción
   natural es Alastria.
4. **Documentación legal.** Política de privacidad, registro de
   tratamientos, contratos de encargado del tratamiento con los
   proveedores, declaración de accesibilidad. No existe nada, y es lo
   que va a parar un piloto en el servicio jurídico de una universidad,
   no el código.

---

## Contexto adicional

- **CAMBIOS_VERANO_2026.md** — qué cambió y por qué, desde la
  desvinculación de Ignacio y Sergio hasta ahora.
- **SETUP.md** — puesta en marcha, verificada en clon limpio.
- **ARCHITECTURE.md** — arquitectura del sistema.

Cada desarrollador usa su propia base de Supabase para desarrollar. No
uses la del otro: un `seed:reset` borra sus datos.
