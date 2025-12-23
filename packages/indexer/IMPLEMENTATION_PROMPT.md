# Ponder Indexer Implementation: Tally Vesting Contracts

## Objective

Implement a production-ready Ponder indexer for the Tally Vesting system that tracks:
- MerkleVestingFactory deployments
- MerkleVestingDeployer instances and claims
- VestingWalletCliffConcrete releases

Requirements:
1. **Performant relationships** - Efficient queries across entity hierarchies
2. **Deep query capability** - Factory → Deployers → Claims → Wallets → Releases
3. **Multichain-ready** - Native support for indexing across multiple chains

---

## Contract Architecture

```
MerkleVestingFactory (singleton per chain)
    │
    ├── createDeployer() → emits DeployerCreated
    │
    └── MerkleVestingDeployer (one per vesting campaign)
            │
            ├── claim(proof, amount) → emits VestingWalletCreated
            │
            └── VestingWalletCliffConcrete (one per beneficiary)
                    │
                    └── release(token) → emits ERC20Released
```

### Events to Index

**MerkleVestingFactory:**
```solidity
event DeployerCreated(
    address indexed deployer,
    address indexed token,
    bytes32 merkleRoot,
    uint256 totalAllocation,
    uint64 vestingStart,
    uint64 vestingDuration,
    uint64 cliffDuration,
    uint64 claimDeadline
);
```

**MerkleVestingDeployer:**
```solidity
event VestingWalletCreated(
    address indexed beneficiary,
    address indexed vestingWallet,
    uint256 amount
);
```

**VestingWalletCliffConcrete (OpenZeppelin):**
```solidity
event ERC20Released(address indexed token, uint256 amount);
```

---

## Schema Design

### Design Principles

1. **Composite IDs with chainId** - All entity IDs include chainId for multichain uniqueness
2. **Denormalized aggregates** - Store computed totals to avoid expensive aggregations
3. **Indexed foreign keys** - Enable efficient joins and relationship traversal
4. **Temporal fields** - Track creation and update timestamps for time-based queries

### Entity Relationship Diagram

```
┌─────────────────┐
│     Factory     │
│  (per chain)    │
└────────┬────────┘
         │ 1:many
         ▼
┌─────────────────┐       ┌─────────────────┐
│    Deployer     │───────│      Token      │
│  (campaign)     │       │   (ERC20 ref)   │
└────────┬────────┘       └─────────────────┘
         │ 1:many
         ▼
┌─────────────────┐
│     Claim       │
└────────┬────────┘
         │ 1:1
         ▼
┌─────────────────┐
│  VestingWallet  │
└────────┬────────┘
         │ 1:many
         ▼
┌─────────────────┐
│    Release      │
└─────────────────┘
```

### Schema (ponder.schema.ts)

