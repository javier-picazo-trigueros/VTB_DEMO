import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Despliegue de ElectionRegistryV2.
 *
 * ── Qué cambia frente a la versión anterior de este script ───────────────────
 *
 * 1. Ya no crea 6 elecciones de relleno. Era uno de los orígenes del lío de
 *    identificadores: el contrato acababa con elecciones "Election 1..6" que no
 *    se correspondían con ninguna de la base, y la sincronización suponía que
 *    la elección i de la base era la i del contrato. Las elecciones las crea el
 *    backend, una a una, y su id sale del evento ElectionCreated.
 *
 * 2. Separa el owner del relayer (BC-05). Quien firma este despliegue es el
 *    owner —una clave fría que NO debe estar en el .env de ningún servidor— y
 *    autoriza como relayer la dirección caliente del backend, que es la única
 *    que necesita firmar votos. Si esa clave se compromete, el owner la revoca
 *    con setRelayer sin redesplegar.
 *
 * 3. Verifica el contrato en Etherscan como parte del despliegue (BC-10). Sin
 *    verificar, un tercero solo ve bytecode y no puede leer las reglas que
 *    aceptaron su voto: toda la propuesta de "auditable públicamente" se cae.
 *
 * 4. Escribe deployments/<red>.json en vez de deployment-info.json. El fichero
 *    antiguo se sobrescribía en cada despliegue local, así que el registro de
 *    Sepolia desaparecía en cuanto alguien levantaba un nodo de Hardhat.
 *
 * ── Uso ─────────────────────────────────────────────────────────────────────
 *
 *   npx hardhat run scripts/deploy.ts --network localhost
 *   RELAYER_ADDRESS=0x... npx hardhat run scripts/deploy.ts --network sepolia
 *
 * En Sepolia hacen falta, en el entorno (no en un fichero del repositorio):
 *   DEPLOYER_PRIVATE_KEY  clave fría del owner, con ETH de Sepolia
 *   RELAYER_ADDRESS       dirección caliente del backend (solo la dirección)
 *   ETHERSCAN_API_KEY     para la verificación
 */

