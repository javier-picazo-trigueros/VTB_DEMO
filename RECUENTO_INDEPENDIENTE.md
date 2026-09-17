# Recuento independiente de una elección

**Para quién:** un comité electoral, un servicio jurídico, un candidato o
cualquier tercero que quiera comprobar el resultado **sin fiarse de VTB**.

No hace falta tener cuenta, ni credenciales nuestras, ni acceso a nuestra base
de datos, ni usar nuestra interfaz. Solo la dirección del contrato y un nodo
público de Ethereum. Si el resultado que publicamos no coincide con el que
obtenga usted, el que vale es el suyo.

---

## Qué necesita

1. **Node.js 20 o superior.**
2. **Una copia del repositorio** (o solo la carpeta `blockchain/`) y
   `npm install` dentro de ella.
3. **La dirección del contrato** de la elección. Se publica con el resultado y
   en `blockchain/deployments/sepolia.json`.
4. **El identificador de la elección EN EL CONTRATO.** No es el número que se ve
   en la interfaz: son distintos. Se publica junto con el resultado.
5. **Un RPC de la red.** Vale cualquiera público; no tiene que ser el nuestro, y
   de hecho es mejor que no lo sea.

## Cómo se ejecuta

Con la configuración del propio proyecto:

```bash
cd blockchain
ELECTION_ID=3 npm run recount
```

O contra cualquier nodo, sin usar nuestra configuración — **esta es la forma
que debería usar quien quiera comprobarlo de verdad**:

```bash
cd blockchain
RECOUNT_RPC_URL=https://…  \
CONTRACT_ADDRESS=0x124759Cc8bb31AAD866930dCd3caE6f148e4F607 \
ELECTION_ID=3 \
  npx hardhat run scripts/recount.ts
```

El script (`blockchain/scripts/recount.ts`) no importa nada de la aplicación: ni
el backend, ni artefactos compilados, ni ficheros de despliegue. Lleva el ABI
escrito a mano justamente para no depender de compilar nada nuestro.

## Qué comprueba

1. **Reconstruye el recuento sumando los eventos `VoteCast` uno a uno**, leídos
   de la cadena en ventanas de 45.000 bloques desde el bloque de despliegue.
2. **Lee el recuento que mantiene el propio contrato** (`getTally`).
3. **Comprueba que ambos coinciden.** Si no coinciden, el contrato o el nodo
   están mintiendo, y el resultado no es fiable.
4. **Comprueba que ningún nullifier aparece dos veces**, es decir, que no hay
   doble voto.

## Qué devuelve

Un informe pensado para pegarse en un acta:

```
==================================================================
RECUENTO INDEPENDIENTE — elección #3 on-chain
==================================================================
Contrato:        0x124759Cc8bb31AAD866930dCd3caE6f148e4F607
Nombre:          Elección al Consejo de Estudiantes
Ventana:         2026-09-20T08:00:00.000Z → 2026-09-20T20:00:00.000Z
Detenida:        no
Bloques leídos:  11724119 → 11731004

Huella de la lista de candidatos (candidatesRoot):
  0x9f2c…
  Compruebe que coincide con el keccak256 de la lista publicada en la
  convocatoria. Si no coincide, la lista no es la que se comprometió.

Candidato | Votos (eventos) | Votos (contrato)
----------|-----------------|-----------------
        0 |             142 |             142
        1 |              98 |              98
----------|-----------------|-----------------
    TOTAL |             240 |             240

Nullifiers repetidos: 0 (debe ser 0)

RESULTADO: las dos fuentes coinciden y no hay doble voto.
==================================================================
```

El proceso termina con **código de salida 0** si todo cuadra y **1 si hay
discrepancia**, para poder encadenarlo en una comprobación automática.

## El paso que no hace el script: comprobar la lista de candidatos

En la cadena un voto dice «candidato 2». Ese número no significa nada por sí
solo. Lo que le da significado es la lista publicada con la convocatoria, y la
cadena guarda su huella (`candidatesRoot`).

**Compruébelo usted:** tome la lista publicada, constrúyala en este formato
exacto —ordenada por posición, solo `position` y `name`, sin espacios, el nombre
normalizado en NFC y sin espacios al principio ni al final—

```json
[{"position":0,"name":"Ana Ruiz"},{"position":1,"name":"Bruno Sáez"}]
```

y calcule su `keccak256` en UTF-8, sin salto de línea final. Debe dar exactamente
el `candidatesRoot` que imprime el informe. Si no coincide, la lista que le han
dado no es la que se comprometió al abrir la votación.

La regla canónica está escrita en `backend/src/services/candidatesRoot.ts`, pero
puede reproducirla con cualquier herramienta que calcule keccak256.

## Qué NO demuestra este recuento

Conviene decirlo con la misma claridad:

- **No demuestra que el censo fuera correcto.** Demuestra que los votos
  registrados se cuentan bien, no que las personas con derecho a voto sean
  exactamente las que votaron.
- **No demuestra que el voto sea secreto.** No lo es frente a quien opera el
  sistema; ver `SEGURIDAD.md` §2.1.
- **No detecta votos que nunca llegaron a la cadena.** Si un voto se emitió en
  la aplicación y no se retransmitió, aquí no aparece. Por eso la aplicación
  muestra los dos recuentos y marca la discrepancia.

## Estado

El contrato está desplegado en Sepolia pero **aún no es operativo** (el relayer
autorizado no es el del backend), así que todavía no hay ninguna elección real
que recontar: `getElectionCount()` devuelve 0. Este documento describe el
procedimiento; la primera comprobación de punta a punta queda pendiente.