```typescript
import { onchainTable, relations, index } from "ponder";

// ============================================================
// FACTORY - One per chain, creates deployers
// ============================================================
export const factory = onchainTable(
  "factory",
  (t) => ({
    // Composite ID: {chainId}_{address}
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    address: t.hex().notNull(),
    deployerCount: t.integer().notNull().default(0),
    totalValueLocked: t.bigint().notNull().default(0n),
    createdAt: t.integer().notNull(),
    createdAtBlock: t.bigint().notNull(),
  }),
  (table) => ({
    chainIdx: index().on(table.chainId),
    addressIdx: index().on(table.address),
  })
);

export const factoryRelations = relations(factory, ({ many }) => ({
  deployers: many(deployer),
}));

// ============================================================
// DEPLOYER - A vesting campaign created by the factory
// ============================================================
export const deployer = onchainTable(
  "deployer",
  (t) => ({
    // Composite ID: {chainId}_{address}
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    address: t.hex().notNull(),
    factoryId: t.text().notNull(), // FK to factory

    // Token being vested
    tokenAddress: t.hex().notNull(),
    tokenId: t.text().notNull(), // FK to token

    // Merkle configuration
    merkleRoot: t.hex().notNull(),

    // Vesting schedule (stored as Unix timestamps)
    vestingStart: t.bigint().notNull(),
    vestingDuration: t.bigint().notNull(),
    cliffDuration: t.bigint().notNull(),
    claimDeadline: t.bigint().notNull(),

    // Allocations
    totalAllocation: t.bigint().notNull(),
    totalClaimed: t.bigint().notNull().default(0n),
    claimCount: t.integer().notNull().default(0),

    // Computed fields for query efficiency
    vestingEnd: t.bigint().notNull(), // vestingStart + vestingDuration
    cliffEnd: t.bigint().notNull(),   // vestingStart + cliffDuration

    // Metadata
    createdAt: t.integer().notNull(),
    createdAtBlock: t.bigint().notNull(),
    createdTxHash: t.hex().notNull(),
  }),
  (table) => ({
    chainIdx: index().on(table.chainId),
    factoryIdx: index().on(table.factoryId),
    tokenIdx: index().on(table.tokenId),
    vestingStartIdx: index().on(table.vestingStart),
    claimDeadlineIdx: index().on(table.claimDeadline),
  })
);

export const deployerRelations = relations(deployer, ({ one, many }) => ({
  factory: one(factory, {
    fields: [deployer.factoryId],
    references: [factory.id],
  }),
  token: one(token, {
    fields: [deployer.tokenId],
    references: [token.id],
  }),
  claims: many(claim),
  vestingWallets: many(vestingWallet),
}));

// ============================================================
// TOKEN - ERC20 tokens being vested (denormalized for queries)
// ============================================================
export const token = onchainTable(
  "token",
  (t) => ({
    // Composite ID: {chainId}_{address}
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    address: t.hex().notNull(),

    // Token metadata (populated on first encounter)
    symbol: t.text(),
    name: t.text(),
    decimals: t.integer(),

    // Aggregate stats across all deployers using this token
    totalVestingAmount: t.bigint().notNull().default(0n),
    totalClaimedAmount: t.bigint().notNull().default(0n),
    totalReleasedAmount: t.bigint().notNull().default(0n),
    deployerCount: t.integer().notNull().default(0),
  }),
  (table) => ({
    chainIdx: index().on(table.chainId),
    addressIdx: index().on(table.address),
    symbolIdx: index().on(table.symbol),
  })
);

export const tokenRelations = relations(token, ({ many }) => ({
  deployers: many(deployer),
  releases: many(release),
}));

// ============================================================
// CLAIM - When a beneficiary claims their vesting allocation
// ============================================================
export const claim = onchainTable(
  "claim",
  (t) => ({
    // Composite ID: {chainId}_{txHash}_{logIndex}
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),

    // References
    deployerId: t.text().notNull(),
    vestingWalletId: t.text().notNull(),
    beneficiaryId: t.text().notNull(), // FK to account

    // Claim details
    beneficiaryAddress: t.hex().notNull(),
    vestingWalletAddress: t.hex().notNull(),
    amount: t.bigint().notNull(),

    // Transaction metadata
    claimedAt: t.integer().notNull(),
    blockNumber: t.bigint().notNull(),
    txHash: t.hex().notNull(),
    logIndex: t.integer().notNull(),
  }),
  (table) => ({
    chainIdx: index().on(table.chainId),
    deployerIdx: index().on(table.deployerId),
    beneficiaryIdx: index().on(table.beneficiaryId),
    claimedAtIdx: index().on(table.claimedAt),
  })
);

export const claimRelations = relations(claim, ({ one }) => ({
  deployer: one(deployer, {
    fields: [claim.deployerId],
    references: [deployer.id],
  }),
  vestingWallet: one(vestingWallet, {
    fields: [claim.vestingWalletId],
    references: [vestingWallet.id],
  }),
  beneficiary: one(account, {
    fields: [claim.beneficiaryId],
    references: [account.id],
  }),
}));

// ============================================================
// VESTING WALLET - Individual wallet for each beneficiary
// ============================================================
export const vestingWallet = onchainTable(
  "vesting_wallet",
  (t) => ({
    // Composite ID: {chainId}_{address}
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    address: t.hex().notNull(),

    // References
    deployerId: t.text().notNull(),
    beneficiaryId: t.text().notNull(),

    // Denormalized for queries
    beneficiaryAddress: t.hex().notNull(),
    tokenAddress: t.hex().notNull(),
    tokenId: t.text().notNull(),

    // Vesting amounts
    totalVested: t.bigint().notNull(),
    totalReleased: t.bigint().notNull().default(0n),
    releaseCount: t.integer().notNull().default(0),

    // Vesting schedule (copied from deployer for query efficiency)
    vestingStart: t.bigint().notNull(),
    vestingEnd: t.bigint().notNull(),
    cliffEnd: t.bigint().notNull(),

    // Metadata
    createdAt: t.integer().notNull(),
    createdAtBlock: t.bigint().notNull(),
  }),
  (table) => ({
    chainIdx: index().on(table.chainId),
    addressIdx: index().on(table.address),
    deployerIdx: index().on(table.deployerId),
    beneficiaryIdx: index().on(table.beneficiaryId),
    tokenIdx: index().on(table.tokenId),
  })
);

export const vestingWalletRelations = relations(vestingWallet, ({ one, many }) => ({
  deployer: one(deployer, {
    fields: [vestingWallet.deployerId],
    references: [deployer.id],
  }),
  beneficiary: one(account, {
    fields: [vestingWallet.beneficiaryId],
    references: [account.id],
  }),
  token: one(token, {
    fields: [vestingWallet.tokenId],
    references: [token.id],
  }),
  releases: many(release),
}));

// ============================================================
// RELEASE - When tokens are released from a vesting wallet
// ============================================================
export const release = onchainTable(
  "release",
  (t) => ({
    // Composite ID: {chainId}_{txHash}_{logIndex}
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),

    // References
    vestingWalletId: t.text().notNull(),
    tokenId: t.text().notNull(),
    beneficiaryId: t.text().notNull(),

    // Release details
    tokenAddress: t.hex().notNull(),
    amount: t.bigint().notNull(),

    // Transaction metadata
    releasedAt: t.integer().notNull(),
    blockNumber: t.bigint().notNull(),
    txHash: t.hex().notNull(),
    logIndex: t.integer().notNull(),
  }),
  (table) => ({
    chainIdx: index().on(table.chainId),
    walletIdx: index().on(table.vestingWalletId),
    tokenIdx: index().on(table.tokenId),
    beneficiaryIdx: index().on(table.beneficiaryId),
    releasedAtIdx: index().on(table.releasedAt),
  })
);

export const releaseRelations = relations(release, ({ one }) => ({
  vestingWallet: one(vestingWallet, {
    fields: [release.vestingWalletId],
    references: [vestingWallet.id],
  }),
  token: one(token, {
    fields: [release.tokenId],
    references: [token.id],
  }),
  beneficiary: one(account, {
    fields: [release.beneficiaryId],
    references: [account.id],
  }),
}));

// ============================================================
// ACCOUNT - Aggregated view of a beneficiary across all chains
// ============================================================
export const account = onchainTable(
  "account",
  (t) => ({
    // Composite ID: {chainId}_{address}
    id: t.text().primaryKey(),
    chainId: t.integer().notNull(),
    address: t.hex().notNull(),

    // Aggregate stats
    totalVestingAmount: t.bigint().notNull().default(0n),
    totalClaimedAmount: t.bigint().notNull().default(0n),
    totalReleasedAmount: t.bigint().notNull().default(0n),
    vestingWalletCount: t.integer().notNull().default(0),
    claimCount: t.integer().notNull().default(0),
    releaseCount: t.integer().notNull().default(0),

    // First interaction
    firstSeenAt: t.integer().notNull(),
    firstSeenBlock: t.bigint().notNull(),
  }),
  (table) => ({
    chainIdx: index().on(table.chainId),
    addressIdx: index().on(table.address),
  })
);

export const accountRelations = relations(account, ({ many }) => ({
  vestingWallets: many(vestingWallet),
  claims: many(claim),
  releases: many(release),
}));
```

