# Cambios — contrato v2 y recuento verificable

**Para quién:** Jaime, y cualquiera que vuelva a este repositorio sin haber
estado en las sesiones en que se hizo.

**Alcance de este documento:** cubre el paso al contrato `ElectionRegistryV2`
y lo que arrastra (base de datos, camino del voto, resultados). No cubre el
resto del verano; si hace falta esa parte, hay que escribirla aparte.

---

## En una frase

Hasta ahora la cadena guardaba *que* alguien votó. Ahora guarda *a quién* votó,
para que el recuento se pueda rehacer desde fuera sin fiarse de nosotros.

## El problema del v1

El contrato anterior (`VTB.sol`) recibía `castVote(electionId, nullifier, voteHash)`.
El `voteHash` es opaco: un hash que solo significa algo si tienes la base de
datos. Consecuencia: **nadie de fuera podía recontar**. La cadena demostraba que
hubo N votos, pero el reparto entre candidatos salía enteramente de nuestro
PostgreSQL, es decir, de nuestra palabra.

Eso vaciaba la tesis del proyecto. Un tribunal electoral que no se fíe de
nosotros no tenía nada que comprobar.

Además el v1 tenía tres problemas de control de acceso, detallados en
`AUDITORIA_BLOCKCHAIN.md`:

- `castVote` no exigía autorización: cualquiera podía inflar el recuento (BC-01).
- El owner podía cerrar y reabrir una elección a mitad de votación (BC-06).
- El owner y el relayer eran la misma clave: comprometer el servidor daba el
  control del contrato (BC-05).

## Qué cambia en el contrato

| | v1 (`VTB.sol`) | v2 (`ElectionRegistryV2.sol`) |
|---|---|---|
| Firma del voto | `castVote(electionId, nullifier, voteHash)` | `castVote(electionId, nullifier, candidateId)` |
| Quién puede votar | cualquiera | solo un relayer autorizado |
| Tipo del nullifier | `bytes32` | `uint256` (el que emite Semaphore) |
| Recuento legible | no | `getTally(id)` por candidato |
| Cierre | el owner abre y cierra a voluntad | solo por `endTime`; `haltElection` es irreversible y deja motivo |
| Claves | una | owner (frío) y relayer (caliente), separadas |
| Lista de candidatos | no consta | `candidatesRoot`, keccak256 de la lista canónica |
| Censo | no consta | `censusRoot`, reservado para Semaphore, hoy cero |

Dos decisiones que conviene entender:

**El candidato viaja como número de orden, no como nombre.** Los nombres son
datos personales de personas reales y no pueden quedar escritos de forma
inmutable en una cadena pública: sería incompatible con el derecho de supresión.
Lo que se escribe es la posición (0, 1, 2…) más el `candidatesRoot`, que es el
hash de la lista. La lista se publica con la convocatoria y cualquiera comprueba
que su hash coincide. Si alguien reordena o cambia un nombre después, el hash
deja de cuadrar.

**`haltElection` sustituye a `closeElection`.** No se puede eliminar la
capacidad de censura —quien opera el relayer siempre puede dejar de retransmitir
votos—, así que lo que hace el contrato es obligar a que su uso quede
**registrado en la cadena**, con marca de tiempo y hash del motivo, en lugar de
ser invisible. Y es irreversible: no se puede detener y reabrir.

## Qué cambia en la base de datos (migración 009)

`20260916000009_chain_contract_and_vote_source.cjs`. No cambia de contrato: deja
la base en condiciones de hacerlo sin perder el histórico.

- **`elections.chain_contract_address`** — cada elección sabe en qué contrato
  vive. Sin esto, cambiar `CONTRACT_ADDRESS` deja los `election_id_blockchain`
  antiguos apuntando a elecciones que en el contrato nuevo no existen, o peor, a
  otras distintas. Las elecciones del v1 se quedan en el v1 y siguen siendo
  legibles.
- **`nullifier_audit.vote_source`** — `chain`, `demo` o `legacy`. Antes el
  origen se deducía mirando si el correo acababa en `@vtb.demo`, en cuatro
  sitios distintos. Por defecto es `legacy`: nada presume de estar en la cadena.
- **Hashes inventados a NULL** — los SHA-256 con pinta de hash de transacción
  que guardaban BC-21 y BC-22. Los votos no se borran; se borra la afirmación
  falsa sobre ellos.
- **`candidates.position`** — el número de orden que viaja a la cadena.

## Qué cambia en el backend

- **`services/voteChain.ts`** — puerto de la cadena. Antes el `Wallet` y el
  `Contract` se construían dentro del manejador de la ruta, así que el camino
  crítico del voto **no tenía ni un test** (los tests entran con cuentas
  `@vtb.demo`, que se saltan la blockchain). Ahora es una interfaz que los tests
  sustituyen por un doble.
- **`services/candidatesRoot.ts`** — la regla canónica de serialización de la
  lista, escrita de forma explícita porque tiene que poder reproducirse desde
  fuera sin nuestro código.
- **`/results`** — pide `getTally()` al contrato y lo compara con la base,
  candidato a candidato. `onChainVerified` pasa a significar que **los dos
  recuentos coinciden**.
- **Voto** — 503 si la elección no está en el contrato, para todo el mundo.
- **`chain-abi.test.ts`** — compara el ABI declarado en el backend con el ABI
  compilado del contrato. Es lo que no existía cuando BC-29 dejó el feed de
  votos en vivo sin poder dispararse durante meses.

## Qué NO cambia

- El nullifier lo sigue calculando nuestro servidor con `NULLIFIER_SECRET`. **El
  voto sigue sin ser anónimo frente a quien opera el sistema.** El v2 no arregla
  eso y no pretende hacerlo; ver `SEGURIDAD.md` §2.1.
- Las elecciones ya registradas en el v1 se quedan ahí. Ninguna tiene votos
  on-chain, así que no se pierde ningún recuento.

## Estado y qué falta

El contrato está desplegado en Sepolia
(`0x124759Cc8bb31AAD866930dCd3caE6f148e4F607`, bloque 11724119) pero **todavía
no es operativo**:

1. El relayer autorizado en el contrato no es la clave del backend, así que
   `castVote` revertiría con `ERR: not authorized relayer`. Lo arregla el owner
   con `setRelayer`.
2. El backend sigue apuntando al contrato v1 y `DEPLOY_BLOCK` no está definida.
3. El contrato está sin verificar en Etherscan, así que un tercero solo ve
   bytecode y no puede leer las reglas.

Hasta que eso se cierre, `SETUP.md` no documenta el arranque con el v2: no se
ha podido comprobar en un clon limpio.
