# VTB — Qué queda registrado, quién puede verlo y qué no está garantizado

**Destinatario:** comité electoral, secretaría general o servicio jurídico de la
institución que valore usar VTB, además del equipo de desarrollo.

**Estado:** este documento describe el registro en cadena con recuento
verificable (contrato `ElectionRegistryV2`).

El contrato está desplegado en Sepolia el 17-09-2026, en
`0x124759Cc8bb31AAD866930dCd3caE6f148e4F607` (bloque 11724119), pero **todavía
no está operativo**: la dirección autorizada para registrar votos no es la del
servidor de VTB, de modo que hoy no puede entrar ningún voto. Hasta que eso se
corrija sigue en vigor el contrato anterior, que **no registra a qué candidato se
vota y cuyo recuento no es verificable desde fuera**.

Mientras tanto, nada de lo que se afirma en el apartado 1 puede darse por
vigente en producción.

---

## 1. Lo que el sistema garantiza

1. **Registro inmutable.** Cada voto queda escrito en una cadena de bloques
   pública. Nadie —tampoco quien administra VTB— puede borrarlo, modificarlo ni
   antedatarlo. La fecha y hora las pone la propia red, no nuestro servidor.
2. **Recuento verificable por terceros.** Cualquiera puede recontar los votos
   leyendo únicamente la cadena, sin acceso a nuestra base de datos, sin
   permisos y sin fiarse de nuestra interfaz. Se publica una herramienta
   independiente para hacerlo.
3. **Prevención del doble voto.** Cada votante genera un testigo único por
   elección (*nullifier*). El contrato rechaza un segundo voto con el mismo
   testigo. La comprobación es criptográfica y ocurre en la cadena, no en
   nuestro código.
4. **Solo una dirección autorizada puede registrar votos.** No es posible que
   un tercero infle el recuento escribiendo votos inventados.

## 2. Lo que el sistema NO garantiza

### 2.1 El voto no es anónimo frente al operador

Es la limitación más importante y conviene entenderla antes que ninguna otra.

El testigo único de cada votante lo calcula hoy nuestro servidor, a partir de la
identidad del votante y de un secreto que custodiamos nosotros. **Quien tenga
acceso a ese secreto puede saber qué voto de la cadena corresponde a qué
persona.** Además, la base de datos de la aplicación guarda hoy, en la misma
fila, el identificador del votante y su elección.

En términos prácticos: el voto está protegido frente a cualquier observador
externo, pero **no frente a quien administra el sistema**. VTB, tal y como está
hoy, no puede describirse como voto secreto ni como voto anónimo.

Esto se resuelve con pruebas de conocimiento cero (Semaphore), que permitirían
al votante demostrar que pertenece al censo sin revelar quién es, de forma que
ni siquiera el operador pudiera deshacer la asociación. Está previsto y el
contrato ya reserva el espacio necesario, pero **no está implementado**.

### 2.2 El reparto de votos es público durante la votación

Esta es una decisión de diseño consciente, no un descuido, y el comité electoral
debe conocerla antes de convocar.

**Qué se publica y cuándo.** En el momento en que se emite cada voto, queda
escrito en la cadena pública, de forma inmediata y visible para cualquiera:

| Dato | ¿Visible? | Detalle |
|---|---|---|
| Identificador de la elección | Sí | Número que asigna el contrato |
| Testigo único del votante | Sí | Valor de 32 bytes, no legible como identidad |
| **Candidato elegido** | **Sí** | Número de orden del candidato en la papeleta |
| Fecha y hora del voto | Sí | Con precisión de unos 12 segundos |
| Nombre y apellidos del votante | No | Nunca sale de nuestra base de datos |
| Correo, DNI o número de expediente | No | Nunca sale de nuestra base de datos |
| Nombre de los candidatos | No | Solo un número de orden; ver 2.3 |

**Consecuencia directa:** durante toda la jornada electoral, cualquier persona
con conocimientos técnicos puede consultar el recuento parcial en tiempo real,
incluido el reparto por candidato. No hace falta ser votante ni tener cuenta.
No existe forma de impedirlo: lo que se escribe en una cadena pública es legible
por definición, y ninguna medida en nuestra aplicación puede ocultarlo.

**Lo que esto puede provocar**, y que la literatura electoral documenta:

- **Efecto arrastre o de desánimo**: quien vota por la tarde conoce el resultado
  provisional de la mañana.
- **Voto estratégico**: un electorado que ve a dos candidatos empatados puede
  reorganizarse durante la jornada.
- **Posible incompatibilidad con el reglamento electoral de la institución.**
  En elecciones públicas españolas la difusión de resultados parciales durante
  la votación está restringida. Desconocemos qué establece el reglamento
  electoral de cada universidad, y **es la institución quien debe comprobarlo
  antes de convocar**. No damos por hecho que sea admisible.

