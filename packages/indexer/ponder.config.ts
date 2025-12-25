import { createConfig } from "ponder";
import { http } from "viem";

const INDEXER_RPC_URL = process.env.INDEXER_RPC_URL ?? "http://localhost:8545";

// Import ABIs
import MerkleVestingFactoryAbi from "./abis/MerkleVestingFactory.json" assert { type: "json" };
import MerkleVestingDeployerAbi from "./abis/MerkleVestingDeployer.json" assert { type: "json" };
import VestingWalletFeeWrapperAbi from "./abis/VestingWalletFeeWrapper.json" assert { type: "json" };

// ============================================================
// DETERMINISTIC FACTORY ADDRESS
// ============================================================
// Deployed via CREATE2 using the canonical deployer (0x4e59b44847b379578588920cA78FbF26c0B4956C)
// Salt: keccak256("tally-vesting-factory-v1")
// This address is IDENTICAL on all EVM chains!
const FACTORY_ADDRESS = "0x6B51bD91c3FF15e34C56D62F7c77892DE7bA3786" as const;

export default createConfig({
  networks: {
    // Local Anvil only (for development)
    anvil: {
      chainId: 31337,
      transport: http(INDEXER_RPC_URL),
    },
  },

  contracts: {
    // ============================================================
    // FACTORY - Singleton with deterministic address
    // ============================================================
    MerkleVestingFactory: {
      abi: MerkleVestingFactoryAbi,
      address: FACTORY_ADDRESS,
      network: "anvil",
      startBlock: 0,
    },

    // ============================================================
    // DEPLOYER - Discovered via factory's DeployerCreated event
    // ============================================================
    MerkleVestingDeployer: {
      abi: MerkleVestingDeployerAbi,
      network: "anvil",
      factory: {
        address: FACTORY_ADDRESS,
        event: "DeployerCreated",
        parameter: "deployer",
      },
      startBlock: 0,
    },

    // ============================================================
    // VESTING WALLET - Track release events emitted by the wrapper.
    // ============================================================
    VestingWallet: {
      abi: VestingWalletFeeWrapperAbi,
      network: "anvil",
      startBlock: 0,
    },
  },
});