---

## Ponder Configuration (Multichain)

```typescript
// ponder.config.ts
import { createConfig, factory } from "ponder";
import { http } from "viem";

// Import ABIs from contracts package
import MerkleVestingFactoryAbi from "../contracts/abi/MerkleVestingFactory.json";
import MerkleVestingDeployerAbi from "../contracts/abi/MerkleVestingDeployer.json";
import VestingWalletCliffConcreteAbi from "../contracts/abi/VestingWalletCliffConcrete.json";

export default createConfig({
  networks: {
    // Mainnet
    mainnet: {
      chainId: 1,
      transport: http(process.env.PONDER_RPC_URL_1),
    },
    // Arbitrum
    arbitrum: {
      chainId: 42161,
      transport: http(process.env.PONDER_RPC_URL_42161),
    },
    // Base
    base: {
      chainId: 8453,
      transport: http(process.env.PONDER_RPC_URL_8453),
    },
    // Optimism
    optimism: {
      chainId: 10,
      transport: http(process.env.PONDER_RPC_URL_10),
    },
    // Local Anvil (for development)
    anvil: {
      chainId: 31337,
      transport: http("http://localhost:8545"),
    },
  },

  contracts: {
    // Factory contract - singleton per chain
    MerkleVestingFactory: {
      abi: MerkleVestingFactoryAbi,
      network: {
        mainnet: {
          address: "0x...", // Deploy address
          startBlock: 0,    // Deploy block
        },
        arbitrum: {
          address: "0x...",
          startBlock: 0,
        },
        // Add other chains as deployed
      },
    },

    // Deployer contracts - created by factory
    MerkleVestingDeployer: {
      abi: MerkleVestingDeployerAbi,
      network: {
        mainnet: {
          factory: {
            address: "0x...", // Factory address
            event: "DeployerCreated",
            parameter: "deployer",
          },
          startBlock: 0,
        },
        arbitrum: {
          factory: {
            address: "0x...",
            event: "DeployerCreated",
            parameter: "deployer",
          },
          startBlock: 0,
        },
      },
    },

    // Vesting wallets - created by deployers
    VestingWallet: {
      abi: VestingWalletCliffConcreteAbi,
      network: {
        mainnet: {
          factory: {
            address: "0x...", // We need to track via deployer events
            event: "VestingWalletCreated",
            parameter: "vestingWallet",
          },
          startBlock: 0,
        },
        arbitrum: {
          factory: {
            address: "0x...",
            event: "VestingWalletCreated",
            parameter: "vestingWallet",
          },
          startBlock: 0,
        },
      },
    },
  },
});
```

