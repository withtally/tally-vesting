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

    // Platform fee configuration
    platformFeeRecipient: t.hex().notNull(),
    platformFeeBps: t.integer().notNull(),

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

    // Platform fee configuration (copied from deployer)
    platformFeeRecipient: t.hex().notNull(),
    platformFeeBps: t.integer().notNull(),

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
    feeAmount: t.bigint().notNull(),
    feeRecipient: t.hex().notNull(),

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
