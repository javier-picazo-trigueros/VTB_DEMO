import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Network-agnostic deploy script for ElectionRegistry.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network localhost
 *   npx hardhat run scripts/deploy.ts --network sepolia
 *   npx hardhat run scripts/deploy.ts --network custom
 *
 * Saves deployment info to deployment-info.json for easy backend/frontend wiring.
 */
async function main() {
  console.log(`Deploying ElectionRegistry to network: ${network.name}`);

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address} (balance: ${ethers.formatEther(balance)} ETH)`);

  const ElectionRegistry = await ethers.getContractFactory("ElectionRegistry");
  console.log("Deploying contract...");
  const electionRegistry = await ElectionRegistry.deploy();
  await electionRegistry.waitForDeployment();

  const deployedAddress = await electionRegistry.getAddress();
  console.log(`ElectionRegistry deployed at: ${deployedAddress}`);

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const isLocalNode = network.name === "localhost" || network.name === "hardhat" || chainId === 31337n;

  // Create 6 test elections aligned with DB seed (IDs 1-6)
  console.log("\nCreating 6 base elections...");
  const now = Math.floor(Date.now() / 1000);
  const startTime = now + 10;
  const endTime = now + 3 * 30 * 24 * 3600; // ~3 months

  for (let i = 1; i <= 6; i++) {
    const tx = await electionRegistry.createElection(`Election ${i}`, startTime, endTime);
    await tx.wait();
  }

  if (isLocalNode) {
    // Advance time so elections are immediately active on local node
    await ethers.provider.send("evm_increaseTime", [15]);
    await ethers.provider.send("evm_mine", []);
  }

  console.log("6 elections created and activated");

  const electionInfo = await electionRegistry.getElection(1);
  console.log(`\nElection 1 — name: ${electionInfo.name}, active: ${electionInfo.active}, votes: ${electionInfo.totalVotes}`);

  // Explorer URL by network
  const explorerUrls: Record<string, string> = {
    sepolia: "https://sepolia.etherscan.io",
    mainnet: "https://etherscan.io",
    localhost: "",
    hardhat: "",
  };
  const explorerUrl = process.env.EXPLORER_URL || explorerUrls[network.name] || "";

  const deploymentInfo = {
    network: network.name,
    chainId: chainId.toString(),
    contractName: "ElectionRegistry",
    contractAddress: deployedAddress,
    deployerAddress: deployer.address,
    deploymentTime: new Date().toISOString(),
    startTime,
    endTime,
    explorerUrl,
    frontendConfig: {
      VITE_CONTRACT_ADDRESS: deployedAddress,
      VITE_RPC_URL: (network.config as any).url || "http://localhost:8545",
      VITE_EXPLORER_URL: explorerUrl,
    },
    backendConfig: {
      CONTRACT_ADDRESS: deployedAddress,
      RPC_URL: (network.config as any).url || "http://localhost:8545",
      EXPLORER_URL: explorerUrl,
    },
  };

  const outPath = path.join(__dirname, "..", "deployment-info.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(deploymentInfo, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)
  );

  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUCCESSFUL");
  console.log("=".repeat(60));
  console.log(JSON.stringify(deploymentInfo, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  console.log(`\nDeployment info saved to: ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Deployment failed:", err);
    process.exit(1);
  });
