/**
 * Corrige qué dirección está autorizada a registrar votos. Lo ejecuta el OWNER.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * En el despliegue del 17-09-2026 se pasó por error como RELAYER_ADDRESS la
 * dirección `0x5FbDB231…`, que es la primera dirección determinista de Hardhat
 * y no la clave caliente del backend. Resultado: `castVote` es `onlyRelayer`,
 * así que el backend no podía registrar ni un voto, y la autorización quedaba
 * concedida a una dirección de la que no controlamos la clave.
 *
 * ── Qué hace ────────────────────────────────────────────────────────────────
 *
 *   1. Comprueba que hay contrato en la dirección.
 *   2. Comprueba que quien firma ES el owner. Esto NO es una formalidad:
 *      hardhat.config.ts cae a la clave por defecto de Hardhat si
 *      DEPLOYER_PRIVATE_KEY no está definida, así que sin esta comprobación un
 *      olvido acabaría enviando transacciones firmadas con una clave pública.
 *   3. Autoriza la dirección nueva y revoca la anterior, cada una en su propia
 *      transacción y solo si hace falta (es idempotente: volver a ejecutarlo no
 *      hace nada).
 *   4. Vuelve a leer el estado DE LA CADENA y actualiza deployments/<red>.json
 *      con lo que dice el contrato, no con lo que creemos que hemos hecho.
 *
 * ── Uso (PowerShell) ────────────────────────────────────────────────────────
 *
 *   $env:SEPOLIA_RPC_URL       = "https://…"
 *   $env:DEPLOYER_PRIVATE_KEY  = "0x…"   # clave del OWNER, en frío
 *   $env:RELAYER_TO_AUTHORIZE  = "0x…"
 *   $env:RELAYER_TO_REVOKE     = "0x…"   # opcional
 *   npx hardhat run scripts/set-relayer.ts --network sepolia
 *
 * Al terminar, borra la clave de la sesión:
 *   Remove-Item Env:\DEPLOYER_PRIVATE_KEY
 */
import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

const ABI = [
  "function owner() view returns (address)",
  "function isRelayer(address) view returns (bool)",
  "function setRelayer(address _relayer, bool _allowed) external",
];

function direccionDeEntorno(nombre: string, obligatoria: boolean): string | null {
  const valor = (process.env[nombre] || "").trim();
  if (!valor) {
    if (obligatoria) throw new Error(`Falta ${nombre}: la dirección a autorizar.`);
    return null;
  }
  if (!ethers.isAddress(valor)) {
    throw new Error(`${nombre} no es una dirección válida: ${valor}`);
  }
  return ethers.getAddress(valor);
}

