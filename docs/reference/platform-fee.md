# Platform Fee Reference

This note documents how the optional platform fee interacts across the contracts, indexer, and backend tooling.

## Purpose

Sometimes a distributor wants to deduct a small fee whenever beneficiaries release tokens. Rather than modify the battle-tested `VestingWalletCliff`, we wrap it so the original security assumptions remain intact and the fee logic only affects release handling.

## Smart Contract Flow

1. `MerkleVestingFactory.deploy` now accepts `platformFeeRecipient` and `platformFeeBps`. Pass `address(0)` and `0` to disable the fee.
2. `MerkleVestingDeployer` stores the fee configuration and, on every claim, deploys `VestingWalletFeeWrapper` via CREATE2.
3. `VestingWalletFeeWrapper` owns the real `VestingWalletCliffConcrete` and proxies all queries. When `release()` or `release(token)` is called:
   - It calls the wrapped wallet to unlock the tokens.
   - It computes `fee = totalReleased * platformFeeBps / 10_000`.
   - The fee is forwarded to `platformFeeRecipient` and the remainder goes to the beneficiary.
   - `ERC20Released`/`EtherReleased` fire with the original amount, actual fee, and fee recipient.

## Indexer/Data Model

- `deployer` table now stores `platformFeeRecipient` / `platformFeeBps`.
- `vesting_wallet` rows copy those fields so each wallet carries the fee context.
- `release` rows record `feeAmount` and `feeRecipient` alongside the `amount`.
- `Ponder`'s `VestingClaimed` listener discovers wrapper addresses that embed the fee (the ABI has been updated accordingly).

Re-run `pnpm indexer:dev` after redeploying so the new schema picks up the fields.

## Backend API

The Merkle server now:

1. Accepts `platformFee` in tree builds and canonicalizes it into the input hash so downstream proofs remain deterministic.
2. Includes the fee metadata in:
   - The serialized tree (`originalInput.platformFee`).
   - Proof packages (`platformFee` property for single and batch packages).
   - IPFS serialization / content hash (so cached artifacts encode the fee).
3. Validates fee data (BPS between `0` and `10_000`, recipient required when `feeBps > 0`).

## Seed Fixture

`SeedWithFee.s.sol` deploys the canonical factory and a fee-enabled vesting campaign (platform fee BPS = 250) before running several claims/releases so the Ponder indexer and backend can see non-zero `feeAmount`/`feeRecipient` data. Since the script relies on Foundry's cheat codes to write code and balances, running it against the long-lived Anvil used by the indexer requires a few additional steps:

1. Start Anvil (e.g. `tmux new-session -d -s tally-anvil 'cd /Users/.../tally-vesting && pnpm anvil'`) so it keeps running in the background.
2. Patch the canonical CREATE2 deployer and factory codes into that node:

   ```bash
   # canonical deployer bytecode (same string used in SeedWithFee.s.sol)
   cast rpc anvil_setCode 0x4e59b44847b379578588920cA78FbF26c0B4956C 0x07ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3

   # factory runtime bytecode can be pulled from the compiled artifact
   CODE=$(cd packages/contracts && forge inspect MerkleVestingFactory deployedBytecode)
   cast rpc anvil_setCode 0x6B51bD91c3FF15e34C56D62F7c77892DE7bA3786 "$CODE"
   ```

3. Top up every account used by the script (`0xf39F...` plus `vm.addr(1..6)`) because `vm.deal` can't modify a remote node:

   ```bash
   for addr in \
     0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
     0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf \
     0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF \
     0x6813Eb9362372EEF6200f3b1dbC3f819671cBA69 \
     0x1efF47bc3a10a45D4B230B5d10E37751FE6AA718 \
     0xe1AB8145F7E55DC933d51a18c793F901A3A0b276 \
     0xE57bFE9F44b819898F47BF37E5AF72a0783e1141; do
     cast rpc anvil_setBalance "$addr" 0x8ac7230489e80000
   done
   ```

4. Run the seeding script:

   ```bash
   pnpm seed:fee
   ```

   It prints JSON including the `platformFeeRecipient`/`platformFeeBps` values that the backend carries through proof packages.

5. Clear the indexer's state and restart it so it can pick up the new events:

   ```bash
   rm -rf packages/indexer/.ponder
   tmux new-session -d -s tally-indexer 'cd /Users/.../tally-vesting && pnpm indexer:dev'
   ```

6. Gate the GraphQL server (it picks the first open port, typically 42079–42082) and run a quick query to prove the factory row exists:

   ```bash
   curl -s -X POST http://localhost:42080 \
     -H 'Content-Type: application/json' \
     -d '{"query":"{ factorys { items { id address deployerCount totalValueLocked } } }"}'
   ```

   The response should include the deterministic factory (e.g., `31337_0x6b51...`) and `deployerCount: 1`. If you need a richer view, query `releases` to confirm `feeAmount`/`feeRecipient` are being stored.

7. Once the indexer has processed the events, the `progress` table reports releases (e.g., `VestingWallet:ERC20Released` entries with fee metadata) and the GraphQL schema exposes those fields for dashboards and proofs.
