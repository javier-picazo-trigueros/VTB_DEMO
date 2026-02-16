import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";

/**
 * @title Configuración de Hardhat - VTB Demo
 * @author Senior Web3 Architect
 * @dev Configuración para compilar, testear y desplegar Smart Contract
 *
 * Red Local:
 * - Puerto: 8545
 * - URL RPC: http://localhost:8545
 * - Chainsaw ID: 31337 (testnet local default)
 * - Cuentas prefinanciadas: 20 cuentas con 10,000 ETH cada una
 */

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
    /**
     * Red local de Hardhat
     * Se ejecuta cuando haces: npx hardhat node
     */
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    /**
     * Red de prueba ephemeral (para tests)
     * Se usa automáticamente en tests
     */
    hardhat: {
      chainId: 31337,
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
