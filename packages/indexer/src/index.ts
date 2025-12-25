import { ponder } from "ponder:registry";
import type { Hex } from "viem";
import { factory, token, deployer, account, vestingWallet, claim, release } from "ponder:schema";

// Import ABIs
import MerkleVestingDeployerAbi from "../abis/MerkleVestingDeployer.json" assert { type: "json" };

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Create a composite ID from chain ID and parts
 */
const createId = (chainId: number, ...parts: string[]): string => {
  return `${chainId}_${parts.join("_")}`;
};

/**
 * Safely fetch ERC20 token metadata
 * Returns partial metadata if some calls fail
 */
const fetchTokenMetadata = async (
  tokenAddress: Hex,
  client: any
): Promise<{
  symbol: string | null;
  name: string | null;
  decimals: number | null;
}> => {
  // Minimal ERC20 ABI for metadata
  const erc20Abi = [
    {
      type: "function",
      name: "symbol",
      inputs: [],
      outputs: [{ name: "", type: "string" }],
      stateMutability: "view",
    },
    {
      type: "function",
      name: "name",
      inputs: [],
      outputs: [{ name: "", type: "string" }],
      stateMutability: "view",
    },
    {
      type: "function",
      name: "decimals",
      inputs: [],
      outputs: [{ name: "", type: "uint8" }],
      stateMutability: "view",
    },
  ] as const;

  let symbol: string | null = null;
  let name: string | null = null;
  let decimals: number | null = null;

  try {
    symbol = await client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "symbol",
    });
  } catch (error) {
    console.warn(`Failed to fetch symbol for ${tokenAddress}:`, error);
  }

  try {
    name = await client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "name",
    });
  } catch (error) {
    console.warn(`Failed to fetch name for ${tokenAddress}:`, error);
  }

  try {
    decimals = await client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    });
  } catch (error) {
    console.warn(`Failed to fetch decimals for ${tokenAddress}:`, error);
  }

  return { symbol, name, decimals };
};

// ============================================================
// EVENT HANDLERS
// ============================================================

/**
 * Handler for MerkleVestingFactory:DeployerCreated
 *
 * Event signature:
 * event DeployerCreated(
 *   address indexed deployer,
 *   address indexed token,
 *   bytes32 indexed merkleRoot,
 *   address creator
 * )
 *
 * Creates:
 * - Factory entity (upsert)
 * - Token entity (upsert)
 * - Deployer entity (create)
 *
 * Note: Vesting params are NOT in the event, must read from deployer contract
 */
ponder.on("MerkleVestingFactory:DeployerCreated", async ({ event, context }) => {
  const { deployer: deployerAddress, token: tokenAddress, merkleRoot } = event.args;
  const { db, client, network } = context;

  const chainId = network.chainId;
  const factoryAddress = event.log.address;
  const timestamp = Number(event.block.timestamp);
  const blockNumber = event.block.number;
  const txHash = event.transaction.hash;

  // ============================================================
  // 1. Upsert Factory
  // ============================================================
  const factoryId = createId(chainId, factoryAddress.toLowerCase());

  // First, try to find existing factory
  const existingFactory = await db.find(factory, { id: factoryId });

  if (existingFactory) {
    // Update existing factory
    await db
      .update(factory, { id: factoryId })
      .set({
        deployerCount: existingFactory.deployerCount + 1,
      });
  } else {
    // Insert new factory
    await db.insert(factory).values({
      id: factoryId,
      chainId,
      address: factoryAddress,
      deployerCount: 1,
      totalValueLocked: 0n,
      createdAt: timestamp,
      createdAtBlock: blockNumber,
    });
  }

  // ============================================================
  // 2. Fetch token metadata and upsert Token
  // ============================================================
  const tokenId = createId(chainId, tokenAddress.toLowerCase());
  const tokenMetadata = await fetchTokenMetadata(tokenAddress, client);

  // Check if token exists
  const existingToken = await db.find(token, { id: tokenId });

  if (existingToken) {
    // Update existing token
    await db
      .update(token, { id: tokenId })
      .set({
        deployerCount: existingToken.deployerCount + 1,
        // Don't overwrite metadata if already set
        symbol: existingToken.symbol ?? tokenMetadata.symbol,
        name: existingToken.name ?? tokenMetadata.name,
        decimals: existingToken.decimals ?? tokenMetadata.decimals,
      });
  } else {
    // Insert new token
    await db.insert(token).values({
      id: tokenId,
      chainId,
      address: tokenAddress,
      symbol: tokenMetadata.symbol,
      name: tokenMetadata.name,
      decimals: tokenMetadata.decimals,
      totalVestingAmount: 0n,
      totalClaimedAmount: 0n,
      totalReleasedAmount: 0n,
      deployerCount: 1,
    });
  }

  // ============================================================
  // 3. Read vesting parameters from deployer contract
  // ============================================================
  const [vestingStart, vestingDuration, cliffDuration, claimDeadline, platformFeeRecipient, platformFeeBps] =
    await Promise.all([
      client.readContract({
        address: deployerAddress,
        abi: MerkleVestingDeployerAbi,
        functionName: "vestingStart",
      }),
      client.readContract({
        address: deployerAddress,
        abi: MerkleVestingDeployerAbi,
        functionName: "vestingDuration",
      }),
      client.readContract({
        address: deployerAddress,
        abi: MerkleVestingDeployerAbi,
        functionName: "cliffDuration",
      }),
      client.readContract({
        address: deployerAddress,
        abi: MerkleVestingDeployerAbi,
        functionName: "claimDeadline",
      }),
      client.readContract({
        address: deployerAddress,
        abi: MerkleVestingDeployerAbi,
        functionName: "platformFeeRecipient",
      }),
      client.readContract({
        address: deployerAddress,
        abi: MerkleVestingDeployerAbi,
        functionName: "platformFeeBps",
      }),
    ]);

  // Compute derived fields
  const vestingEnd = BigInt(vestingStart) + BigInt(vestingDuration);
  const cliffEnd = BigInt(vestingStart) + BigInt(cliffDuration);

  // ============================================================
  // 4. Create Deployer entity
  // ============================================================
  const deployerId = createId(chainId, deployerAddress.toLowerCase());

  // Note: We don't know totalAllocation yet - it's not in the event or contract
  // Will need to track this via VestingClaimed events
  const totalAllocation = 0n; // Will be incremented as claims happen

  await db.insert(deployer).values({
    id: deployerId,
    chainId,
    address: deployerAddress,
    factoryId,
    tokenAddress,
    tokenId,
    merkleRoot,
    vestingStart: BigInt(vestingStart),
    vestingDuration: BigInt(vestingDuration),
    cliffDuration: BigInt(cliffDuration),
    claimDeadline: BigInt(claimDeadline),
    platformFeeRecipient,
    platformFeeBps: Number(platformFeeBps),
    totalAllocation,
    totalClaimed: 0n,
    claimCount: 0,
    vestingEnd,
    cliffEnd,
    createdAt: timestamp,
    createdAtBlock: blockNumber,
    createdTxHash: txHash,
  });
});

