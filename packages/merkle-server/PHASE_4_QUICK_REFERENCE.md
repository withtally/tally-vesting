# Phase 4: Quick Reference

## New API Endpoints

### Backup Tree
```bash
POST /trees/:id/backup
```
Returns: `{ treeId, contentHash, size, message }`

### Check Recovery Status
```bash
GET /trees/:id/recovery
```
Returns: `{ source, available, root?, inputHash? }`

### Recover Tree
```bash
POST /trees/recover
Body: { input: { allocations, token?, vesting? } }
```
Returns: `{ source, tree }`

## New Services

### IPFS Service (`src/services/ipfs.ts`)
```typescript
import { serializeTreeForIpfs, deserializeTreeFromIpfs, computeContentHash } from './services/ipfs';

// Serialize tree to JSON
const json = serializeTreeForIpfs(tree);

// Deserialize from JSON
const tree = deserializeTreeFromIpfs(json);

// Compute content hash
const hash = computeContentHash(tree);
```

### Registry Service (`src/services/registry.ts`)
```typescript
import { createRegistryKey, parseRegistryKey } from './services/registry';

// Create registry key
const key = createRegistryKey({
  chainId: 1,
  distributorAddress: '0x...',
  merkleRoot: '0x...'
});
// Returns: "1:0x...:0x..."

// Parse registry key
const { chainId, distributorAddress, merkleRoot } = parseRegistryKey(key);
```

## Key Functions

### Serialization
- `serializeTreeForIpfs(tree)` → Deterministic JSON string
- `deserializeTreeFromIpfs(json)` → Validated MerkleTree
- `computeContentHash(tree)` → Keccak256 hash

### IPFS Client (Interface)
- `uploadTreeToIpfs(tree, client)` → `{ cid, contentHash }`
- `downloadTreeFromIpfs(cid, client)` → MerkleTree
- `verifyIpfsData(cid, expectedRoot, client)` → boolean

### Registry Keys
- `createRegistryKey(key)` → "chainId:distributor:root"
- `parseRegistryKey(string)` → `{ chainId, distributorAddress, merkleRoot }`

## Test Coverage

- **IPFS:** 17 tests
- **Registry:** 13 tests
- **Routes:** 8 tests
- **Total:** 227 tests (38 new)

## Common Use Cases

### 1. Backup Before Deployment
```bash
# Create tree
TREE_ID=$(curl -X POST .../trees -d '...' | jq -r '.id')

# Prepare backup
curl -X POST .../trees/$TREE_ID/backup
```

### 2. Verify Recovery Available
```bash
# Check status
curl .../trees/$TREE_ID/recovery
```

### 3. Disaster Recovery
```bash
# Rebuild from saved allocations
curl -X POST .../trees/recover \
  -d '{"input": {"allocations": [...]}}'
```

## Type Definitions

### IpfsBackupResult
```typescript
{
  cid: string;
  contentHash: Hex;
  registryTxHash?: Hex;
}
```

### RecoveryResult
```typescript
{
  success: boolean;
  source: 'local' | 'ipfs' | 'registry';
  tree: MerkleTree;
}
```

### RegistryKey
```typescript
{
  chainId: number;
  distributorAddress: Hex;
  merkleRoot: Hex;
}
```

## Environment Variables

### IPFS (Future)
```bash
IPFS_API_URL=http://127.0.0.1:5001
```

### Registry (Future)
```bash
REGISTRY_CONTRACT_ADDRESS=0x...
REGISTRY_RPC_URL=https://eth-mainnet.g.alchemy.com/...
```

## Status

- ✅ Serialization/Deserialization
- ✅ Content Hashing
- ✅ Registry Key Management
- ✅ Recovery from Input
- ⏳ IPFS Upload/Download (requires IPFS node)
- ⏳ On-Chain Registry (requires contract deployment)

## Files Modified

### New Files
- `src/services/ipfs.ts`
- `src/services/registry.ts`
- `test/ipfs.test.ts`
- `test/registry.test.ts`

### Modified Files
- `src/types/index.ts` (added 2 types)
- `src/routes/trees.ts` (added 3 endpoints)
- `test/routes.test.ts` (added 8 tests)

## Next Steps

1. Deploy IPFS node
2. Deploy registry contract
3. Implement IPFS client
4. Implement RegistryClient
5. Add EIP-712 signatures
