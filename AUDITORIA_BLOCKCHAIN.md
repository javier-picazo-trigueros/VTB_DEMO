# Auditoría de la capa blockchain — VTB

**Fecha:** 2026-08-27
**Alcance:** `blockchain/` completo + toda la integración Web3 del backend y del frontend.
**Método:** lectura de código + **consultas en vivo contra el contrato desplegado en Sepolia**
(`0x92110ea2a133567a0d6237e8991Fff336cd70778`, chainId 11155111) vía el RPC de Alchemy
configurado en `backend/.env`.
**Modo:** solo diagnóstico. No se ha modificado ni un archivo.

---

## Resumen ejecutivo

Hay un hallazgo que domina a todos los demás y conviene leerlo antes que nada:

> **El contrato lleva desplegado desde el 2026-05-09 con 18 elecciones creadas y
> `totalVotes == 0` en las 18. Nunca se ha registrado un solo voto en la cadena.**

Verificado consultando `getElection(1..18)` en vivo. Como `totalVotes` solo se incrementa
dentro de `castVote` ([VTB.sol:194](blockchain/contracts/VTB.sol#L194)), un contador a cero en
todas las elecciones demuestra que `castVote` no se ha ejecutado nunca con éxito. La causa
está identificada (BC-21: 22 de las cuentas semilla son `@vtb.demo` y toman un atajo
sintético antes de tocar la cadena). O sea: hoy la capa blockchain es decorativa.

Dicho eso, el contrato en sí no es basura. Es pequeño, no tiene reentrancy, no usa
`delegatecall` ni `tx.origin`, no es actualizable y **el owner no puede alterar el recuento**.
Los problemas serios son de diseño y de integración, no de bugs de Solidity.

### Tabla de hallazgos

| ID | Severidad | ¿Rompe o es mejora? | Dónde | Hallazgo |
|----|-----------|---------------------|-------|----------|
| BC-01 | **CRÍTICO** | Rompe | [VTB.sol:181-185](blockchain/contracts/VTB.sol#L181-L185) | `castVote` no tiene control de acceso: cualquiera puede inflar el recuento |
| BC-02 | **CRÍTICO** | Rompe | Estado en vivo | Cero votos on-chain en las 18 elecciones. La capa está muerta |
| BC-03 | **CRÍTICO** | Rompe | [database.ts:77-86](backend/src/config/database.ts#L77-L86) | `user_id` + `candidate_id` en la misma fila: secreto del voto = 0 |
| BC-12 | **CRÍTICO** | Rompe | [VotingBooth.jsx:526-528](frontend/src/pages/VotingBooth.jsx#L526-L528) | El `voteHash` no es un compromiso: el salt se pierde, nadie puede abrirlo nunca |
| BC-28 | **CRÍTICO** | Rompe | [elections.ts:521-578](backend/src/routes/elections.ts#L521-L578) | `/audit` público sin auth y con `txHash` sintético indistinguible del real |
| BC-04 | ALTO | Rompe | [VTB.sol:196-201](blockchain/contracts/VTB.sol#L196-L201), [281-288](blockchain/contracts/VTB.sol#L281-L288) | `voteHistory` sin cota + `getVoteHistory` devuelve todo → DoS de auditoría |
| BC-05 | ALTO | Rompe | [elections.ts:37-43](backend/src/routes/elections.ts#L37-L43) | Relayer == deployer == owner: una sola clave caliente con poderes de admin |
| BC-10 | ALTO | Rompe | Etherscan | Contrato **no verificado** en Sepolia (comprobado) |
| BC-11 | ALTO | Rompe | [auth.ts:126-137](backend/src/utils/auth.ts#L126-L137) | El nullifier es trivialmente desanonimizable si se filtra `NULLIFIER_SECRET` |
| BC-16 | ALTO | Rompe | [elections.ts:741](backend/src/routes/elections.ts#L741) | `tx.wait()` sin timeout y con 1 confirmación |
| BC-17 | ALTO | Rompe | [elections.ts:734-738](backend/src/routes/elections.ts#L734-L738) | Cero gestión de nonce: votación concurrente rompe el relayer |
| BC-19 | ALTO | Rompe | [elections.ts:741-761](backend/src/routes/elections.ts#L741-L761) | Ninguna defensa frente a reorganización de cadena |
| BC-21 | ALTO | Rompe | [elections.ts:667-687](backend/src/routes/elections.ts#L667-L687) | Atajo demo: 22 cuentas nunca llegan a la cadena, con txHash falso |
| BC-22 | ALTO | Rompe | [elections.ts:822-843](backend/src/routes/elections.ts#L822-L843) | Fallback silencioso: voto fuera de cadena presentado como éxito |
| BC-27 | ALTO | Rompe | `frontend/.env` (`VITE_RPC_URL`) | La API key de Alchemy va en el bundle del navegador, y es la misma del backend |
| BC-29 | ALTO | Rompe | [VotingBooth.jsx:445](frontend/src/pages/VotingBooth.jsx#L445) | ABI del evento incorrecto → topic0 distinto → el feed en vivo nunca dispara |
| BC-30 | ALTO | Rompe | [elections.ts:449-471](backend/src/routes/elections.ts#L449-L471), [506](backend/src/routes/elections.ts#L506) | Los resultados salen 100% de la BD; `onChainVerified` es un badge engañoso |
| BC-07 | MEDIO | Rompe | [admin.ts:693](backend/src/routes/admin.ts#L693), [syncElections.ts:80-81](backend/src/scripts/syncElections.ts#L80-L81) | La ventana on-chain no es la ventana real de la elección |
| BC-18 | MEDIO | Rompe | [elections.ts:734-738](backend/src/routes/elections.ts#L734-L738) | Sin `gasLimit` ni política de fees ni reintento con bump |
| BC-20 | MEDIO | Rompe | [elections.ts:868-871](backend/src/routes/elections.ts#L868-L871) | `details: blockchainError.message` crudo al cliente |
| BC-23 | MEDIO | Rompe | [index.ts:247](backend/src/index.ts#L247) | `queryFilter` sin rango de bloques: revienta en Sepolia (reproducido) |
| BC-24 | MEDIO | Rompe | [index.ts:251-256](backend/src/index.ts#L251-L256) | Fallo de RPC indistinguible de "no votó" → marca `failed` |
| BC-25 | MEDIO | Rompe | [syncElections.ts:56-66](backend/src/scripts/syncElections.ts#L56-L66), [elections.ts:184-208](backend/src/routes/elections.ts#L184-L208) | Mapeo de IDs por posición del array, sin verificar contra la cadena |
| BC-06 | MEDIO | Mejora | [VTB.sol:159-166](blockchain/contracts/VTB.sol#L159-L166) | El owner puede cerrar una elección en curso (censura, no manipulación) |
| BC-15 | MEDIO | Mejora | Diseño | Todas las tx salen de una EOA: correlación de timing desanonimiza |
| BC-08 | BAJO | Mejora | [admin.ts:698](backend/src/routes/admin.ts#L698) | Lee `electionCount()` post-tx en vez del evento del receipt: carrera |
| BC-09 | BAJO | Mejora | `blockchain/test/` | No existe. Cero tests del contrato |
| BC-13 | BAJO | Mejora | [VTB.sol:105-108](blockchain/contracts/VTB.sol#L105-L108) | Sin `transferOwnership`, sin pausa, sin evento de ownership |
| BC-14 | BAJO | Mejora | [elections.ts:123-178](backend/src/routes/elections.ts#L123-L178) | `/blockchain-sync-status` es público sin auth |

---

# PARTE 1 — El contrato

Archivo único: [blockchain/contracts/VTB.sol](blockchain/contracts/VTB.sol), 296 líneas,
Solidity `^0.8.24`, optimizer activado, 200 runs, evmVersion `paris`.
Sin herencia, sin librerías, sin OpenZeppelin, sin proxy.

## 1.1 Qué garantiza realmente

Lo que **sí** garantiza, y lo garantiza de verdad:

1. **Un nullifier no puede usarse dos veces en la misma elección.**
   [VTB.sol:188-191](blockchain/contracts/VTB.sol#L188-L191). El check es correcto y la
   escritura es atómica en la misma tx. Esto es sólido.
2. **Inmutabilidad de lo escrito.** No hay ninguna función que borre o modifique
   `votes`, `totalVotes` o `voteHistory`. Ni el owner. Verificado leyendo las 296 líneas:
   `votes[...]` se escribe solo en [L193](blockchain/contracts/VTB.sol#L193),
   `totalVotes` solo se incrementa en [L194](blockchain/contracts/VTB.sol#L194), y
   `voteHistory` solo recibe `push` en [L196](blockchain/contracts/VTB.sol#L196).
3. **Marca temporal fiable.** `block.timestamp` y `block.number` los pone el bloque, no el
   backend ([L199-L200](blockchain/contracts/VTB.sol#L199-L200)). Un voto no se puede
   antedatar.
4. **Trazabilidad pública.** El evento `VoteCast` queda indexado por `electionId` y
   `nullifier` ([L27-L32](blockchain/contracts/VTB.sol#L27-L32)), lo que permite filtrar
   sin escanear todo.

Lo que **no** garantiza, y el comentario de cabecera del propio archivo sugiere que sí:

1. **No garantiza que el que vota tenga derecho a votar.** Ver BC-01. El contrato no sabe
   nada del censo.
2. **No garantiza que el número de votos on-chain sea el número de votantes legítimos.**
   Consecuencia directa de lo anterior.
3. **No garantiza a qué candidato corresponde un voto.** El `voteHash` es opaco para el
   contrato — y, como veremos en la Parte 2, opaco para todo el mundo, para siempre.
4. **No garantiza que la elección on-chain sea la elección de la aplicación.** El vínculo
   `elections.election_id_blockchain` ↔ ID on-chain es una convención de la base de datos
   que nadie verifica (BC-25).
5. **No garantiza el secreto del voto.** El contrato no lo rompe, pero tampoco lo protege:
   quien lo rompe es la BD (BC-03).

> El comentario de [VTB.sol:19](blockchain/contracts/VTB.sol#L19) dice
> *"Blockchain provides a public, immutable audit trail without revealing identity"*.
> La parte de *immutable* es cierta. La de *audit trail* solo lo sería si el recuento
> derivase de la cadena, y no lo hace (BC-30).

## 1.2 ¿Valida la ventana temporal on-chain?

**Sí, la valida on-chain.** Esto es lo que hace bien y merece decirse claramente.

El modificador `electionIsActive`
([VTB.sol:91-99](blockchain/contracts/VTB.sol#L91-L99)) comprueba las tres cosas:

```solidity
require(elections[_id].active, "ERR: election not active");
require(
    block.timestamp >= elections[_id].startTime &&
    block.timestamp <= elections[_id].endTime,
    "ERR: election out of time window"
);
```

y se aplica a `castVote` en [L185](blockchain/contracts/VTB.sol#L185), después de
`electionExists` (el orden de modificadores es el correcto). No confía en el backend.

**Pero** — y aquí está el matiz (BC-07) — la ventana que valida **no es la ventana real de
la elección**. Tres sitios distintos meten ventanas falseadas:

| Origen | Qué escribe on-chain | Línea |
|--------|----------------------|-------|
| `admin.ts` al crear elección | `start = max(start_time_BD, ahora + 120s)` | [admin.ts:693](backend/src/routes/admin.ts#L693) |
| `syncElections.ts` | `start = max(start_BD, ahora+120)`, `end = max(end_BD, ahora+30 días)` | [syncElections.ts:80-81](backend/src/scripts/syncElections.ts#L80-L81) |
| `createElections.ts` | `start = ahora + 1h`, `end = ahora + 1 año` | [createElections.ts:18-19](blockchain/scripts/createElections.ts#L18-L19) |

El motivo técnico es real: `createElection` exige `_startTime >= block.timestamp`
([VTB.sol:126](blockchain/contracts/VTB.sol#L126)), así que no puedes registrar una elección
que ya empezó. Pero la solución elegida (empujar el inicio al futuro y estirar el final)
tiene dos consecuencias:

- Hay una **ventana ciega de 120 segundos** tras crear una elección en la que la BD dice
  "activa" y la cadena rechaza con `ERR: election out of time window`. Ese error cae en el
  `catch` de [elections.ts:799](backend/src/routes/elections.ts#L799), que **no** lo
  reconoce como `isElectionMissing`, así que el votante recibe un 500 genérico.
- El `end` on-chain puede ser **meses posterior** al cierre real. Confirmado en vivo: la
  elección on-chain 5 (`VTB Demo Sandbox Election`) tiene `end = 1787733108`
  (≈ 2026-09-24), y las creadas por `syncElections` se estiran a 30 días mínimo. La cadena
  aceptaría votos mucho después de que la aplicación haya cerrado el escrutinio.

**Veredicto:** la validación temporal on-chain existe y funciona, pero valida una ventana
inventada por el backend. Es correcta técnicamente e inútil como garantía.

## 1.3 ¿Quién puede llamar a cada función? — BC-01, CRÍTICO

| Función | Restricción | Línea |
|---------|-------------|-------|
| `createElection` | `onlyOwner` | [L124](blockchain/contracts/VTB.sol#L124) |
| `setElectionStatus` | `onlyOwner` | [L149](blockchain/contracts/VTB.sol#L149) |
| `closeElection` | `onlyOwner` | [L161](blockchain/contracts/VTB.sol#L161) |
| **`castVote`** | **NINGUNA** | [L185](blockchain/contracts/VTB.sol#L185) |
| `getElection`, `getVoteCount`, `getTotalVotes`, `hasVoted`, `getVoteHash`, `getVoteHistory`, `getElectionCount` | públicas (son `view`) | L213-L295 |

### El problema

```solidity
function castVote(
    uint256 _electionId,
    bytes32 _nullifier,
    bytes32 _voteHash
) external electionExists(_electionId) electionIsActive(_electionId) {
```

`external` sin modificador de acceso. **Cualquier dirección de Ethereum puede llamar a
`castVote`** en cualquiera de vuestras 18 elecciones activas, con cualquier `nullifier` de
32 bytes que se invente y cualquier `voteHash`.

El único requisito es que el nullifier no se haya usado antes — y como es un `bytes32`
arbitrario elegido por el atacante, tiene 2²⁵⁶ nullifiers frescos disponibles. Coste: solo
gas, en una testnet donde el ETH sale de un faucet gratis.

Esto significa que:

- `getVoteCount(id)` y `elections[id].totalVotes` son **inflables a voluntad por cualquiera**.
- `getVoteHistory(id)` y el flujo de eventos `VoteCast` son **contaminables**.
- Cualquier cosa que la app muestre como "verificado en blockchain" es falsificable por
  un tercero sin acceso a vuestro sistema.

La arquitectura descrita en la cabecera del contrato (backend como relayer, pasos 1-6 en
[L13-L19](blockchain/contracts/VTB.sol#L13-L19)) **asume** que el único llamante es el
relayer, pero el contrato no lo impone en ningún sitio. Es la brecha entre el comentario
y el código.

**Lo que haría falta:** un `onlyRelayer` (o directamente `onlyOwner`) sobre `castVote`, con
un `mapping(address => bool) relayers` gestionado por el owner. Eso convierte el recuento
on-chain en algo con sentido, a costa de admitir explícitamente que el sistema es de
confianza centralizada — que es lo que ya es. La alternativa de verdad descentralizada
(prueba de pertenencia al censo verificada on-chain, tipo Merkle proof o zk) es otro
proyecto.

## 1.4 ¿Puede el owner manipular el recuento? — NO

Esta es una buena noticia y quiero ser preciso, porque es la pregunta que más va a importar
en una defensa.

**El owner NO puede:**

- Añadir votos. No existe ninguna función que escriba en `votes` o incremente `totalVotes`
  salvo `castVote`, y `castVote` está sujeta al mismo check de nullifier duplicado para
  todo el mundo, owner incluido.
- Borrar o modificar un voto emitido. No hay `delete`, no hay setter.
- Cambiar `totalVotes` directamente. No hay setter.
- Reescribir `voteHistory`. Solo hay `push`.
- Actualizar el contrato. No hay proxy, no hay `delegatecall`, no hay `selfdestruct`.
- Cambiar el propietario. No hay `transferOwnership` — `owner` se fija en el constructor
  ([L106](blockchain/contracts/VTB.sol#L106)) y es inmutable.

**El owner SÍ puede (BC-06, censura):**

- `closeElection(id)` en mitad de la votación
  ([L159-L166](blockchain/contracts/VTB.sol#L159-L166)) → a partir de ahí `castVote`
  revierte con `ERR: election not active`. Los votos ya emitidos permanecen intactos, pero
  el owner puede **cortar la votación cuando le convenga el marcador**. Como el recuento es
  público en tiempo real vía `getVoteCount`, esto es un vector de manipulación de resultado
  por censura, no por falsificación.
- `setElectionStatus(id, true/false)` → reabrir, siempre dentro de la ventana temporal.
- Crear elecciones falsas indistinguibles de las reales.

**Y quién es ese owner (BC-05, ALTO):**

Comprobado derivando las direcciones de las claves privadas en local (sin imprimirlas):

```
blockchain/.env  DEPLOYER_PRIVATE_KEY -> 0x5D73CB4895b15E535901A15C980d7A990C4bD572
blockchain/.env  PRIVATE_KEY          -> 0x5D73CB4895b15E535901A15C980d7A990C4bD572
backend/.env     PRIVATE_KEY          -> 0x5D73CB4895b15E535901A15C980d7A990C4bD572
owner() on-chain                       = 0x5D73CB4895b15E535901A15C980d7A990C4bD572
```

**La misma clave** es el deployer, el owner y el relayer que firma cada voto. Esa clave vive
en el `.env` del servidor de aplicación, en un proceso expuesto a internet, y se usa en
caliente en cada petición de voto. Comprometer el backend = poder cerrar elecciones, crear
elecciones falsas y (dado BC-01, aunque eso ya lo puede cualquiera) escribir votos. Balance
actual de esa cuenta: 9.23 ETH de Sepolia, nonce 88.

Y como no hay `transferOwnership`, **no se puede rotar**. Si esa clave se filtra, la única
salida es redesplegar el contrato y perder todo el historial.

## 1.5 ¿Qué pasa si se llama dos veces con el mismo nullifier?

El comportamiento es **correcto**. La segunda llamada revierte:

```solidity
require(
    votes[_electionId][_nullifier] == bytes32(0),
    "ERR: nullifier already used (double-vote prevented)"
);
```
[VTB.sol:188-191](blockchain/contracts/VTB.sol#L188-L191)

Como es un `require` y no un no-op silencioso, la tx revierte entera: no se incrementa
`totalVotes`, no se hace `push` en `voteHistory`, no se emite evento. Consistente.

**Tres matices:**

1. **El nullifier cero es un caso especial.** El "ya usado" se detecta por
   `votes[...] == bytes32(0)`, es decir el valor por defecto del mapping. Por eso hay un
   guard explícito en [L186](blockchain/contracts/VTB.sol#L186) rechazando el nullifier
   cero, y otro en [L187](blockchain/contracts/VTB.sol#L187) rechazando `voteHash` cero — si
   `voteHash` pudiera ser cero, el voto se guardaría pero `hasVoted` devolvería `false` y el
   nullifier sería reutilizable. Los dos guards están bien puestos. Correcto.

2. **El backend traduce mal el revert.** En
   [elections.ts:859-866](backend/src/routes/elections.ts#L859-L866) se busca la subcadena
   `"nullifier already used"` en `blockchainError.message` para devolver 409. Con ethers v6
   y un provider que hace `eth_estimateGas` previo, el mensaje suele llegar como
   `execution reverted: "ERR: nullifier already used (double-vote prevented)"`, así que
   normalmente funciona — pero es matching frágil sobre texto. Lo robusto sería decodificar
   el revert reason del `CALL_EXCEPTION`. **Mejora.**

3. **El scope del nullifier no coincide con el scope on-chain.** El nullifier se genera con
   el ID *local* de la elección (`generateNullifier(decoded.userId, electionId)`,
   [elections.ts:655](backend/src/routes/elections.ts#L655)) pero se escribe en el mapping
   indexado por el ID *on-chain* (`election.election_id_blockchain`,
   [elections.ts:735](backend/src/routes/elections.ts#L735)). Mientras el mapeo 1:1 se
   mantenga no pasa nada, pero si `fix-blockchain-ids` remapea (BC-25), dos elecciones
   locales distintas pueden acabar apuntando al mismo ID on-chain y sus nullifiers
   colisionarían en el mismo namespace. **Rompe, en ese escenario.**

## 1.6 Reentrancy, overflow, gas, `tx.origin`, `delegatecall`

Repasadas una por una sobre las 296 líneas:

| Vector | Estado | Justificación |
|--------|--------|---------------|
| **Reentrancy** | **Limpio** | `castVote` no hace **ninguna** llamada externa: ni `call`, ni `transfer`, ni `send`, ni interacción con otro contrato. No hay superficie de reentrada. No hace falta `nonReentrant`. |
| **Overflow / underflow** | **Limpio** | Solidity 0.8.24 → aritmética con checks por defecto. `electionCount++` ([L128](blockchain/contracts/VTB.sol#L128)) y `totalVotes++` ([L194](blockchain/contracts/VTB.sol#L194)) revertirían antes de dar la vuelta. No hay bloques `unchecked`. |
| **`tx.origin`** | **No se usa** | Ni una aparición en el archivo. La autorización usa `msg.sender` ([L82](blockchain/contracts/VTB.sol#L82)), que es lo correcto. |
| **`delegatecall`** | **No se usa** | Tampoco `call`, `staticcall`, `assembly`, `selfdestruct` ni `create2`. Contrato no actualizable, sin proxy. |
| **Manipulación de `block.timestamp`** | **No explotable** | Un validador puede desviarlo unos segundos. Irrelevante para ventanas de días. |
| **Front-running / MEV** | **No aplica hoy** | Sin acceso restringido (BC-01) no hay nada que adelantar: cualquiera puede votar directamente. Si se arregla BC-01, un observador del mempool vería el par `(nullifier, voteHash)` antes de que se mine, pero el `voteHash` no revela la papeleta. |
| **ETH atascado** | **Riesgo teórico** | No hay funciones `payable` ni `receive`/`fallback`, así que no se puede enviar ETH normalmente. Se podría forzar vía `selfdestruct` de otro contrato, y quedaría bloqueado para siempre. Irrelevante en la práctica. |
| **Límites de gas** | **PROBLEMA — BC-04** | Ver abajo. |

### BC-04 — `voteHistory` no acotado (ALTO, rompe)

Dos problemas en el mismo sitio.

**Coste por voto.** [VTB.sol:196-201](blockchain/contracts/VTB.sol#L196-L201) hace `push` de
un `VoteRecord` de 4 palabras (`nullifier`, `voteHash`, `timestamp`, `blockNumber`), más la
actualización del length del array. Eso son ~5 slots frescos ≈ **100.000 gas adicionales por
voto**, aproximadamente triplicando el coste de la transacción. Y esos datos **ya están en
el evento `VoteCast`**, que cuesta unos 2.000 gas. Es almacenamiento duplicado y caro de
información que no se consume desde ningún contrato.

**DoS de la función de auditoría.**
[VTB.sol:281-288](blockchain/contracts/VTB.sol#L281-L288):

```solidity
function getVoteHistory(uint256 _id) public view ... returns (VoteRecord[] memory) {
    return voteHistory[_id];
}
```

Devuelve el array **entero**, sin paginación. Es `view`, así que no cuesta gas real, pero
`eth_call` tiene un límite de gas en el nodo (Alchemy ronda los 50M) y un límite de tamaño
de respuesta. Con una elección de decenas de miles de votos, copiar todo el array de storage
a memoria y ABI-codificarlo agota ese presupuesto y la llamada revierte. **La función de
auditoría se vuelve permanentemente inaccesible justo en las elecciones grandes**, que son
las que importan. Y como los datos ya están escritos, no hay forma de arreglarlo sin
redesplegar.

Sí conviene decir que hoy `getVoteHistory` no se llama desde ningún sitio del backend ni del
frontend (verificado por grep), así que el impacto actual es solo el coste de gas.

## 1.7 ¿Está verificado en Etherscan de Sepolia? — BC-10, NO

**No.** Comprobado directamente:
`https://sepolia.etherscan.io/address/0x92110ea2a133567a0d6237e8991Fff336cd70778` muestra
*"Are you the contract creator? Verify and Publish your contract source code today!"*, es
decir el estado de **no verificado**. Solo hay bytecode.

Las causas están en el repo:

- `blockchain/package.json` no tiene script `verify`, solo `compile`, `deploy:local`,
  `deploy:sepolia` y `node`.
- `blockchain/.env` **no contiene `ETHERSCAN_API_KEY`** (comprobadas las claves presentes:
  `PORT`, `DATABASE_URL`, `JWT_SECRET`, `HMAC_SECRET`, `NULLIFIER_SECRET`,
  `CONTRACT_ADDRESS`, `PRIVATE_KEY`, `RPC_URL`, `SEPOLIA_RPC_URL`, `ALCHEMY_API_KEY`,
  `EXPLORER_URL`, `CORS_ORIGINS`, `NODE_ENV`, `DEPLOYER_PRIVATE_KEY`). El bloque
  `etherscan.apiKey` de [hardhat.config.ts:54-58](blockchain/hardhat.config.ts#L54-L58)
  resuelve a cadena vacía.
- `deploy.ts` no invoca verificación tras el despliegue.

**Esto es importante para la tesis del proyecto:** sin verificación, un tercero no puede
leer qué reglas aplica vuestro contrato. Toda la propuesta de "auditable públicamente" se
cae en el primer paso, porque el auditor externo solo ve un blob hexadecimal.

**La buena noticia: verificar es trivial y sin riesgo.** He comparado el bytecode desplegado
con el compilado localmente:

```
deployed bytecode len        8672
local deployedBytecode len   8672
EXACT MATCH: true            (incluido el hash de metadata)
```

Coincidencia byte a byte, metadata incluida. Es decir: `blockchain/contracts/VTB.sol` en el
repo **es exactamente** lo que está corriendo en Sepolia, compilado con
`0.8.24+commit.e11b9ed9`, optimizer on, 200 runs, evmVersion `paris`. Basta una
`ETHERSCAN_API_KEY` y un `npx hardhat verify --network sepolia 0x9211...` para que quede
verificado a la primera.

## 1.8 BC-09 — Cero tests del contrato (BAJO, mejora)

`blockchain/test/` no existe. `hardhat.config.ts` lo declara en
[L62](blockchain/hardhat.config.ts#L62) pero el directorio no está. No hay ni un test que
compruebe el doble voto, la ventana temporal, ni el control de acceso. Para un TFG con un
contrato de 296 líneas, una suite de ~15 tests es barata y da mucho.

---

# PARTE 2 — Lo que de verdad se escribe on-chain

## 2.1 Detalle exacto de un voto

Cada `castVote` exitoso escribe **dos cosas**.

### En storage (permanente, consultable por cualquiera)

| Slot | Contenido | Tipo | Origen |
|------|-----------|------|--------|
| `votes[electionId][nullifier]` | `voteHash` | `bytes32` | Lo envía el frontend |
| `elections[electionId].totalVotes` | contador +1 | `uint256` | Lo calcula el contrato |
| `voteHistory[electionId][n].nullifier` | `nullifier` | `bytes32` | HMAC del backend |
| `voteHistory[electionId][n].voteHash` | `voteHash` | `bytes32` | Frontend |
| `voteHistory[electionId][n].timestamp` | `block.timestamp` | `uint256` | El bloque |
| `voteHistory[electionId][n].blockNumber` | `block.number` | `uint256` | El bloque |

### En logs (el evento, indexado y barato de filtrar)

```
VoteCast(uint256 indexed electionId, bytes32 indexed nullifier, bytes32 voteHash, uint256 timestamp)
topic0 = 0xd7b04ae01b62a25f84734dba45d621027e2a2906fe6a9a3914f5bbf274070706
topic1 = electionId
topic2 = nullifier
data   = voteHash ++ timestamp
```

### Y en los metadatos de la transacción, que la gente olvida

- **`from`** = la dirección del relayer, `0x5D73CB…D572`. Igual en todos los votos.
- **`to`** = la dirección del contrato.
- **timestamp del bloque**, con precisión de ~12 segundos.
- **gas pagado**, nonce, etc.

Eso último importa para la privacidad (BC-15) y no aparece en ninguna documentación
del proyecto.

## 2.2 ¿Va algún dato personal, aunque sea hasheado?

**Datos personales directos: no.** Ni emails, ni nombres, ni DNI, ni IDs de estudiante, ni
direcciones de wallet de votantes. Eso está bien y el diseño lo respeta.

**Pero sí va un identificador seudonimizado derivado de la identidad**, y bajo el RGPD un
seudónimo sigue siendo dato personal si existe alguien que pueda revertir la asociación —
y aquí ese alguien existe: sois vosotros.

Además, **el nombre de la elección va on-chain en claro**
([VTB.sol:139](blockchain/contracts/VTB.sol#L139)). Verificado en vivo, incluye cosas como
`Delegado Ingeniería Informatica 2026/27`, `UFV Student Council President 2025`,
`Highlands Head of House Election`. No es dato personal, pero revela la institución, la
facultad y el curso académico. Para un grupo pequeño (p. ej. la delegación de una
titulación concreta), combinar "nombre de la elección" con "número de votantes" ya reduce
mucho el anonimato del conjunto.

## 2.3 ¿El nullifier es reversible? — BC-11, ALTO

Esta es la pregunta más importante de la Parte 2, y la respuesta es más incómoda de lo que
sugiere la documentación.

El nullifier se genera en
[auth.ts:126-137](backend/src/utils/auth.ts#L126-L137):

```typescript
export function generateNullifier(userId: number, electionId: number): string {
  const message = `${userId}:${electionId}:vtb-voter`;
  const nullifier = crypto
    .createHmac("sha256", REQUIRED_HMAC_SECRET)
    .update(message)
    .digest("hex");
  return "0x" + nullifier;
}
```

**Sin el secreto: no es reversible.** HMAC-SHA256 es una PRF. Sin `NULLIFIER_SECRET` no hay
ataque práctico ni por fuerza bruta ni por diccionario. Hasta aquí, correcto.

**Con el secreto: se rompe entero en segundos.** Y esto es lo que hay que entender bien.

El espacio de preimagen es `${userId}:${electionId}:vtb-voter`. `userId` es el
`INTEGER PRIMARY KEY AUTOINCREMENT` de la tabla `users`
([database.ts](backend/src/config/database.ts)), o sea **un entero secuencial pequeño**, y
`electionId` otro. Para una institución con 5.000 alumnos y 20 elecciones, el espacio total
es 100.000 combinaciones. Construir la tabla completa `nullifier → (userId, electionId)`
es cuestión de **milisegundos**, no de años.

O sea: **el anonimato del sistema no descansa en criptografía, descansa en que
`NULLIFIER_SECRET` no se filtre nunca**. Es una propiedad de custodia de secretos, no una
propiedad matemática. Y la pregunta que hacías — *"¿es reversible si alguien conoce el
formato de los identificadores de estudiante?"* — tiene esta respuesta precisa:

> Conocer el formato no basta. Conocer el formato **y** el secreto basta y sobra. Y como el
> formato es un entero secuencial, el secreto es literalmente lo único que separa la cadena
> pública de una lista nominal de quién votó en qué elección.

**Agravantes concretos:**

1. **El secreto tiene un fallback de desarrollo.**
   [auth.ts:58-60](backend/src/utils/auth.ts#L58-L60) usa
   `"dev-only-nullifier-secret-change-before-prod"` si `NODE_ENV !== "production"`. Ese
   valor está en el repositorio. Cualquier despliegue sin `NODE_ENV=production`
   correctamente puesto tiene un nullifier con secreto conocido por todo el mundo. El guard
   de [L67-L72](backend/src/utils/auth.ts#L67-L72) solo salta en producción.
2. **El secreto no se puede rotar.** Rotar `NULLIFIER_SECRET` cambia todos los nullifiers
   futuros, lo que destruye la detección de doble voto de cualquier elección en curso: un
   usuario que ya votó generaría un nullifier nuevo y `castVote` lo aceptaría. No hay
   versionado de secreto ni migración.
3. **El mismo secreto sirve para todas las elecciones y todas las instituciones.** No hay
   derivación por elección ni por tenant, así que una sola filtración compromete el
   histórico completo de la plataforma, retroactivamente y para siempre — los datos están en
   una cadena pública inmutable.
4. **La lista de nullifiers se publica sin autenticación.** El endpoint
   [`/elections/:id/audit`](backend/src/routes/elections.ts#L521) (BC-28) devuelve todos los
   `nullifier_hash` de una elección sin pedir sesión. Quien tenga el secreto ni siquiera
   necesita leer la cadena.

**Lo que haría falta:** un nullifier que no dependa de un secreto del servidor. Lo estándar
es un compromiso del lado del votante: el usuario genera un secreto propio, el servidor
firma ciegamente una credencial de pertenencia al censo, y el nullifier sale del secreto del
usuario. Así ni siquiera vosotros podéis relacionar nullifier con persona. Es más trabajo,
pero es la diferencia entre "anónimo" y "anónimo salvo para el administrador".

## 2.4 BC-12 — El `voteHash` no es un compromiso (CRÍTICO)

El contrato lo describe como *"Encrypted vote commitment (SHA256 of choice + salt)"*
([VTB.sol:178](blockchain/contracts/VTB.sol#L178)) y la cabecera del archivo dice
*"Frontend computes voteHash = SHA256(candidateId + randomSalt)"*
([L16](blockchain/contracts/VTB.sol#L16)).

Lo que hace realmente el frontend
([VotingBooth.jsx:526-528](frontend/src/pages/VotingBooth.jsx#L526-L528)):

```javascript
const voteHash = ethers.keccak256(
  ethers.toUtf8Bytes(`${selectedCandidate}-${Date.now()}-${Math.random()}`)
);
```

Un compromiso criptográfico solo vale si alguien puede **abrirlo** después: revelar
`(candidato, salt)` y que cualquiera recompute el hash y compruebe que coincide. Aquí:

- El salt es `Date.now()` + `Math.random()`, generado en el navegador.
- **No se guarda en ningún sitio.** No se envía al backend, no se almacena, no se muestra al
  votante. Se pierde en cuanto la variable sale de scope.
- Por tanto **nadie, jamás, ni el votante ni vosotros ni un auditor, puede abrir ese
  compromiso**.

El `voteHash` que está en la cadena es, funcionalmente, **32 bytes de ruido aleatorio**. No
prueba nada sobre nada. Y mientras tanto, en la misma petición HTTP
([VotingBooth.jsx:533](frontend/src/pages/VotingBooth.jsx#L533)) se envía
`candidateId: selectedCandidate` **en claro**, que es lo que realmente se guarda y se cuenta.

Detalle menor pero digno de mención: `Math.random()` no es un CSPRNG. Aquí da igual porque
el candidato viaja en claro de todas formas, pero si algún día se arregla lo demás, esto hay
que cambiarlo por `crypto.getRandomValues()`.

**Lo que haría falta:** devolver el salt al votante en la respuesta del voto (y solo a él),
para que pueda guardarlo como recibo. Con `(candidateId, salt)` en su poder, el votante
puede recomputar el hash y verificarlo contra la cadena por su cuenta. Eso es lo que
convierte el `voteHash` en algo útil. Ojo: eso crea un recibo verificable, que en teoría de
voto electrónico habilita la compra de votos — es un compromiso conocido, y hay que
decidirlo conscientemente, no por accidente.

## 2.5 BC-03 — El secreto del voto se rompe en la BD, no en la cadena (CRÍTICO)

Aunque no es literalmente "capa blockchain", es imposible evaluar honestamente las garantías
de privacidad sin decirlo, porque **es la capa que produce los resultados**.

Esquema de `nullifier_audit`
([database.ts:77-86](backend/src/config/database.ts#L77-L86) más las columnas añadidas en
[L181-L184](backend/src/config/database.ts#L181-L184)):

```
id, user_id, election_id, nullifier_hash, generated_at,
vote_choice, tx_hash, block_number, candidate_id
```

`user_id` y `candidate_id` **en la misma fila**. Y esa fila se inserta en cada voto
([elections.ts:751-761](backend/src/routes/elections.ts#L751-L761)). Una única consulta:

```sql
SELECT u.email, c.name FROM nullifier_audit na
  JOIN users u ON na.user_id = u.id
  JOIN candidates c ON na.candidate_id = c.id;
```

devuelve la lista nominal completa de quién votó a quién. Cualquiera con acceso de lectura a
la base de datos —administrador, backup, dump, inyección SQL, un `psql` de Render— tiene el
escrutinio nominal íntegro.

Toda la arquitectura de nullifiers y hashes de la capa blockchain existe para no revelar
esto, y la tabla de al lado lo guarda en claro.

## 2.6 ¿Qué puede deducir un observador externo mirando solo la cadena?

**Hoy, con el estado real:** que existe un contrato (ni siquiera se sabe cómo se llama — no
está verificado) con 18 elecciones cuyos nombres delatan tres instituciones, todas activas,
todas con **cero votos**. Es decir, un observador externo concluiría, correctamente, que el
sistema no se ha usado.

**En el diseño previsto, si los votos llegaran a la cadena, un observador podría deducir:**

1. **El censo participante y su evolución.** `totalVotes` en tiempo real, por elección.
2. **El timing exacto de cada voto**, con precisión de bloque (~12s). Esto es más sensible de
   lo que parece: si el atacante tiene acceso a los logs de acceso del servidor, del proxy o
   del proveedor de identidad, correlacionar "el usuario X hizo login a las 14:32:07" con
   "hubo un `VoteCast` a las 14:32:11" desanonimiza. En una elección con poco tráfico esto
   es casi determinista.
3. **Que existe un relayer central.** Todas las tx salen de `0x5D73CB…D572` (BC-15). Un
   observador ve inmediatamente que no hay votantes autónomos y que hay un único punto de
   confianza. Eso desmonta cualquier afirmación de descentralización.
4. **El calendario y las instituciones.** Nombres de elección en claro más ventanas
   temporales.
5. **Qué nullifiers se repiten entre elecciones.** Aquí hay un detalle a favor: como el
   nullifier es `HMAC(userId:electionId)`, un mismo usuario tiene nullifiers **distintos** en
   elecciones distintas, lo que impide correlacionar su participación entre convocatorias.
   Bien pensado. Pero dentro de una misma elección, si el usuario vota, reintenta y el
   sistema falla a medias, el mismo nullifier reaparece y es enlazable entre reintentos.
6. **Nada sobre a quién votó nadie.** El `voteHash` es opaco de verdad — irónicamente,
   *demasiado* opaco (BC-12).

---

# PARTE 3 — Integración con el backend

Todo el camino crítico está en
[elections.ts:598-878](backend/src/routes/elections.ts#L598-L878), función
`POST /elections/register-vote`.

## 3.1 El camino feliz, y lo que se salta

```
598  requireAuth
600  validación Zod del body
610  ¿existe la elección en la BD local?
622  ¿estamos dentro de la ventana (según la BD)?
636  ¿el usuario es elegible?
645  ¿está en el censo?
655  nullifier = HMAC(userId, electionId)
658  ¿ya votó? (consulta a nullifier_audit)
667  ─── si el email acaba en @vtb.demo → ATAJO SINTÉTICO, nunca toca la cadena (BC-21)
693  acquireVoteLock  (cerrojo TOCTOU, esto está bien hecho)
713  getWallet()
734  contract.castVote(...)
741  await tx.wait()
750  INSERT en nullifier_audit
770  releaseVoteLock('confirmed')
```

El cerrojo previo a la transacción ([L689-L699](backend/src/routes/elections.ts#L689-L699))
es una decisión correcta y bien comentada: adquirir el lock **antes** de la tx evita la
condición de carrera clásica. Lo digo porque es lo mejor de este archivo.

## 3.2 BC-21 y BC-22 — Los dos caminos que fingen ser blockchain (ALTO)

**BC-21, el atajo demo** ([elections.ts:667-687](backend/src/routes/elections.ts#L667-L687)):

```typescript
const isDemo = decoded.email?.endsWith('@vtb.demo');
if (isDemo) {
  const syntheticTx = '0x' + createHash('sha256')
    .update(`demo:${decoded.userId}:${electionId}:${Date.now()}`)
    .digest('hex');
  await db.exec('INSERT INTO nullifier_audit (...)', [..., syntheticTx, ...]);
  return res.json({ success: true, txHash: syntheticTx, isDemo: true, ... });
}
```

Esta rama se ejecuta **antes** de tocar la blockchain y devuelve un `txHash` que es un
SHA-256 de 32 bytes con prefijo `0x` — **indistinguible de un hash de transacción real** para
cualquiera que no consulte la cadena. Al menos devuelve `isDemo: true` y un mensaje honesto,
eso hay que reconocerlo.

El problema es el alcance: en
[seedDatabase.ts](backend/src/scripts/seedDatabase.ts) hay **22 cuentas `@vtb.demo`** frente
a 3 `@vtb.system` y 3 `@highland(s).edu`. **Prácticamente toda cuenta con la que alguien vaya
a probar el sistema toma este atajo.** Esta es la explicación directa de BC-02: 18 elecciones
on-chain con cero votos, porque casi nadie llega nunca a `castVote`.

**BC-22, el fallback silencioso**
([elections.ts:822-843](backend/src/routes/elections.ts#L822-L843)): cuando la tx falla con
`"election does not exist"` y el email es `@vtb.demo`, se inserta el voto con otro `txHash`
sintético y se responde:

```json
{ "success": true, "txHash": "0x...", "blockNumber": null,
  "message": "Voto registrado exitosamente en el sistema" }
```

Aquí **no** hay `isDemo: true`. El cliente recibe un éxito con un hash falso y sin ninguna
señal de que el voto no está en la cadena. El único indicio es `blockNumber: null`, que la
UI no interpreta. Un voto fuera de cadena presentado como voto en cadena.

## 3.3 Manejo de fallos, caso por caso

### Transacción rechazada / revert

**Parcialmente manejado.** El `catch` de
[L799-L873](backend/src/routes/elections.ts#L799-L873) distingue tres casos por
**coincidencia de subcadenas en el mensaje de error**, lo cual es frágil:

- `"election does not exist"` → 503 `ELECTION_NOT_ON_CHAIN` (o el fallback de BC-22).
- `"nullifier already used"` → 409.
- `INVALID_ARGUMENT` → 400.
- Todo lo demás → 500 con `details: blockchainError.message` (BC-20, ver abajo).

**No se manejan explícitamente** reverts frecuentes y distintos entre sí:
`ERR: election not active`, `ERR: election out of time window` (el de la ventana ciega de 120
segundos de BC-07), `ERR: nullifier cannot be zero`, `ERR: voteHash cannot be zero`. Todos
caen en el 500 genérico, y el usuario ve "Error al registrar voto en blockchain" sin pista.

El cerrojo **sí** se libera correctamente como `'failed'`
([L810-L813](backend/src/routes/elections.ts#L810-L813)), así que el usuario puede reintentar.
Correcto.

### BC-20 — Fuga del mensaje de error crudo (MEDIO)

[elections.ts:868-871](backend/src/routes/elections.ts#L868-L871):

```typescript
res.status(500).json({
  error: "Error al registrar voto en blockchain",
  details: blockchainError.message,
});
```

El `formatError()` de [utils/errors.ts](backend/src/utils/errors.ts) se aplica al **log**
([L802-L807](backend/src/routes/elections.ts#L802-L807)) pero **no a la respuesta**. Los
errores de ethers v6 arrastran la URL del RPC con la API key de Alchemy en varios campos, y
aunque `.message` suele ser el campo más limpio, no está garantizado — un error de red o de
provider puede incluir el endpoint. Mismo patrón que en
[admin.ts:1530-1534](backend/src/routes/admin.ts#L1530-L1534), donde ya está anotado como
P1-15 pendiente. Aquí no hay ni la nota.

### Gas insuficiente — BC-18 (MEDIO)

**No manejado.** La llamada
([L734-L738](backend/src/routes/elections.ts#L734-L738)) no pasa opciones:

```typescript
const tx = await contract.castVote(election.election_id_blockchain, nullifier, voteHash);
```

Ni `gasLimit`, ni `maxFeePerGas`, ni `maxPriorityFeePerGas`. Se delega todo en la estimación
de ethers, que hace un `eth_estimateGas` previo. Consecuencias:

- **Una llamada RPC extra por voto** (estimateGas + sendTransaction), duplicando la latencia
  y el consumo de cuota de Alchemy.
- Si el `estimateGas` falla por un revert, ethers lanza antes de enviar nada. Aceptable.
- **Si la tx se queda por debajo del precio de gas del momento, se queda en el mempool
  indefinidamente.** No hay reintento con bump, no hay política de fee, no hay
  cancelación. Se combina fatal con BC-16.
- **Si el relayer se queda sin ETH**, el error cae en el 500 genérico, sin alerta ni
  monitorización. La cuenta tiene 9.23 ETH de Sepolia ahora mismo, así que no es urgente,
  pero no hay ningún check de balance en ningún sitio.

Curiosamente, el script `syncElections.ts` **sí** pone `gasLimit: 300000`
([L87](backend/src/scripts/syncElections.ts#L87)). El camino crítico de voto no.

### Nonce duplicado — BC-17 (ALTO)

**No manejado en absoluto, y es el fallo más probable en una demo en vivo.**

`getWallet()` ([elections.ts:37-43](backend/src/routes/elections.ts#L37-L43)) construye un
`JsonRpcProvider` y un `Wallet` **nuevos en cada petición**. Ethers determina el nonce
llamando a `eth_getTransactionCount(address, "pending")`. Con dos votos concurrentes:

```
Petición A: getTransactionCount → 88 → envía tx con nonce 88
Petición B: getTransactionCount → 88 (A aún no minada) → envía tx con nonce 88
           → "nonce too low" o "replacement transaction underpriced"
```

Con una sola EOA relayer y peticiones concurrentes, esto **falla de forma determinista** en
cuanto dos personas voten a la vez. El voto B se pierde con un 500 genérico. El límite de
rate ([app.ts:313](backend/src/app.ts#L313), `voteIpLimiter` + `voteUserLimiter`) es por IP y
por usuario, no serializa entre usuarios distintos, así que no ayuda.

Además, cada petición abre un provider nuevo: no hay pool de conexiones, no hay caché de
`chainId`, y cada voto arrastra el handshake completo con Alchemy.

**Lo que haría falta:** una cola serializada de transacciones (un único worker que procese
votos de uno en uno con un `NonceManager` de ethers), o un pool de varias EOAs relayer, o al
menos un mutex a nivel de proceso alrededor del envío.

### RPC caído / Alchemy no responde — BC-16, BC-23, BC-24

**Qué pasa exactamente si Alchemy cae en mitad de una votación:**

1. `getWallet()` **no falla** — construir un `JsonRpcProvider` no hace I/O
   ([L41-L42](backend/src/routes/elections.ts#L41-L42)). El fallo se manifiesta más adelante.
2. `contract.castVote(...)` falla en el `eth_estimateGas`. Error tipo `SERVER_ERROR` /
   `NETWORK_ERROR`.
3. Cae en el `catch` genérico → **500 con `details` crudo** (BC-20).
4. El cerrojo se libera como `'failed'`, así que el usuario **puede reintentar**. Bien.
5. **No hay reintento automático, ni backoff, ni RPC de respaldo, ni circuit breaker.** Un
   corte de Alchemy = votación parada, con un 500 por cada intento.

**BC-16, `tx.wait()` sin timeout ni confirmaciones (ALTO):**
[elections.ts:741](backend/src/routes/elections.ts#L741)

```typescript
const receipt = await tx.wait();
```

Sin argumentos, `tx.wait()` en ethers v6 significa **1 confirmación y sin timeout**. Dos
problemas:

- **Sin timeout**: si la tx se queda en el mempool (gas bajo, congestión), esta promesa
  **nunca resuelve**. La petición HTTP se cuelga hasta que el cliente o el proxy corten. La
  conexión del pool de BD sigue ocupada, el cerrojo sigue `pending`. Con varias peticiones
  así, se agota el pool.
- **Si Alchemy cae justo después de enviar la tx**: `tx.wait()` lanza, se marca el intento
  como `'failed'` y se devuelve 500... pero **la transacción puede minarse igualmente**. El
  voto queda en la cadena y no en la BD. Es exactamente el escenario que el job de limpieza
  intenta arreglar, y ese job no funciona (BC-23).

**BC-23 — El job de reconciliación está roto (MEDIO):**
[index.ts:240-258](backend/src/index.ts#L240-L258)

```typescript
const events = await contract.queryFilter(contract.filters.VoteCast(null, nullifierHash));
```

`queryFilter` sin `fromBlock`/`toBlock` consulta **desde el bloque 0 hasta el último**. Los
proveedores públicos, Alchemy incluido, limitan el rango de `eth_getLogs`. **Lo he
reproducido en esta auditoría**: la misma consulta contra vuestro RPC devuelve
`could not coalesce error` / HTTP 400. El contrato se desplegó en el bloque **10.823.124** y
la cabeza está en **11.580.011** — 757.000 bloques de rango, muy por encima del límite.

O sea: `checkOnChain` **siempre** devuelve `null`, porque siempre lanza. Y como el `catch`
([L251-L256](backend/src/index.ts#L251-L256)) devuelve `null` en vez de propagar, el job cree
que el voto no está en la cadena. Arreglo: pasar `fromBlock` (el bloque de despliegue,
10823124) y `toBlock` (`'latest'`), y trocear si hace falta.

**BC-24 — Un fallo de RPC se interpreta como "no votó" (MEDIO):**
[postgres.ts:228](backend/src/db/postgres.ts#L228)

```typescript
const newStatus: 'confirmed' | 'failed' = onChain ? 'confirmed' : 'failed';
```

Como `checkOnChain` devuelve `null` tanto si el voto no está en la cadena como si el RPC
falló, el job marca `'failed'` en ambos casos. El propio comentario del código
([index.ts:252-254](backend/src/index.ts#L252-L254)) reconoce el problema y lo etiqueta
P1-14 como pendiente. Combinado con BC-23 (que hace que *siempre* falle), el resultado es
que **todo intento pendiente acaba marcado como fallido**, incluyendo votos que sí están en
la cadena. Un voto legítimo se pierde silenciosamente.

### Reorganización de cadena — BC-19 (ALTO)

**Ninguna defensa. Ni una línea.**

`await tx.wait()` con 1 confirmación significa que se acepta el voto en cuanto entra en un
bloque. En Sepolia, con proof-of-stake, la finalidad tarda **2 épocas ≈ 12,8 minutos**
(64 slots). Antes de eso, una reorganización puede desalojar el bloque.

Qué pasa si ocurre:

1. Se guarda `tx_hash` y `block_number` en `nullifier_audit`
   ([elections.ts:751-761](backend/src/routes/elections.ts#L751-L761)).
2. El intento se marca `'confirmed'` ([L770](backend/src/routes/elections.ts#L770)).
3. Se manda un **email de confirmación con un enlace a Etherscan**
   ([L774-L782](backend/src/routes/elections.ts#L774-L782)).
4. Ocurre la reorg. La tx desaparece.
5. **Nada la revalida.** El job de limpieza solo mira intentos `'pending'`
   ([postgres.ts:216](backend/src/db/postgres.ts#L216)), y este ya es `'confirmed'`.
6. La BD dice que el voto está en la cadena. La cadena dice que no. El votante tiene un
   correo con un enlace roto. La discrepancia es **permanente**.

En Sepolia, que es una testnet con menos validadores y reorgs más frecuentes que mainnet,
esto no es teórico.

**Lo que haría falta:** `tx.wait(N)` con N ≥ 5 (o esperar a finalidad con
`provider.getBlock('finalized')`), más un job que revalide periódicamente los votos
`confirmed` recientes contra la cadena y marque las discrepancias.

## 3.4 ¿Se verifica que la transacción se confirmó? ¿Cuántas confirmaciones?

**Sí se verifica, pero con la garantía más débil posible.**

| Sitio | Código | Confirmaciones | Timeout |
|-------|--------|----------------|---------|
| Voto | [elections.ts:741](backend/src/routes/elections.ts#L741) | **1** | ninguno |
| Crear elección (admin) | [admin.ts:695](backend/src/routes/admin.ts#L695) | **1** | ninguno |
| Sync de elecciones | [syncElections.ts:89](backend/src/scripts/syncElections.ts#L89) | **1** | ninguno |
| Deploy | [deploy.ts:41](blockchain/scripts/deploy.ts#L41) | **1** | ninguno |

En ningún punto del proyecto se espera más de una confirmación ni se pone un timeout. Es
`tx.wait()` a secas en los cuatro sitios.

**Respuesta directa a tu pregunta:** no basta con enviarla — se espera el receipt, eso está
bien. Pero **una confirmación en Sepolia no es una garantía de permanencia**, y el sistema la
trata como si lo fuera: escribe en BD, marca confirmado y manda el email.

## 3.5 BC-25 — El mapeo de IDs se hace por posición, sin verificar (MEDIO)

Tres sitios renumeran `election_id_blockchain` **por el índice del array**:

[syncElections.ts:56-66](backend/src/scripts/syncElections.ts#L56-L66):
```typescript
for (let i = 0; i < elections.length; i++) {
  const expectedId = i + 1;
  if (elections[i].election_id_blockchain !== expectedId) {
    await db.exec("UPDATE elections SET election_id_blockchain = ? WHERE id = ?", [expectedId, ...]);
```

[elections.ts:190-195](backend/src/routes/elections.ts#L190-L195) (`PATCH /fix-blockchain-ids`)
hace exactamente lo mismo, y [elections.ts:150-153](backend/src/routes/elections.ts#L150-L153)
usa la misma heurística para reportar "desincronización".

El problema: **nunca se comprueba que la elección N on-chain sea la elección N de la BD.**
El ABI de `syncElections.ts` incluso **declara `getElection`**
([L11](backend/src/scripts/syncElections.ts#L11))... y no lo llama nunca. La única
comprobación es `if (targetId <= onChainCount) skipped`
([L75-L78](backend/src/scripts/syncElections.ts#L75-L78)) — puramente posicional.

Como las elecciones se crean on-chain desde **cuatro rutas distintas** con criterios de orden
distintos (`deploy.ts` crea 6 genéricas, `createElections.ts` crea hasta 20 con nombres
`Election N`, `admin.ts` crea una por elección real, `syncElections.ts` rellena huecos), la
correspondencia posicional es una suposición muy frágil.

Comprobado el estado real on-chain: los 18 nombres son reales
(`Delegado Ingeniería Informatica 2026/27` … `Annual Sustainability Referendum`), no son
`Election N`, así que `createElections.ts` no se llegó a ejecutar contra este contrato —
bien. Pero nada en el código **verifica** esa correspondencia: basta con borrar una elección
de la BD, o crear dos a la vez, para que `fix-blockchain-ids` reasigne todos los IDs por
debajo y los votos siguientes vayan a la elección equivocada en la cadena. **Sin ningún
error visible.**

Y `PATCH /fix-blockchain-ids` es un endpoint de admin que reescribe todo el mapeo sin
confirmación, sin dry-run y sin comparar con la cadena.

## 3.6 BC-08 — Carrera al leer el ID de la elección creada (BAJO)

[admin.ts:694-705](backend/src/routes/admin.ts#L694-L705):

```typescript
const tx = await contract.createElection(name, onChainStart, Number(end_time));
const receipt = await tx.wait();
const createdOnChainId = Number(await contract.electionCount());
```

Se lee `electionCount()` **después** de la transacción, contra el estado `latest`, en vez de
parsear el evento `ElectionCreated` del `receipt` que ya se tiene en la mano. Si otra
creación (otro admin, o el script de sync) se cuela entre medias, se asocia el ID
equivocado a la elección local. El receipt contiene el `electionId` indexado en `topics[1]`
del evento; usarlo es gratis y correcto.

## 3.7 BC-27 — La API key de Alchemy va en el bundle del navegador (ALTO)

`frontend/.env`:
```
VITE_RPC_URL=wss://eth-sepolia.g.alchemy.com/v2/<API_KEY>
```

Vite **inlinea toda variable con prefijo `VITE_` en el JavaScript compilado**. La clave queda
en texto plano en el bundle que sirve el navegador: cualquiera abre DevTools y la copia.

Y lo peor: **es la misma clave que usa el backend**. Verificado comparando `VITE_RPC_URL` de
`frontend/.env` con `RPC_URL` de `backend/.env` — coinciden. Así que agotar la cuota desde el
navegador de un tercero **deja al backend sin poder registrar votos**. Es un DoS de la
votación al alcance de cualquier visitante.

Mitigaciones: como mínimo, dos claves distintas con la del frontend restringida por dominio
en el panel de Alchemy. Mejor: que el frontend no hable con el RPC directamente y consuma un
endpoint proxy del backend.

---

# PARTE 4 — Verificabilidad

Las dos preguntas de esta parte son las que de verdad determinan si el proyecto es "voto
verificable en blockchain" o "una base de datos con un adorno". Las respondo sin rodeos.

## 4.1 ¿Puede un votante comprobar por su cuenta que su voto está en la cadena?

# **No.**

Y no por un motivo, sino por cuatro, cualquiera de los cuales bastaría.

**1. Hoy, materialmente, no hay nada que comprobar.** Cero votos en las 18 elecciones
(BC-02). La comprobación fallaría siempre, correctamente.

**2. El votante no conoce su nullifier y no lo puede calcular.** Para buscar su voto en la
cadena necesita el nullifier, que es `HMAC(userId:electionId, NULLIFIER_SECRET)`
([auth.ts:126-137](backend/src/utils/auth.ts#L126-L137)). El secreto es del servidor. El
votante ni siquiera conoce su `userId` numérico. **Solo puede obtener el nullifier
preguntándoselo a vuestra API** — que es exactamente lo que "sin fiarse de nuestra interfaz"
excluye. La verificación es circular: para verificar que no os estáis inventando el voto,
hay que empezar por creeros el nullifier que os pide.

**3. Aunque encontrase su nullifier en la cadena, no puede comprobar el contenido.** El
`voteHash` es irrecuperable (BC-12): el salt se perdió en el navegador. El votante vería
32 bytes que no puede relacionar con el candidato que eligió. Podría confirmar *que votó*,
nunca *qué votó*.

**4. El contrato no está verificado en Etherscan (BC-10).** Aunque el votante mirase la
transacción, no puede leer las reglas que la aceptaron. Solo ve bytecode.

**El único camino que ofrece hoy la aplicación** es el endpoint público
[`GET /elections/:id/audit`](backend/src/routes/elections.ts#L521-L578), y ahí está BC-28:

```typescript
const txHash = record.tx_hash ||
  `0x${createHash('sha256').update(record.nullifier_hash || '').digest('hex')}`;
```
[elections.ts:556-557](backend/src/routes/elections.ts#L556-L557)

Si no hay `tx_hash` real, **se fabrica uno** hasheando el nullifier, con el mismo formato
`0x` + 64 hex que un hash de transacción de verdad. Se distingue solo por el campo `onChain`
booleano, que la UI usa para decidir si pone el enlace a Etherscan
([ElectionResults.jsx:681-697](frontend/src/pages/ElectionResults.jsx#L681-L697)) pero que
un consumidor de la API puede ignorar perfectamente. Es un dato inventado con forma de
prueba criptográfica.

Y ese endpoint **no requiere autenticación** (compárese con `router.get("/", requireAuth, ...)`
en [L53](backend/src/routes/elections.ts#L53)): cualquiera obtiene la lista completa de
nullifiers, timestamps y hashes de una elección, sin paginación ni límite.

### BC-29 — Y el feed "en vivo" tampoco funciona (ALTO)

Aparte: [VotingBooth.jsx:445](frontend/src/pages/VotingBooth.jsx#L445) declara

```javascript
const contractAbi = ["event VoteCast(uint256 indexed electionId, bytes32 nullifier, bytes32 voteHash)"];
```

pero el contrato emite
([VTB.sol:27-32](blockchain/contracts/VTB.sol#L27-L32)) `VoteCast(uint256 indexed, bytes32
indexed, bytes32, uint256)` — **cuatro** parámetros, con `nullifier` indexado. Firmas
distintas ⇒ `topic0` distinto. Calculado:

```
frontend  keccak("VoteCast(uint256,bytes32,bytes32)")          = 0x2e82bdc8daf342458c2dc7bf51c3aefd294a3f9d8389e73e35937693b793882e
contrato  keccak("VoteCast(uint256,bytes32,bytes32,uint256)")  = 0xd7b04ae01b62a25f84734dba45d621027e2a2906fe6a9a3914f5bbf274070706
MATCH? false
```

El filtro nunca coincide con ningún log real. **El feed de votos en directo de la cabina de
votación no puede dispararse jamás**, ni aunque hubiera votos en la cadena. El indicador
"escuchando" ([L447](frontend/src/pages/VotingBooth.jsx#L447)) se pone en verde igualmente,
porque solo comprueba que el provider responde a `getBlockNumber`.

## 4.2 ¿Puede un tercero recontar los votos desde la cadena?

# **No. Ni aproximadamente.**

Los resultados que muestra la aplicación salen **íntegramente de la base de datos**:

[elections.ts:449-456](backend/src/routes/elections.ts#L449-L456):
```sql
SELECT candidate_id, COUNT(*) as votes
  FROM nullifier_audit
 WHERE election_id = ? AND candidate_id IS NOT NULL
 GROUP BY candidate_id
```

Ni una consulta a la cadena en toda la ruta de resultados. Lo mismo en
[admin.ts:1570-1577](backend/src/routes/admin.ts#L1570-L1577) para las estadísticas de admin.

**Por qué es irreconciliable, no solo "no implementado":**

1. **La cadena no sabe el candidato.** Solo tiene el `voteHash` opaco. Un tercero podría
   contar *cuántos* votos hay, jamás *para quién*.
2. **Ni siquiera el total cuadra.** Los votos demo (BC-21) y los del fallback (BC-22) están
   en la BD y no en la cadena. Con el estado actual: **BD = N votos, cadena = 0.**
3. **El total on-chain no es fiable aunque cuadrara**, porque cualquiera puede inflarlo
   (BC-01).
4. **`onChainVerified` es un badge engañoso** ([elections.ts:506](backend/src/routes/elections.ts#L506)):

   ```typescript
   onChainVerified: (onChainCount?.count || 0) > 0,
   ```

   Es `true` si **al menos un** voto de la elección tiene `tx_hash` y `block_number` no nulos
   y el email no es `@vtb.demo`. Con 1.000 votos de los cuales 1 llegó a la cadena, la
   aplicación muestra la elección como verificada on-chain. Además, ni siquiera consulta la
   cadena: comprueba columnas de la BD que la propia BD rellenó.

**La conclusión honesta:** el escrutinio de VTB es un recuento de base de datos SQL. La
cadena, en el mejor de los casos, sería una bitácora paralela de que *alguien* votó — nunca
una fuente de verdad del resultado. Merece la pena decirlo así en la memoria del TFG, porque
un tribunal con criterio lo va a preguntar y es mucho mejor haberlo anticipado.

## 4.3 Qué haría falta para que la respuesta fuese "sí"

Ordenado por lo que más desbloquea con menos trabajo.

### Para que un votante pueda verificar su propio voto

1. **Devolver el salt al votante.** Cambiar
   [VotingBooth.jsx:526](frontend/src/pages/VotingBooth.jsx#L526) para generar el salt con
   `crypto.getRandomValues()`, mostrarlo en la pantalla de confirmación junto al candidato, y
   ofrecerlo como recibo descargable. Con `(candidateId, salt)` el votante recomputa
   `keccak256` y lo compara con el `voteHash` de la cadena. **Sin esto, el compromiso no
   sirve para nada.** Decisión consciente a tomar: un recibo verificable habilita compra de
   votos; es el compromiso clásico de la literatura de e-voting.
2. **Devolver el nullifier al votante en la respuesta del voto** y decirle que lo guarde. No
   resuelve la circularidad del todo (sigue viniendo de vosotros), pero le permite al menos
   ir a Etherscan por su cuenta a partir de ahí.
3. **Verificar el contrato en Etherscan.** Añadir `ETHERSCAN_API_KEY` y ejecutar
   `npx hardhat verify --network sepolia 0x92110ea2a133567a0d6237e8991Fff336cd70778`. Ya he
   comprobado que el bytecode coincide **byte a byte** con el compilado local, así que
   verificará a la primera. Es la mejora con mejor relación coste/beneficio de toda esta
   auditoría: 10 minutos de trabajo.
4. **Arreglar el ABI del evento** en
   [VotingBooth.jsx:445](frontend/src/pages/VotingBooth.jsx#L445) para que coincida con el
   contrato.
5. **Publicar un verificador independiente**: una página estática, servida fuera de vuestra
   infraestructura, que dado un nullifier consulte un RPC público y muestre el resultado. Eso
   es lo que hace que "sin fiarse de nuestra interfaz" sea verdad.

### Para que un tercero pueda recontar

Esto requiere un cambio arquitectónico, no un parche:

6. **Que el candidato esté en la cadena de forma recontable.** Dos opciones honestas:
   - **Simple:** poner `candidateId` en claro on-chain. Se pierde el secreto del voto frente
     a un observador — pero como ya está en claro en la BD (BC-03), no se pierde nada que no
     estuviera perdido, y al menos el recuento sería auditable de verdad.
   - **Correcta:** commit-reveal. Fase de votación con `voteHash` en cadena; al cierre, se
     publican todos los pares `(candidateId, salt)` y cualquiera recomputa y recuenta. Exige
     custodiar los salts hasta el cierre, y exige el punto 1.
7. **Cerrar `castVote` a un relayer autorizado** (BC-01), o el recuento on-chain no
   significará nada haga lo que haga.
8. **Eliminar los caminos que no llegan a la cadena** (BC-21, BC-22) o marcarlos de forma
   inequívoca en la API, no solo en la UI. Un `txHash` fabricado
   ([elections.ts:556-557](backend/src/routes/elections.ts#L556-L557),
   [L671-L673](backend/src/routes/elections.ts#L671-L673)) no debería existir: si no hay
   transacción, el campo debe ser `null`.
9. **Sacar los resultados de la cadena, no de la BD.** Que
   [`/:id/results`](backend/src/routes/elections.ts#L406) recuente desde los eventos
   `VoteCast` y compare con la BD, reportando cualquier discrepancia en vez de esconderla.
10. **Publicar el bloque de despliegue** (10823124) y el ABI en el repo, para que un tercero
    pueda escanear los eventos sin adivinar el rango.

### Para que la integración aguante una votación real

11. **Serializar el envío de transacciones** con `NonceManager` o una cola de un solo worker
    (BC-17). Sin esto, dos votos simultáneos fallan.
12. **`tx.wait(5)` con timeout explícito** (BC-16) y un job que revalide los `confirmed`
    contra la cadena (BC-19).
13. **Arreglar `queryFilter`** con `fromBlock: 10823124` (BC-23) y distinguir "no está en la
    cadena" de "el RPC falló" (BC-24).
14. **Separar la clave del relayer de la del owner** (BC-05). Como el contrato no tiene
    `transferOwnership`, esto obliga a redesplegar — que es también la ocasión de arreglar
    BC-01 y BC-04.
15. **Separar la API key de Alchemy del frontend** (BC-27).

---

## Nota final sobre lo que está bien

Para que el informe sea justo, y porque en una defensa conviene saber qué defender:

- El contrato es **pequeño, legible y sin bugs de Solidity**. Sin reentrancy, sin overflow,
  sin `tx.origin`, sin `delegatecall`, sin proxy, sin `selfdestruct`. Para un TFG, es un
  contrato limpio.
- **El owner no puede tocar el recuento.** Eso es una propiedad real y valiosa, y está bien
  diseñada: no hay setters.
- **La ventana temporal se valida on-chain**, no se delega en el backend.
- **Los guards de nullifier/voteHash cero** están puestos y son correctos — es un detalle
  fino que mucha gente se salta.
- **Nullifiers distintos por elección**, lo que impide correlacionar la participación de una
  persona entre convocatorias distintas.
- **El cerrojo TOCTOU antes de la transacción**
  ([elections.ts:689-699](backend/src/routes/elections.ts#L689-L699)) está bien pensado y
  bien comentado.
- **El saneado de errores de ethers** en [utils/errors.ts](backend/src/utils/errors.ts) es
  una preocupación acertada y poco común: los errores de ethers v6 sí filtran la URL del RPC.
  Falta aplicarlo también a las respuestas HTTP.
- **El bytecode desplegado coincide exactamente con el código del repositorio.** No hay
  sorpresas entre lo que está escrito y lo que está corriendo.

El problema de esta capa no es la calidad del Solidity. Es que **la blockchain está
desconectada del sistema**: no recibe los votos, no participa en el recuento y no es
verificable por nadie de fuera. Arreglar BC-02, BC-01, BC-10 y BC-12 —en ese orden— es lo
que convierte esta capa de decorativa en funcional.
