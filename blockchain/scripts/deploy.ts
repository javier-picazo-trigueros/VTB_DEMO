import { ethers } from "hardhat";

/**
 * @title Script de Deployment - VTB Election Registry
 * @author Senior Web3 Architect
 * @dev Script que despliega ElectionRegistry en red Hardhat local
 *
 * EJECUCIÓN:
 * $ npx hardhat run scripts/deploy.ts --network localhost
 *
 * ARQUITECTURA:
 * 1. Conecta a nodo local de Hardhat
 * 2. Despliega contrato ElectionRegistry
 * 3. Crea elección de prueba con horario válido
 * 4. Retorna direcciones para frontend/backend
 */

async function main() {
  console.log("🚀 Iniciando deployment del VTB Election Registry...");

  // Obtener signer (cuenta deployer)
  const [deployer] = await ethers.getSigners();
  console.log(`📋 Desplegando desde cuenta: ${deployer.address}`);

  // Compilar si es necesario
  const ElectionRegistry = await ethers.getContractFactory("ElectionRegistry");
  
  console.log("⏳ Desplegando contrato...");
  const electionRegistry = await ElectionRegistry.deploy();
  
  // Esperar a que se confirme la transacción
  await electionRegistry.waitForDeployment();
  
  const deployedAddress = await electionRegistry.getAddress();
  console.log(`✅ ElectionRegistry desplegado en: ${deployedAddress}`);

  // Crear una elección de prueba
  console.log("\n📝 Creando elección de prueba...");
  
  const now = Math.floor(Date.now() / 1000);
  const startTime = now + 60; // Inicia en 1 minuto
  const endTime = now + 3600; // Termina en 1 hora

  const createElectionTx = await electionRegistry.createElection(
    "Elección Universitaria 2026",
    startTime,
    endTime
  );

  await createElectionTx.wait();
  console.log("✅ Elección de prueba creada exitosamente");

  // Obtener información de la elección
  const electionInfo = await electionRegistry.getElection(1);
  console.log("\n📊 Información de la Elección:");
  console.log(`  - Nombre: ${electionInfo.name}`);
  console.log(`  - Activa: ${electionInfo.active}`);
  console.log(`  - Total de votos: ${electionInfo.totalVotes}`);

  // Guardar información de deployment
  const deploymentInfo = {
    network: "localhost",
    contractName: "ElectionRegistry",
    contractAddress: deployedAddress,
    deployerAddress: deployer.address,
    deploymentTime: new Date().toISOString(),
    electionId: 1,
    electionName: "Elección Universitaria 2026",
    startTime: startTime,
    endTime: endTime,
    chainId: (await ethers.provider.getNetwork()).chainId,
    
    // Información para Frontend
    frontendConfig: {
      contractAddress: deployedAddress,
      contractABI: "Ver: artifacts/contracts/VTB.sol/ElectionRegistry.json",
      electionId: 1,
      rpcUrl: "http://localhost:8545"
    },

    // Información para Backend
    backendConfig: {
      contractAddress: deployedAddress,
      rpcUrl: "http://localhost:8545",
      explorerUrl: "http://localhost:8545" // Hardhat no tiene explorer
    }
  };

  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT EXITOSO");
  console.log("=".repeat(60));
  console.log("\n📍 INFORMACIÓN PARA CONFIGURACIÓN:");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Guardar a archivo para referencia
  const fs = require("fs");
  fs.writeFileSync(
    "deployment-info.json",
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\n✅ Información guardada en: deployment-info.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error en deployment:", error);
    process.exit(1);
  });