/**
 * Handler for MerkleVestingDeployer:VestingClaimed
 *
 * Event signature:
 * event VestingClaimed(
 *   address indexed beneficiary,
 *   address indexed wallet,
 *   uint256 amount
 * )
 *
 * Creates:
 * - Account entity (upsert)
 * - VestingWallet entity (create)
 * - Claim entity (create)
 *
 * Updates:
 * - Deployer stats (totalClaimed, totalAllocation, claimCount)
 * - Token stats (totalClaimedAmount, totalVestingAmount)
 */
ponder.on("MerkleVestingDeployer:VestingClaimed", async ({ event, context }) => {
  const { beneficiary, wallet: vestingWalletAddress, amount } = event.args;
  const { db, network } = context;

  const chainId = network.chainId;
  const deployerAddress = event.log.address;
  const timestamp = Number(event.block.timestamp);
  const blockNumber = event.block.number;
  const txHash = event.transaction.hash;
  const logIndex = event.log.logIndex;

  // ============================================================
  // 1. Get deployer entity to access vesting schedule and token
  // ============================================================
  const deployerId = createId(chainId, deployerAddress.toLowerCase());
  const deployerEntity = await db.find(deployer, { id: deployerId });

  if (!deployerEntity) {
    throw new Error(
      `Deployer ${deployerId} not found for VestingClaimed event at ${txHash}`
    );
  }

  const tokenId = deployerEntity.tokenId;
  const tokenAddress = deployerEntity.tokenAddress;

  // ============================================================
  // 2. Upsert Account (beneficiary)
  // ============================================================
  const accountId = createId(chainId, beneficiary.toLowerCase());

  // Check if account exists
  const existingAccount = await db.find(account, { id: accountId });

  if (existingAccount) {
    // Update existing account
    await db
      .update(account, { id: accountId })
      .set({
        totalVestingAmount: existingAccount.totalVestingAmount + amount,
        totalClaimedAmount: existingAccount.totalClaimedAmount + amount,
        vestingWalletCount: existingAccount.vestingWalletCount + 1,
        claimCount: existingAccount.claimCount + 1,
      });
  } else {
    // Insert new account
    await db.insert(account).values({
      id: accountId,
      chainId,
      address: beneficiary,
      totalVestingAmount: amount,
      totalClaimedAmount: amount,
      totalReleasedAmount: 0n,
      vestingWalletCount: 1,
      claimCount: 1,
      releaseCount: 0,
      firstSeenAt: timestamp,
      firstSeenBlock: blockNumber,
    });
  }

  // ============================================================
  // 3. Create VestingWallet entity
  // ============================================================
  const vestingWalletId = createId(chainId, vestingWalletAddress.toLowerCase());

  await db.insert(vestingWallet).values({
    id: vestingWalletId,
    chainId,
    address: vestingWalletAddress,
    deployerId,
    beneficiaryId: accountId,
    beneficiaryAddress: beneficiary,
    tokenAddress,
    tokenId,
    totalVested: amount,
    totalReleased: 0n,
    releaseCount: 0,
    vestingStart: deployerEntity.vestingStart,
    vestingEnd: deployerEntity.vestingEnd,
    cliffEnd: deployerEntity.cliffEnd,
    platformFeeRecipient: deployerEntity.platformFeeRecipient,
    platformFeeBps: deployerEntity.platformFeeBps,
    createdAt: timestamp,
    createdAtBlock: blockNumber,
  });

  // ============================================================
  // 4. Create Claim entity
  // ============================================================
  const claimId = createId(chainId, txHash, logIndex.toString());

  await db.insert(claim).values({
    id: claimId,
    chainId,
    deployerId,
    vestingWalletId,
    beneficiaryId: accountId,
    beneficiaryAddress: beneficiary,
    vestingWalletAddress,
    amount,
    claimedAt: timestamp,
    blockNumber,
    txHash,
    logIndex,
  });

  // ============================================================
  // 5. Update Deployer stats
  // ============================================================
  await db
    .update(deployer, { id: deployerId })
    .set((row) => ({
      totalClaimed: row.totalClaimed + amount,
      totalAllocation: row.totalAllocation + amount,
      claimCount: row.claimCount + 1,
    }));

  // ============================================================
  // 6. Update Token stats
  // ============================================================
  await db
    .update(token, { id: tokenId })
    .set((row) => ({
      totalClaimedAmount: row.totalClaimedAmount + amount,
      totalVestingAmount: row.totalVestingAmount + amount,
    }));
});

