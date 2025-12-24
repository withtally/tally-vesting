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

`SeedWithFee.s.sol` deploys a deterministic factory + deployer with `platformFeeBps = 250` and claims for multiple beneficiaries to exercise the wrapper end-to-end. Run it with:

```bash
./packages/contracts/script/seed-fee.sh
```

or via the workspace alias:

```bash
pnpm seed:fee
```

Check `packages/contracts/seed-output/` for the printed JSON that includes the fee metadata and guarantees the indexer can see a non-zero fee campaign.