---

## Event Handlers (src/index.ts)

```typescript
import { ponder } from "ponder:registry";
import {
  factory,
  deployer,
  token,
  claim,
  vestingWallet,
  release,
  account,
} from "../ponder.schema";

// Helper to create composite IDs
const createId = (chainId: number, ...parts: string[]) =>
  `${chainId}_${parts.join("_")}`;

// ============================================================
// FACTORY HANDLERS
// ============================================================

ponder.on("MerkleVestingFactory:DeployerCreated", async ({ event, context }) => {
  const { db, network } = context;
  const chainId = network.chainId;

  const factoryId = createId(chainId, event.log.address);
  const deployerId = createId(chainId, event.args.deployer);
  const tokenId = createId(chainId, event.args.token);

  // Upsert factory
  await db.insert(factory)
    .values({
      id: factoryId,
      chainId,
      address: event.log.address,
      deployerCount: 1,
      totalValueLocked: event.args.totalAllocation,
      createdAt: Number(event.block.timestamp),
      createdAtBlock: event.block.number,
    })
    .onConflictDoUpdate((row) => ({
      deployerCount: row.deployerCount + 1,
      totalValueLocked: row.totalValueLocked + event.args.totalAllocation,
    }));

  // Upsert token
  await db.insert(token)
    .values({
      id: tokenId,
      chainId,
      address: event.args.token,
      totalVestingAmount: event.args.totalAllocation,
      deployerCount: 1,
    })
    .onConflictDoUpdate((row) => ({
      totalVestingAmount: row.totalVestingAmount + event.args.totalAllocation,
      deployerCount: row.deployerCount + 1,
    }));

  // Create deployer
  const vestingEnd = event.args.vestingStart + event.args.vestingDuration;
  const cliffEnd = event.args.vestingStart + event.args.cliffDuration;

  await db.insert(deployer).values({
    id: deployerId,
    chainId,
    address: event.args.deployer,
    factoryId,
    tokenAddress: event.args.token,
    tokenId,
    merkleRoot: event.args.merkleRoot,
    vestingStart: event.args.vestingStart,
    vestingDuration: event.args.vestingDuration,
    cliffDuration: event.args.cliffDuration,
    claimDeadline: event.args.claimDeadline,
    totalAllocation: event.args.totalAllocation,
    totalClaimed: 0n,
    claimCount: 0,
    vestingEnd,
    cliffEnd,
    createdAt: Number(event.block.timestamp),
    createdAtBlock: event.block.number,
    createdTxHash: event.transaction.hash,
  });
});

// ============================================================
// DEPLOYER HANDLERS
// ============================================================

ponder.on("MerkleVestingDeployer:VestingWalletCreated", async ({ event, context }) => {
  const { db, network } = context;
  const chainId = network.chainId;

  const deployerId = createId(chainId, event.log.address);
  const walletId = createId(chainId, event.args.vestingWallet);
  const beneficiaryId = createId(chainId, event.args.beneficiary);
  const claimId = createId(chainId, event.transaction.hash, event.log.logIndex.toString());

  // Get deployer to access vesting schedule
  const deployerRecord = await db.find(deployer, { id: deployerId });
  if (!deployerRecord) {
    console.error(`Deployer not found: ${deployerId}`);
    return;
  }

  // Upsert beneficiary account
  await db.insert(account)
    .values({
      id: beneficiaryId,
      chainId,
      address: event.args.beneficiary,
      totalVestingAmount: event.args.amount,
      totalClaimedAmount: event.args.amount,
      vestingWalletCount: 1,
      claimCount: 1,
      firstSeenAt: Number(event.block.timestamp),
      firstSeenBlock: event.block.number,
    })
    .onConflictDoUpdate((row) => ({
      totalVestingAmount: row.totalVestingAmount + event.args.amount,
      totalClaimedAmount: row.totalClaimedAmount + event.args.amount,
      vestingWalletCount: row.vestingWalletCount + 1,
      claimCount: row.claimCount + 1,
    }));

  // Create vesting wallet
  await db.insert(vestingWallet).values({
    id: walletId,
    chainId,
    address: event.args.vestingWallet,
    deployerId,
    beneficiaryId,
    beneficiaryAddress: event.args.beneficiary,
    tokenAddress: deployerRecord.tokenAddress,
    tokenId: deployerRecord.tokenId,
    totalVested: event.args.amount,
    totalReleased: 0n,
    releaseCount: 0,
    vestingStart: deployerRecord.vestingStart,
    vestingEnd: deployerRecord.vestingEnd,
    cliffEnd: deployerRecord.cliffEnd,
    createdAt: Number(event.block.timestamp),
    createdAtBlock: event.block.number,
  });

  // Create claim record
  await db.insert(claim).values({
    id: claimId,
    chainId,
    deployerId,
    vestingWalletId: walletId,
    beneficiaryId,
    beneficiaryAddress: event.args.beneficiary,
    vestingWalletAddress: event.args.vestingWallet,
    amount: event.args.amount,
    claimedAt: Number(event.block.timestamp),
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });

  // Update deployer stats
  await db.update(deployer, { id: deployerId })
    .set((row) => ({
      totalClaimed: row.totalClaimed + event.args.amount,
      claimCount: row.claimCount + 1,
    }));

  // Update token stats
  await db.update(token, { id: deployerRecord.tokenId })
    .set((row) => ({
      totalClaimedAmount: row.totalClaimedAmount + event.args.amount,
    }));
});

// ============================================================
// VESTING WALLET HANDLERS
// ============================================================

ponder.on("VestingWallet:ERC20Released", async ({ event, context }) => {
  const { db, network } = context;
  const chainId = network.chainId;

  const walletId = createId(chainId, event.log.address);
  const tokenId = createId(chainId, event.args.token);
  const releaseId = createId(chainId, event.transaction.hash, event.log.logIndex.toString());

  // Get wallet to access beneficiary
  const walletRecord = await db.find(vestingWallet, { id: walletId });
  if (!walletRecord) {
    console.error(`Vesting wallet not found: ${walletId}`);
    return;
  }

  // Create release record
  await db.insert(release).values({
    id: releaseId,
    chainId,
    vestingWalletId: walletId,
    tokenId,
    beneficiaryId: walletRecord.beneficiaryId,
    tokenAddress: event.args.token,
    amount: event.args.amount,
    releasedAt: Number(event.block.timestamp),
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });

  // Update wallet stats
  await db.update(vestingWallet, { id: walletId })
    .set((row) => ({
      totalReleased: row.totalReleased + event.args.amount,
      releaseCount: row.releaseCount + 1,
    }));

  // Update account stats
  await db.update(account, { id: walletRecord.beneficiaryId })
    .set((row) => ({
      totalReleasedAmount: row.totalReleasedAmount + event.args.amount,
      releaseCount: row.releaseCount + 1,
    }));

  // Update token stats
  await db.update(token, { id: tokenId })
    .set((row) => ({
      totalReleasedAmount: row.totalReleasedAmount + event.args.amount,
    }));
});
```

