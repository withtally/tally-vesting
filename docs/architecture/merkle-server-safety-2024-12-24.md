---
title: Merkle Server Safety Features Architecture
category: architecture
date: 2024-12-24
status: active
authors: Dennison Bertram <dennison@tally.xyz>
---

# Merkle Server Safety Features Architecture

## Overview

The merkle-server package provides a comprehensive REST API for managing merkle trees used in token vesting distributions. This document describes the 4 safety features implemented to prevent loss of user funds if merkle tree data is lost.

## Context

When distributing tokens via merkle tree vesting:
- Users need merkle proofs to claim their allocations
- If the server loses the tree data, users cannot generate proofs
- The `sweep()` function can recover unclaimed tokens after deadline, but individual allocations are lost

These safety features ensure users can always recover their proofs through multiple redundant mechanisms.

## The 4 Safety Features

| Feature | Purpose | Recovery Path |
|---------|---------|---------------|
| BuildSpec + Canonicalization | Algorithm versioning & determinism | Ensures same input always produces same tree |
| Deterministic Rebuild | Rebuild from allocations | Anyone with original CSV can rebuild exact tree |
| Multiple Storage Backends | Replication across systems | Redundant storage with automatic fallback |
| User-Downloadable Proofs | Self-custody proof packages | Users hold their own proof data |
| IPFS + Registry | Content-addressed backup | On-chain CID lookup for disaster recovery |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          MERKLE SERVER                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │ Canonicalize │───▶│  BuildTree   │───▶│    Store     │          │
│  │  + BuildSpec │    │              │    │              │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│         │                   │                   │                   │
│         ▼                   ▼                   ▼                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │  inputHash   │    │ root + proofs│    │  Replicated  │          │
│  │  computed    │    │  generated   │    │   Storage    │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│                                                 │                   │
│         ┌───────────────────┬───────────────────┤                   │
│         ▼                   ▼                   ▼                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │  Filesystem  │    │    IPFS      │    │     S3       │          │
│  │   Backend    │    │   Backend    │    │   Backend    │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

                    RECOVERY PATHS

┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  Path 1: Rebuild from Allocations                                   │
│  ────────────────────────────────                                   │
│  Original CSV ──▶ POST /trees/rebuild-from-input ──▶ Exact Tree     │
│                                                                      │
│  Path 2: User Self-Custody                                          │
│  ────────────────────────────                                       │
│  User downloads proof package ──▶ Uses offline ──▶ Claims on-chain  │
│                                                                      │
│  Path 3: IPFS Recovery                                              │
│  ──────────────────────                                             │
│  On-chain CID lookup ──▶ IPFS download ──▶ Full tree restored       │
│                                                                      │
│  Path 4: Replica Fallback                                           │
│  ────────────────────────                                           │
│  Primary fails ──▶ Query replicas ──▶ Tree retrieved                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### BuildSpec + Canonicalization

**Purpose**: Ensure deterministic tree building across implementations and time.

**Key Files**:
- `src/services/canonicalize.ts`
- `src/types/index.ts` (BuildSpec type)

**How It Works**:
1. Addresses are normalized to lowercase
2. Amounts have leading zeros removed
3. Allocations are sorted by beneficiary ascending
4. Duplicate beneficiaries are rejected
5. `inputHash` computed via `keccak256(canonicalData)`
6. `buildSpec` embedded in every tree

```typescript
const BUILD_SPEC: BuildSpec = {
  version: '1.0.0',
  leafEncoding: 'abi.encodePacked(address,uint256)',
  hashFunction: 'keccak256',
  sortPairs: true,
  sortAllocations: 'beneficiary-asc',
  duplicateHandling: 'reject',
  paddingStrategy: 'duplicate-last',
};
```

### Deterministic Rebuild

**Purpose**: Recreate exact tree from original allocation data.

**Key Files**:
- `src/services/rebuild.ts`

