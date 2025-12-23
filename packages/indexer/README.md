# Tally Vesting Indexer

A Ponder-based indexer for tracking ERC20 token events.

## What was created

This indexer uses the ERC20 template and includes:

- **Schema** (`ponder.schema.ts`):
  - `account` table: Tracks account balances and transfer counts
  - `transferEvent` table: Records all transfer events with timestamps and block numbers

- **Event handlers** (`src/index.ts`):
  - Indexes ERC20 Transfer events
  - Updates account balances
  - Records transfer history

- **Generated files**:
  - `generated/schema.graphql`: GraphQL schema for querying indexed data
  - `ponder-env.d.ts`: TypeScript type definitions

## Getting Started

### 1. Configure RPC endpoint

Copy the example env file and add your RPC URL:

```bash
cp .env.example .env
# Edit .env and add your RPC URL
```

### 2. Update the contract configuration

Edit `ponder.config.ts` to specify:
- The ERC20 contract address you want to index
- The network and chain ID
- The start block (optional, for faster sync)

### 3. Run the indexer

Development mode (with hot reload):
```bash
pnpm dev
```

Production mode:
```bash
pnpm start
```

Serve mode (query existing data):
```bash
pnpm serve
```

### 4. Query the data

Once running, the GraphQL API is available at `http://localhost:42069`

Example queries:

```graphql
# Get account balance
query {
  account(address: "0x...") {
    address
    balance
    transferCount
  }
}

# Get recent transfers
query {
  transferEvents(orderBy: "timestamp", orderDirection: "desc", limit: 10) {
    items {
      id
      from
      to
      value
      timestamp
      blockNumber
    }
  }
}
```

## Project Structure

```
indexer/
├── src/
│   └── index.ts          # Event handlers
├── generated/
│   └── schema.graphql    # Generated GraphQL schema
├── ponder.config.ts      # Network and contract configuration
├── ponder.schema.ts      # Database schema definition
├── ponder-env.d.ts       # TypeScript definitions (auto-generated)
└── package.json          # Dependencies and scripts
```

## Next Steps

To adapt this indexer for the Tally Vesting system:

1. Update `ponder.config.ts` to include:
   - `MerkleVestingFactory` contract
   - `VestingWalletCliff` contracts (may need factory pattern)

2. Update `ponder.schema.ts` to track:
   - Vesting deployments
   - Claims
   - Releases
   - Vesting schedules

3. Update `src/index.ts` to handle:
   - `VestingDeployed` events
   - `Claimed` events
   - `Released` events from VestingWallet contracts

## Resources

- [Ponder Documentation](https://ponder.sh)
- [Ponder ERC20 Example](https://github.com/ponder-sh/ponder/tree/main/examples/erc20)