---

## Example GraphQL Queries

### Deep query: Account with all vesting details
```graphql
query AccountVestingDetails($address: String!, $chainId: Int!) {
  account(id: "${chainId}_${address}") {
    address
    totalVestingAmount
    totalClaimedAmount
    totalReleasedAmount
    vestingWalletCount

    vestingWallets {
      items {
        address
        totalVested
        totalReleased
        vestingStart
        vestingEnd
        cliffEnd

        deployer {
          address
          token {
            symbol
            decimals
          }
        }

        releases {
          items {
            amount
            releasedAt
            txHash
          }
        }
      }
    }
  }
}
```

### Query all deployers for a token
```graphql
query TokenDeployers($tokenAddress: String!, $chainId: Int!) {
  deployers(
    where: { tokenAddress: $tokenAddress, chainId: $chainId }
    orderBy: "createdAt"
    orderDirection: "desc"
  ) {
    items {
      address
      totalAllocation
      totalClaimed
      claimCount
      vestingStart
      vestingEnd
      claimDeadline

      claims {
        totalCount
      }
    }
  }
}
```

### Cross-chain account summary
```graphql
query CrossChainAccount($address: String!) {
  accounts(where: { address: $address }) {
    items {
      chainId
      totalVestingAmount
      totalClaimedAmount
      totalReleasedAmount
      vestingWalletCount
    }
  }
}
```