/** Confirmaciones antes de verificar: Etherscan necesita haber indexado el contrato. */
const CONFIRMATIONS_BEFORE_VERIFY = 5;

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const isLocal =
    network.name === "localhost" || network.name === "hardhat" || chainId === 31337n;

  const [deployer, second] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`Red: ${network.name} (chainId ${chainId})`);
  console.log(`Owner (quien despliega): ${deployer.address}`);
  console.log(`Saldo: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error("La cuenta que despliega no tiene saldo: el despliegue fallaría.");
  }

  // ── Relayer ───────────────────────────────────────────────────────────────
  const relayerEnv = (process.env.RELAYER_ADDRESS || "").trim();
  let relayer: string;

  if (relayerEnv) {
    if (!ethers.isAddress(relayerEnv)) {
      throw new Error(`RELAYER_ADDRESS no es una dirección válida: ${relayerEnv}`);
    }
    relayer = ethers.getAddress(relayerEnv);
  } else if (isLocal) {
    relayer = second.address; // en local basta con la segunda cuenta de Hardhat
    console.log("RELAYER_ADDRESS no definida: en local se usa la cuenta #1.");
  } else {
    throw new Error(
      "Falta RELAYER_ADDRESS.\n" +
      "Es la dirección caliente del backend, la única autorizada a registrar votos.\n" +
      "Pásala en el entorno: RELAYER_ADDRESS=0x... npx hardhat run scripts/deploy.ts --network " + network.name,
    );
  }

  if (relayer.toLowerCase() === deployer.address.toLowerCase()) {
    console.warn(
      "\n AVISO: el relayer y el owner son la misma clave.\n" +
      "   Es exactamente lo que señala BC-05: comprometer el backend da también\n" +
      "   el control del contrato. Solo tiene sentido en local.\n",
    );
    if (!isLocal) {
      throw new Error("En una red real el owner y el relayer deben ser claves distintas.");
    }
  }

  console.log(`Relayer autorizado: ${relayer}`);

  // ── Despliegue ────────────────────────────────────────────────────────────
  const factory = await ethers.getContractFactory("ElectionRegistryV2");
  const registry = await factory.deploy(relayer);
  const deployTx = registry.deploymentTransaction();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const receipt = await ethers.provider.getTransactionReceipt(deployTx!.hash);
  const deployBlock = receipt!.blockNumber;

  console.log(`\nElectionRegistryV2 desplegado en ${address} (bloque ${deployBlock})`);

  // Comprobación en vivo de que ha quedado como se espera.
  const onChainOwner = await registry.owner();
  const relayerOk = await registry.isRelayer(relayer);
  if (onChainOwner !== deployer.address || !relayerOk) {
    throw new Error("El estado desplegado no coincide con lo esperado: revisar antes de usarlo.");
  }
  console.log(`Comprobado: owner=${onChainOwner}, relayer autorizado=${relayerOk}`);

  // ── Verificación en el explorador ─────────────────────────────────────────
  let verified = false;
  if (!isLocal) {
    if (!process.env.ETHERSCAN_API_KEY) {
      console.warn(
        "\n ETHERSCAN_API_KEY no está definida: el contrato queda SIN VERIFICAR.\n" +
        "   Un tercero solo verá bytecode y no podrá leer las reglas del contrato.\n" +
        `   Cuando la tengas: npx hardhat verify --network ${network.name} ${address} ${relayer}\n`,
      );
    } else {
      console.log(`\nEsperando ${CONFIRMATIONS_BEFORE_VERIFY} confirmaciones antes de verificar...`);
      await deployTx!.wait(CONFIRMATIONS_BEFORE_VERIFY);
      try {
        await run("verify:verify", { address, constructorArguments: [relayer] });
        verified = true;
        console.log("Contrato verificado en el explorador.");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/already verified/i.test(message)) {
          verified = true;
          console.log("El contrato ya estaba verificado.");
        } else {
          console.warn(`La verificación ha fallado (el despliegue es válido igualmente): ${message}`);
          console.warn(`Reintento manual: npx hardhat verify --network ${network.name} ${address} ${relayer}`);
        }
      }
    }
  }

  // ── Registro del despliegue ───────────────────────────────────────────────
  const explorerUrls: Record<string, string> = {
    sepolia: "https://sepolia.etherscan.io",
    mainnet: "https://etherscan.io",
  };
  const explorerUrl = process.env.EXPLORER_URL || explorerUrls[network.name] || "";

  const info = {
    network: network.name,
    chainId: chainId.toString(),
    contractName: "ElectionRegistryV2",
    contractAddress: address,
    // Sin esto, quien quiera recontar desde fuera no sabe desde qué bloque
    // escanear los logs, y eth_getLogs desde el bloque 0 lo rechaza el proveedor.
    deployBlock,
    ownerAddress: deployer.address,
    relayerAddress: relayer,
    deploymentTime: new Date().toISOString(),
    verified,
    explorerUrl,
    frontendConfig: {
      VITE_CONTRACT_ADDRESS: address,
      VITE_EXPLORER_URL: explorerUrl,
    },
    backendConfig: {
      CONTRACT_ADDRESS: address,
      DEPLOY_BLOCK: String(deployBlock),
      EXPLORER_URL: explorerUrl,
    },
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(info, null, 2));

  console.log("\n" + "=".repeat(64));
  console.log("DESPLIEGUE COMPLETADO");
  console.log("=".repeat(64));
  console.log(JSON.stringify(info, null, 2));
  console.log(`\nGuardado en: ${outPath}`);
  console.log(
    "\nSiguiente paso: actualizar CONTRACT_ADDRESS y DEPLOY_BLOCK en el backend\n" +
    "(y en Render) y VITE_CONTRACT_ADDRESS en el frontend. La clave del owner\n" +
    "no debe copiarse a ningún .env.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Despliegue fallido:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