**La alternativa, si no es admisible.** Existe y es conocida: publicar durante
la votación únicamente un compromiso cifrado de cada voto y revelar todos los
votos al cierre, momento en el que cualquiera recontaría igual que ahora. No se
ha implementado porque introduce un modo de fallo grave que hoy no existe: si se
pierden o se corrompen los datos de apertura, **los votos quedan cifrados para
siempre y la elección no se puede recontar**. Con un equipo de dos personas, ese
riesgo se ha considerado mayor que el beneficio. Si el comité electoral necesita
que el reparto no sea visible hasta el cierre, es un cambio de contrato asumible,
pero debe pedirse antes de convocar, no después.

### 2.3 El número de orden del candidato no es secreto

En la cadena solo aparece el número de orden (candidato 0, 1, 2…), nunca el
nombre. Los nombres son datos personales de los candidatos y no deben quedar
escritos de forma inmutable en una cadena pública.

Ahora bien, **la correspondencia entre número y nombre es pública**: se publica
junto con la convocatoria, y la cadena guarda una huella criptográfica de esa
lista para que nadie pueda alterarla después. Es decir: el número de orden
identifica al candidato sin ninguna ambigüedad. No es un mecanismo de secreto.

### 2.4 El momento del voto puede desanonimizar en grupos pequeños

Cada voto lleva su hora. Si el censo es reducido —la delegación de un curso, por
ejemplo— y alguien dispone además de los registros de acceso al sistema, de la
red o del proveedor de identidad, puede llegar a relacionar "esta persona entró
a las 14:32" con "hubo un voto a las 14:32". Cuantos menos votantes y más
espaciados, más fiable es esa correlación.

Es un riesgo inherente a registrar votos individualmente en una cadena pública,
y afecta también al contrato anterior. Con el candidato escrito en claro, la
consecuencia de acertar es mayor: no se deduce solo que esa persona votó, sino
qué votó.

### 2.5 Quien opera el sistema puede detener una votación

La dirección propietaria del contrato puede detener una elección en curso. No
puede alterar el recuento, ni añadir ni borrar votos, ni reabrir lo detenido:
solo impedir que entren votos nuevos, y la interrupción queda registrada en la
cadena, con marca de tiempo y motivo, a la vista de cualquiera.

Se ha diseñado así a propósito. Esa capacidad no se puede eliminar —quien opera
la infraestructura siempre puede dejar de transmitir votos—, de modo que lo que
el contrato hace es **obligar a que su uso sea visible** en lugar de invisible.

## 3. Quién puede hacer qué

| Actor | Puede | No puede |
|---|---|---|
| Cualquier persona | Leer todos los votos y recontar | Escribir ningún voto |
| Servidor de VTB (relayer) | Registrar votos y crear elecciones | Alterar el recuento, borrar votos, detener una elección |
| Propietario del contrato | Autorizar o revocar servidores, detener una elección, traspasar la propiedad | Alterar el recuento, añadir o borrar votos, reabrir lo detenido |

Las dos claves son distintas y se custodian por separado. La del servidor está
en el servidor, porque tiene que firmar cada voto; la del propietario se guarda
fuera de línea. Si la del servidor se ve comprometida, el propietario la revoca
sin necesidad de volver a desplegar el contrato ni de perder el histórico.

## 4. Cómo comprobarlo por su cuenta

Un comité electoral no tiene por qué fiarse de este documento:

1. **El código del contrato es público.** Está en este repositorio
   (`blockchain/contracts/ElectionRegistryV2.sol`) y se puede leer exactamente
   qué reglas aceptan o rechazan un voto.

   **Advertencia:** a fecha de hoy el contrato desplegado **no está verificado**
   en el explorador de bloques, así que allí solo se ve bytecode y no hay forma
   de comprobar desde fuera que corresponde a este código fuente. Es un
   requisito pendiente y debe exigirse antes de convocar una elección real.
2. **La herramienta de recuento independiente** (`blockchain/scripts/recount.ts`)
   lee únicamente la cadena a través de un nodo público y publica el resultado.
   Puede ejecutarla un tercero, en su propio equipo, sin credenciales nuestras.
   El procedimiento completo, con lo que demuestra y lo que no, está en
   **`RECUENTO_INDEPENDIENTE.md`**.
3. **El recuento oficial y el de la cadena deben coincidir.** Si no coinciden,
   es un defecto y debe reclamarse. La aplicación muestra ambos.

## 5. Estado de este documento

Redactado el 16-09-2026 al aprobarse el diseño del recuento verificable, y
revisado el 17-09-2026 tras el despliegue en Sepolia.

Debe revisarse otra vez cuando el despliegue quede operativo (relayer del
servidor autorizado y contrato verificado en el explorador) y, de nuevo, cuando
se implemente el anonimato criptográfico con Semaphore, que es lo único que
dejaría sin efecto el apartado 2.1. **Mientras tanto, el apartado 2.1 sigue
vigente: el voto no es anónimo frente a quien opera el sistema.**

Los defectos concretos que sustentan lo dicho aquí están detallados en
`AUDITORIA_BLOCKCHAIN.md`.