---

## Implementation Checklist

- [ ] Update `ponder.schema.ts` with the schema above
- [ ] Update `ponder.config.ts` with multichain network config
- [ ] Import contract ABIs from `../contracts/abi/`
- [ ] Implement event handlers in `src/index.ts`
- [ ] Add ERC20 metadata fetching for token symbol/name/decimals
- [ ] Test with local Anvil deployment
- [ ] Test with mainnet forking
- [ ] Add API key env vars for each chain
- [ ] Deploy and verify indexing

---

## Environment Variables

```bash
# .env.local
PONDER_RPC_URL_1=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY      # Mainnet
PONDER_RPC_URL_42161=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY  # Arbitrum
PONDER_RPC_URL_8453=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY  # Base
PONDER_RPC_URL_10=https://opt-mainnet.g.alchemy.com/v2/YOUR_KEY     # Optimism
```

---

## Notes

1. **Factory pattern for dynamic contracts**: Ponder's factory feature automatically discovers and indexes contracts created by other contracts. This is crucial for the deployer → vesting wallet relationship.

2. **Denormalization strategy**: We copy vesting schedule data to VestingWallet entities to enable efficient queries without joins. This is a trade-off: slightly more storage for much faster queries.

3. **Composite IDs**: All IDs are prefixed with chainId to ensure uniqueness across chains. Format: `{chainId}_{address}` or `{chainId}_{txHash}_{logIndex}`.

4. **Index strategy**: Indexes are added for fields commonly used in WHERE clauses and JOINs. The chainId index appears on every table to support chain-filtered queries.

5. **Aggregate updates**: We maintain running totals (totalClaimed, totalReleased, etc.) to avoid expensive COUNT/SUM aggregations at query time.