**API Endpoints**:
- `POST /trees/:id/rebuild` - Rebuild and verify against stored tree
- `POST /trees/rebuild-from-input` - Rebuild from provided allocations
- `GET /trees/:id/input` - Get original allocations

**Verification**:
```typescript
function verifyRebuild(original: MerkleTree, rebuilt: MerkleTree): boolean {
  return original.root === rebuilt.root &&
         original.inputHash === rebuilt.inputHash;
}
```

### Multiple Storage Backends

**Purpose**: Redundant storage with automatic failover.

**Key Files**:
- `src/services/storage/filesystem.ts`
- `src/services/storage/memory.ts`
- `src/services/storage/replicated.ts`

**Interface**:
```typescript
interface StorageBackend {
  name: string;
  save(tree: MerkleTree): Promise<void>;
  get(id: string): Promise<MerkleTree | null>;
  delete(id: string): Promise<boolean>;
  list(): Promise<MerkleTreeSummary[]>;
  health(): Promise<{ healthy: boolean; error?: string }>;
}
```

**Replication Policy**:
- `PRIMARY_REQUIRED`: Primary write must succeed, replicas are best-effort
- Read fallback: Try primary first, then each replica
- `reconcile()`: Sync missing data across all backends

### User-Downloadable Proofs

**Purpose**: Allow users to self-custody their proof data.

**Key Files**:
- `src/services/proofPackage.ts`

**API Endpoints**:
- `GET /trees/:id/download/:address` - Individual proof package
- `GET /trees/:id/download` - Batch package (all beneficiaries)
- `POST /verify-package` - Verify uploaded package

**ProofPackage Structure**:
```typescript
interface ProofPackage {
  version: '1.0';
  generatedAt: string;
  treeId: string;
  merkleRoot: Hex;
  beneficiary: Hex;
  amount: string;
  leaf: Hex;
  proof: Hex[];
  vesting?: VestingParams;
  contract?: { chainId: number; deployerAddress: Hex; token?: Hex };
  buildSpec: BuildSpec;
}
```

### IPFS + On-chain Registry

**Purpose**: Content-addressed backup with on-chain discovery.

**Key Files**:
- `src/services/ipfs.ts`
- `src/services/registry.ts`

**API Endpoints**:
- `POST /trees/:id/backup` - Prepare IPFS backup
- `GET /trees/:id/recovery` - Check recovery status
- `POST /trees/recover` - Recover from input or CID

**Registry Key Format**:
```
{chainId}:{distributorAddress}:{merkleRoot}
```

## Security Considerations

1. **Path Traversal Protection**: Tree IDs validated against `^[a-zA-Z0-9-]+$`
2. **DoS Limits**: Max 10,000 allocations, 78-digit amounts
3. **Schema Validation**: Strict Zod validation for IPFS deserialization
4. **Hex Concatenation**: Safe `concatHex` from viem for inputHash

## Data Flow

### Tree Creation
1. Receive allocations via `POST /trees`
2. Canonicalize: normalize addresses, sort, reject duplicates
3. Compute inputHash from canonical data
4. Build merkle tree with proofs
5. Store with buildSpec, originalInput, inputHash
6. Replicate to all backends

### Proof Download
1. Request `GET /trees/:id/download/:address`
2. Lookup tree and find allocation
3. Generate ProofPackage with all metadata
4. Return as downloadable JSON

### Recovery
1. Attempt local storage lookup
2. If missing, try replica backends
3. If all local fails, use IPFS CID from registry
4. As last resort, rebuild from original allocations

## Related Documents

- [ADR-001: Merkle-based Vesting](../decisions/adr-001-merkle-vesting-2025-12-23.md)
- [System Overview](./system-overview-2025-12-23.md)
- [Development Setup Guide](../guides/development-setup-2025-12-23.md)

## Attribution

Designed and implemented by **Dennison Bertram** <dennison@tally.xyz> for [Tally](https://tally.xyz).
