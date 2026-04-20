import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";

// Load .env if dotenv is available (optional dev dependency)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
} catch { /* dotenv not installed — env vars must be set externally */ }

const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat default account #0

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    // Local Hardhat node — run with: npx hardhat node
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    // In-process ephemeral network used by tests
    hardhat: {
      chainId: 31337,
    },

    // Sepolia testnet — set SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY in .env
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 11155111,
    },

    // Custom institutional / private node — set CUSTOM_RPC_URL in .env
    custom: {
      url: process.env.CUSTOM_RPC_URL || "http://127.0.0.1:8545",
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: Number(process.env.CUSTOM_CHAIN_ID || 31337),
    },
  },

  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