async function main() {
  const ficheroDespliegue = path.join(__dirname, "..", "deployments", `${network.name}.json`);

  // El fichero de despliegue es la fuente de verdad para ESTA red: lo escribe
  // deploy.ts y lo mantiene al día este mismo script. CONTRACT_ADDRESS del
  // entorno solo se usa si el fichero no existe (primer despliegue). Antes el
  // env var ganaba siempre — un blockchain/.env con la dirección de otra red
  // (p. ej. la de Hardhat local, de probar en local) pisaba en silencio la
  // dirección real de sepolia.json sin ningún aviso. Pasó de verdad: por eso
  // ahora, si las dos existen y no coinciden, se para en vez de elegir sola.
  const infoDespliegue = fs.existsSync(ficheroDespliegue)
    ? JSON.parse(fs.readFileSync(ficheroDespliegue, "utf8"))
    : null;
  const direccionEntorno = (process.env.CONTRACT_ADDRESS || "").trim();
  const contractAddress = infoDespliegue?.contractAddress || direccionEntorno;

  if (!contractAddress) {
    throw new Error(
      `No hay dirección de contrato: defina CONTRACT_ADDRESS o cree ${ficheroDespliegue}.`,
    );
  }

  if (
    infoDespliegue?.contractAddress &&
    direccionEntorno &&
    direccionEntorno.toLowerCase() !== infoDespliegue.contractAddress.toLowerCase()
  ) {
    throw new Error(
      `CONTRACT_ADDRESS del entorno (${direccionEntorno}) no coincide con ` +
      `${ficheroDespliegue} (${infoDespliegue.contractAddress}) para la red "${network.name}".\n` +
      `  No se adivina cuál es la correcta: borra CONTRACT_ADDRESS del .env si el ` +
      `fichero de despliegue ya es correcto, o corrígelo si no lo es.`,
    );
  }

  const autorizar = direccionDeEntorno("RELAYER_TO_AUTHORIZE", true)!;
  const revocar = direccionDeEntorno("RELAYER_TO_REVOKE", false);

  if (revocar && revocar.toLowerCase() === autorizar.toLowerCase()) {
    throw new Error("RELAYER_TO_AUTHORIZE y RELAYER_TO_REVOKE son la misma dirección.");
  }

  // ── Comprobaciones antes de tocar nada ────────────────────────────────────
  const provider = ethers.provider;
  if ((await provider.getCode(contractAddress)) === "0x") {
    throw new Error(`No hay contrato desplegado en ${contractAddress} (red ${network.name}).`);
  }

  const [firmante] = await ethers.getSigners();
  const contrato = new ethers.Contract(contractAddress, ABI, firmante);
  const owner: string = await contrato.owner();

  console.log(`Red:       ${network.name}`);
  console.log(`Contrato:  ${contractAddress}`);
  console.log(`Owner:     ${owner}`);
  console.log(`Firmante:  ${firmante.address}`);

  if (firmante.address.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(
      "El firmante NO es el owner del contrato: setRelayer revertiría.\n" +
      "  Exporte DEPLOYER_PRIVATE_KEY con la clave del owner antes de ejecutar.\n" +
      "  Aviso: si no la define, hardhat.config.ts usa la clave por defecto de\n" +
      "  Hardhat, que es pública y no es el owner.",
    );
  }

  const saldo = await provider.getBalance(firmante.address);
  if (saldo === 0n) throw new Error("El owner no tiene saldo para pagar el gas.");
  console.log(`Saldo:     ${ethers.formatEther(saldo)} ETH`);

  console.log("\nEstado actual:");
  console.log(`  isRelayer(${autorizar}) = ${await contrato.isRelayer(autorizar)}`);
  if (revocar) console.log(`  isRelayer(${revocar}) = ${await contrato.isRelayer(revocar)}`);

  // ── Cambios, solo los necesarios ──────────────────────────────────────────
  if (await contrato.isRelayer(autorizar)) {
    console.log(`\n${autorizar} ya estaba autorizada: no se envía nada.`);
  } else {
    console.log(`\nAutorizando ${autorizar}…`);
    const tx = await contrato.setRelayer(autorizar, true);
    console.log(`  tx ${tx.hash}`);
    await tx.wait();
    console.log("  confirmada");
  }

  if (revocar) {
    if (!(await contrato.isRelayer(revocar))) {
      console.log(`${revocar} ya no estaba autorizada: no se envía nada.`);
    } else {
      console.log(`\nRevocando ${revocar}…`);
      const tx = await contrato.setRelayer(revocar, false);
      console.log(`  tx ${tx.hash}`);
      await tx.wait();
      console.log("  confirmada");
    }
  }

  // ── Se relee de la cadena: el fichero refleja el contrato, no la intención ─
  const autorizadaOk: boolean = await contrato.isRelayer(autorizar);
  const revocadaOk: boolean = revocar ? await contrato.isRelayer(revocar) : false;

  console.log("\nEstado final, leído del contrato:");
  console.log(`  isRelayer(${autorizar}) = ${autorizadaOk}`);
  if (revocar) console.log(`  isRelayer(${revocar}) = ${revocadaOk}`);

  if (!autorizadaOk || (revocar && revocadaOk)) {
    throw new Error("El estado final no es el esperado. NO se actualiza el registro.");
  }

  if (fs.existsSync(ficheroDespliegue)) {
    const info = JSON.parse(fs.readFileSync(ficheroDespliegue, "utf8"));

    // El argumento del constructor NO cambia nunca: es lo que hace falta para
    // verificar el contrato en el explorador. Si aún no está registrado aparte,
    // se conserva ahora, antes de que relayerAddress pase a significar otra cosa.
    if (!info.constructorArgs) {
      info.constructorArgs = [info.relayerAddress];
    }
    info.relayerAddress = autorizar;
    info.relayerUpdatedAt = new Date().toISOString();

    fs.writeFileSync(ficheroDespliegue, JSON.stringify(info, null, 2) + "\n");
    console.log(`\nActualizado ${ficheroDespliegue}`);
    console.log("  constructorArgs = argumento del despliegue (para verificar)");
    console.log("  relayerAddress  = dirección autorizada ahora");
  }

  console.log("\nHecho. Borre la clave de la sesión: Remove-Item Env:\DEPLOYER_PRIVATE_KEY");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nFALLO:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