/**
 * Handler for VestingWallet:ERC20Released
 *
 * Event signature:
 * event ERC20Released(
 *   address indexed token,
 *   uint256 amount,
 *   uint256 platformFeeAmount,
 *   address indexed platformFeeRecipient,
 *   uint256 frontEndFeeAmount,
 *   address indexed frontEndFeeRecipient
 * )
 *
 * Creates:
 * - Release entity (create)
 *
 * Updates:
 * - VestingWallet stats (totalReleased, releaseCount)
 * - Account stats (totalReleasedAmount, releaseCount)
 * - Token stats (totalReleasedAmount)
 */
ponder.on("VestingWallet:ERC20Released", async ({ event, context }) => {
  const {
    token: tokenAddress,
    amount,
    platformFeeAmount,
    platformFeeRecipient,
    frontEndFeeAmount,
    frontEndFeeRecipient,
  } = event.args;
  const { db, network } = context;

  const chainId = network.chainId;
  const vestingWalletAddress = event.log.address;
  const timestamp = Number(event.block.timestamp);
  const blockNumber = event.block.number;
  const txHash = event.transaction.hash;
  const logIndex = event.log.logIndex;

  // ============================================================
  // 1. Get VestingWallet entity to access beneficiary and token
  // ============================================================
  const vestingWalletId = createId(chainId, vestingWalletAddress.toLowerCase());
  const vestingWalletEntity = await db.find(vestingWallet, {
    id: vestingWalletId,
  });

  if (!vestingWalletEntity) {
    throw new Error(
      `VestingWallet ${vestingWalletId} not found for ERC20Released event at ${txHash}`
    );
  }

  const beneficiaryId = vestingWalletEntity.beneficiaryId;
  const tokenId = createId(chainId, tokenAddress.toLowerCase());

  // ============================================================
  // 2. Create Release entity
  // ============================================================
  const releaseId = createId(chainId, txHash, logIndex.toString());

  await db.insert(release).values({
    id: releaseId,
    chainId,
    vestingWalletId,
    tokenId,
    beneficiaryId,
    tokenAddress,
    amount,
    platformFeeAmount,
    platformFeeRecipient,
    frontEndFeeAmount,
    frontEndFeeRecipient,
    releasedAt: timestamp,
    blockNumber,
    txHash,
    logIndex,
  });

  // ============================================================
  // 3. Update VestingWallet stats
  // ============================================================
  await db
    .update(vestingWallet, { id: vestingWalletId })
    .set((row) => ({
      totalReleased: row.totalReleased + amount,
      releaseCount: row.releaseCount + 1,
    }));

  // ============================================================
  // 4. Update Account stats
  // ============================================================
  await db
    .update(account, { id: beneficiaryId })
    .set((row) => ({
      totalReleasedAmount:
        row.totalReleasedAmount + (amount - platformFeeAmount - frontEndFeeAmount),
      releaseCount: row.releaseCount + 1,
    }));

  // ============================================================
  // 5. Update Token stats
  // ============================================================
  await db
    .update(token, { id: tokenId })
    .set((row) => ({
      totalReleasedAmount: row.totalReleasedAmount + amount,
    }));
});
