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

Además, `seed` y `seed:reset` exigen `NODE_ENV` distinto de `production`
**y** `ALLOW_SEED_RESET=true` puesta a mano — sin esa variable, no se
ejecutan en ningún caso, tenga o no datos la base. Es una red de
seguridad aparte de mirar si la base está vacía: una base recién
migrada en producción tiene 0 usuarios, y solo con la comprobación
antigua eso bastaba para sembrarla igual.

### Producción y desarrollo son proyectos de Supabase distintos

Con secretos distintos (`JWT_SECRET`, `NULLIFIER_SECRET`, contraseñas
del seed). El `.env` local de cada desarrollador nunca apunta a la
`DATABASE_URL` de producción, ni para comprobar algo puntual.

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

### `castVote` recibe la POSICIÓN del candidato, no `candidates.id`

`candidates.id` es un autoincremento global de la base; la posición es
el número de orden dentro de esa elección, 0..n-1. El contrato indexa el
recuento por la posición (`votesFor[electionId][candidateId]`) y rechaza
cualquier valor `>= candidateCount`.

`routes/elections.ts` envía `candidato.position`. Mandar el `id` en su
lugar registra el voto a otro candidato, o revierte si se sale de rango.
Es la misma clase de fallo que el de los ids de elección.

### `candidateId` es obligatorio y se valida contra esa elección

No hay voto sin candidato, y se comprueba que el candidato pertenece a
la elección antes de enviar nada a la cadena.

Las posiciones tienen que ser 0..n-1 densas, sin huecos ni repetidos:
`services/candidatesRoot.ts` lanza `ListaDeCandidatosInvalida` si no lo
son. Con posiciones {0, 5} y dos candidatos, el contrato registraría
`candidateCount = 2` y el voto al 5 revertiría en cadena.

### No se inventan hashes: si la elección no está en el contrato, 503

Había dos caminos (BC-21 y BC-22) que, cuando la transacción fallaba,
guardaban un SHA-256 con prefijo `0x` —indistinguible de un hash de
transacción real para quien no consulte la cadena— y respondían que el
voto se había registrado correctamente. Un voto fuera de cadena
presentado como voto en cadena.

Si `chain_status` no es `synced`, es `503 ELECTION_NOT_ON_CHAIN` para
todo el mundo, cuentas de demostración incluidas. Un campo sin
transacción real va a NULL, nunca a un dato con forma de prueba.

### `onChainVerified` significa que los dos recuentos coinciden

No significa que alguna fila tenga `tx_hash`. Antes era eso: con 1.000
votos de los que uno llegó a la cadena, la elección salía verificada — y
ni siquiera se consultaba la cadena, se miraban columnas que la propia
base había rellenado.

Ahora se pide `getTally()` al contrato y se compara candidato a
candidato contra la base, contando solo los votos cuyo `vote_source` es
`chain`. Cuatro estados: coincide, discrepancia, sin-respuesta y
no-aplica. **Sin respuesta no es verificado**: que el nodo no conteste
no dice nada sobre el resultado.

### `queryFilter` siempre con rango desde el bloque de despliegue

Sin rango empieza en el bloque 0, y todos los proveedores limitan
`eth_getLogs`: la consulta fallaba siempre y el job de reconciliación no
funcionó nunca (BC-23).

Se parte de `DEPLOY_BLOCK`, o de `contract.deploymentBlock()` si no está
definida, y se avanza en ventanas de 45.000 bloques.

### El owner del contrato nunca en un `.env`

Son dos claves distintas y se custodian por separado (BC-05):

- **relayer**: caliente, vive en el servidor porque firma cada voto. Es
  lo único que hay en `PRIVATE_KEY`.
- **owner**: fría, fuera del servidor. Autoriza o revoca relayers,
  detiene elecciones y traspasa la propiedad.

`scripts/deploy.ts` aborta en una red real si el owner y el relayer son
la misma dirección. El owner no puede tocar el recuento ni añadir o
borrar votos; si el servidor se ve comprometido, revoca su relayer sin
redesplegar el contrato y sin perder el histórico.

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
2. **Recuento verificable en cadena.** Hecho en el contrato
   `ElectionRegistryV2`: `castVote` lleva el candidato y `getTally()`
   permite recontar desde fuera. El procedimiento para un tercero está
   en `RECUENTO_INDEPENDIENTE.md`.
   Pendiente: dejar el despliegue operativo — el relayer del servidor
   sigue sin autorizar en el contrato — y el corte de las elecciones
   que siguen en el contrato anterior.
3. **Salir de Sepolia.** Es una red de pruebas sin garantías. La opción
   natural es Alastria.
4. **Documentación legal.** Política de privacidad, registro de
   tratamientos, contratos de encargado del tratamiento con los
   proveedores, declaración de accesibilidad. No existe nada, y es lo
   que va a parar un piloto en el servicio jurídico de una universidad,
   no el código.

---

## Contexto adicional

- **CAMBIOS_VERANO_2026.md** — el paso al contrato v2 y lo que
  arrastra: base de datos, camino del voto y resultados.
- **RECUENTO_INDEPENDIENTE.md** — cómo recuenta una elección alguien
  de fuera, sin credenciales nuestras. Es el entregable que sostiene
  la tesis del proyecto.
- **SEGURIDAD.md** — qué garantiza el sistema y qué no, escrito para
  un comité electoral.
- **SETUP.md** — puesta en marcha, verificada en clon limpio.
- **ARCHITECTURE.md** — arquitectura del sistema.

Cada desarrollador usa su propia base de Supabase para desarrollar. No
uses la del otro: un `seed:reset` borra sus datos.
