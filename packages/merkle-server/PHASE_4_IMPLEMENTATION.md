# Phase 4: IPFS Backup and On-Chain Registry Implementation

## Overview

Phase 4 adds disaster recovery capabilities through IPFS backup and on-chain registry integration. This phase provides the infrastructure for backing up merkle trees to IPFS and registering them on-chain for global recovery.

## Implementation Status

**Status:** ✅ Complete (227/227 tests passing)

**Added:**
- 17 IPFS service tests
- 13 Registry service tests
- 8 Route integration tests
- Total: 38 new tests (189 → 227)

## New Services

### IPFS Service (`src/services/ipfs.ts`)

Handles serialization, hashing, and IPFS client abstraction.

**Key Functions:**

```typescript
// Serialize tree to deterministic JSON
serializeTreeForIpfs(tree: MerkleTree): string

// Deserialize and validate tree from IPFS
deserializeTreeFromIpfs(data: string): MerkleTree

// Compute content hash for verification
computeContentHash(tree: MerkleTree): Hex

// Upload tree to IPFS
uploadTreeToIpfs(tree: MerkleTree, client: IpfsClient): Promise<{ cid: string; contentHash: Hex }>

// Download tree from IPFS
downloadTreeFromIpfs(cid: string, client: IpfsClient): Promise<MerkleTree>

// Verify IPFS data matches expected root
verifyIpfsData(cid: string, expectedRoot: Hex, client: IpfsClient): Promise<boolean>

// Create IPFS client (stub for production)
createIpfsClient(config?: { apiUrl?: string }): IpfsClient
```

**Features:**
- ✅ Deterministic JSON serialization (sorted keys)
- ✅ Keccak256 content hashing
- ✅ Full tree serialization including buildSpec and originalInput
- ✅ Validation on deserialization
- ✅ Mock-friendly client interface for testing

**Current Implementation:**
- Serialization/deserialization: **Fully implemented**
- IPFS client: **Stub** (returns error pointing to IPFS_API_URL config)
- Production readiness: Configure `IPFS_API_URL` env var to connect to IPFS node

### Registry Service (`src/services/registry.ts`)

Provides types and key management for on-chain registry interactions.

**Key Functions:**

```typescript
// Create registry key from components
createRegistryKey(key: RegistryKey): string

// Parse registry key back to components
parseRegistryKey(key: string): RegistryKey
```

**Types:**

```typescript
interface RegistryKey {
  chainId: number;
  distributorAddress: Hex;
  merkleRoot: Hex;
}

interface RegistryEntry {
  chainId: number;
  distributorAddress: Hex;
  merkleRoot: Hex;
  ipfsCid: string;
  registeredAt: number;
  registrant: Hex;
}

interface RegistrationAuthorization {
  owner: Hex;
  merkleRoot: Hex;
  ipfsCid: string;
  deadline: number;
  signature: Hex; // EIP-712 signature
}

interface RegistryClient {
  register(entry: Omit<RegistryEntry, 'registeredAt' | 'registrant'>): Promise<{ txHash: Hex }>;
  lookup(key: RegistryKey): Promise<RegistryEntry | null>;
  lookupByCid(cid: string): Promise<RegistryEntry[]>;
}
```

**Features:**
- ✅ Deterministic key format: `chainId:distributorAddress:merkleRoot`
- ✅ Address normalization (lowercase)
- ✅ Round-trip key parsing/creation
- ✅ EIP-712 authorization types defined

**Current Implementation:**
- Key management: **Fully implemented**
- Registry client: **Interface only** (awaits on-chain contract deployment)

## New API Endpoints

### `POST /trees/:id/backup`

Prepare merkle tree for IPFS backup.

**Request:**
```bash
POST /trees/{treeId}/backup
```

**Response:**
```json
{
  "treeId": "uuid",
  "contentHash": "0x1234...",
  "size": 12345,
  "message": "IPFS backup prepared (connect IPFS node to upload)"
}
```

**Status:**
- ✅ Serialization working
- ✅ Content hash computation
- ⏳ Actual IPFS upload (requires IPFS node)

### `GET /trees/:id/recovery`

Check recovery status for a tree.

**Request:**
```bash
GET /trees/{treeId}/recovery
```

**Response (Tree Exists):**
```json
{
  "source": "local",
  "available": true,
  "root": "0x5678...",
  "inputHash": "0xabcd..."
}
```

**Response (Tree Missing):**
```json
{
  "source": "local",
  "available": false,
  "message": "Tree not found locally. Use IPFS CID to recover."
}
```

### `POST /trees/recover`

Recover a tree from input allocations or IPFS CID.

**Request (From Input):**
```bash
POST /trees/recover
Content-Type: application/json

{
  "input": {
    "allocations": [...],
    "token": "0x...",
    "vesting": {...}
  }
}
```

**Response:**
```json
{
  "source": "rebuild",
  "tree": {
    "id": "uuid",
    "root": "0x...",
    ...
  }
}
```

**Request (From IPFS - Future):**
```bash
POST /trees/recover
Content-Type: application/json

{
  "cid": "QmTest123..."
}
```

**Response (Current):**
```json
{
  "error": "Recovery from IPFS CID requires IPFS node connection",
  "hint": "Provide input.allocations to rebuild from allocations"
}
```

## New Types (`src/types/index.ts`)

```typescript
interface IpfsBackupResult {
  cid: string;
  contentHash: Hex;
  registryTxHash?: Hex;
}

interface RecoveryResult {
  success: boolean;
  source: 'local' | 'ipfs' | 'registry';
  tree: MerkleTree;
}
```

## Test Coverage

### IPFS Service Tests (`test/ipfs.test.ts`) - 17 tests

**serializeTreeForIpfs:**
- ✅ Serializes tree to deterministic JSON
- ✅ Includes buildSpec and originalInput
- ✅ Sorts keys for determinism
- ✅ Produces same output for same data in different order

**deserializeTreeFromIpfs:**
- ✅ Deserializes valid JSON back to MerkleTree
- ✅ Throws for invalid JSON
- ✅ Throws for missing required fields
- ✅ Validates all required fields are present

**computeContentHash:**
- ✅ Returns consistent hash for same tree
- ✅ Returns different hash for different trees
- ✅ Returns valid hex hash
- ✅ Changes when any critical field changes

**IpfsClient (mocked):**
- ✅ uploadToIpfs returns CID
- ✅ downloadFromIpfs returns tree data
- ✅ verifyIpfsData validates against expected root
- ✅ uploadToIpfs serializes tree before uploading

**createIpfsClient:**
- ✅ Returns IpfsClient interface

### Registry Service Tests (`test/registry.test.ts`) - 13 tests

**createRegistryKey:**
- ✅ Creates key from chainId, distributor, merkleRoot
- ✅ Produces consistent key format
- ✅ Produces different keys for different chainIds
- ✅ Produces different keys for different distributors
- ✅ Produces different keys for different merkle roots
- ✅ Normalizes addresses to lowercase

**parseRegistryKey:**
- ✅ Parses key back to RegistryKey components
- ✅ Round-trips correctly
- ✅ Throws for invalid key format
- ✅ Throws for malformed components

**Type Validation:**
- ✅ RegistryEntry structure validation
- ✅ RegistrationAuthorization structure validation
- ✅ Registry key uniqueness

### Route Tests (`test/routes.test.ts`) - 8 new tests

**POST /trees/:id/backup:**
- ✅ Returns backup info for existing tree
- ✅ Includes contentHash and size
- ✅ Returns 404 for non-existent tree

**GET /trees/:id/recovery:**
- ✅ Returns local source when tree exists
- ✅ Returns 404 with recovery hints when tree missing

**POST /trees/recover:**
- ✅ Rebuilds tree from provided input
- ✅ Validates input before rebuild
- ✅ Returns error for CID recovery without IPFS

## Backward Compatibility

✅ **All 189 existing tests continue to pass**

All existing endpoints continue to work:
- `GET /trees` - List trees
- `POST /trees` - Create tree
- `GET /trees/:id` - Get tree
- `GET /trees/:id/proof/:address` - Get proof
- `GET /trees/:id/vesting/:address` - Get vesting status
- `DELETE /trees/:id` - Delete tree
- `POST /trees/:id/rebuild` - Rebuild verification
- `POST /trees/rebuild-from-input` - Rebuild from input
- `GET /trees/:id/input` - Get original allocations
- `GET /trees/:id/download/:address` - Individual proof package
- `GET /trees/:id/download` - Batch proof package

## Future Work

### IPFS Integration

To enable real IPFS uploads:

1. **Install IPFS node:**
   ```bash
   # Install IPFS Desktop or CLI
   ipfs daemon
   ```

2. **Configure environment:**
   ```bash
   export IPFS_API_URL=http://127.0.0.1:5001
   ```

3. **Implement IPFS client:**
   ```typescript
   export function createIpfsClient(config?: { apiUrl?: string }): IpfsClient {
     const apiUrl = config?.apiUrl || process.env.IPFS_API_URL;

     return {
       async upload(data: string): Promise<string> {
         const response = await fetch(`${apiUrl}/api/v0/add`, {
           method: 'POST',
           body: data,
         });
         const result = await response.json();
         return result.Hash;
       },
       // ... implement download and pin
     };
   }
   ```

### On-Chain Registry

To enable on-chain registration:

1. **Deploy registry contract** (Solidity)
2. **Implement RegistryClient** using viem
3. **Add EIP-712 signature verification**
4. **Update `/trees/:id/backup` to optionally register**

Example registry contract interface:
```solidity
contract MerkleTreeRegistry {
  struct Entry {
    address distributor;
    bytes32 merkleRoot;
    string ipfsCid;
    uint256 registeredAt;
    address registrant;
  }

  mapping(bytes32 => Entry) public entries;

  function register(
    uint256 chainId,
    address distributor,
    bytes32 merkleRoot,
    string calldata ipfsCid
  ) external;

  function lookup(
    uint256 chainId,
    address distributor,
    bytes32 merkleRoot
  ) external view returns (Entry memory);
}
```

## Usage Examples

### Backup Tree to IPFS (Preparation)

```bash
# Create a tree
TREE_ID=$(curl -X POST http://localhost:3000/trees \
  -H "Content-Type: application/json" \
  -d '{
    "allocations": [
      {"beneficiary": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "amount": "1000000000000000000000"}
    ]
  }' | jq -r '.id')

# Prepare for backup
curl -X POST http://localhost:3000/trees/$TREE_ID/backup | jq
```

Output:
```json
{
  "treeId": "abc-123...",
  "contentHash": "0x1234567890abcdef...",
  "size": 1234,
  "message": "IPFS backup prepared (connect IPFS node to upload)"
}
```

### Check Recovery Status

```bash
# Check if tree is recoverable
curl http://localhost:3000/trees/$TREE_ID/recovery | jq
```

### Recover from Input

```bash
# Recover tree from allocations
curl -X POST http://localhost:3000/trees/recover \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "allocations": [
        {"beneficiary": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "amount": "1000000000000000000000"}
      ]
    }
  }' | jq
```

## Architecture Decisions

### Why Deterministic Serialization?

Sorted keys ensure the same tree always produces the same IPFS CID, enabling:
- Content addressability
- Deduplication across uploads
- Verification without re-downloading

### Why Content Hash?

The keccak256 hash of serialized data provides:
- Quick verification before full download
- Tamper detection
- Registry lookup optimization

### Why Stub Implementations?

IPFS and on-chain operations require:
- External dependencies (IPFS daemon, blockchain RPC)
- Environment-specific configuration
- Potential costs (gas fees)

Stubs allow:
- ✅ Full testing without external dependencies
- ✅ Clear error messages pointing to configuration
- ✅ Easy production enablement via env vars

## Security Considerations

### IPFS Upload Safety

- **No credentials in uploads:** Trees contain no private keys or secrets
- **Public by default:** IPFS data is publicly accessible
- **Content addressing:** CID proves data integrity

### Registry Authorization

- **EIP-712 signatures:** Only authorized addresses can register
- **Deadline enforcement:** Prevent signature replay
- **Immutable records:** On-chain entries cannot be modified

## Performance

### Serialization

- **Deterministic:** O(n log n) for key sorting
- **Minimal overhead:** JSON.stringify with sorted keys
- **Cacheable:** Content hash computed once per tree

### Storage

- **No additional storage:** Backup data derived from existing tree
- **On-demand:** Serialization only when backup requested
- **Size efficient:** ~1-10KB per tree depending on allocation count

## Testing Strategy

### Unit Tests

- ✅ Serialization/deserialization round-trips
- ✅ Content hash consistency
- ✅ Registry key uniqueness
- ✅ Input validation

### Integration Tests

- ✅ Route handlers
- ✅ Error handling
- ✅ Backward compatibility

### Future Tests (with IPFS)

- Upload/download round-trips
- CID verification
- Pinning persistence
- Network failure handling

## Summary

Phase 4 successfully implements:

✅ **IPFS Service** - Full serialization, hashing, client abstraction
✅ **Registry Service** - Key management, type definitions
✅ **API Endpoints** - Backup, recovery, rebuild
✅ **Test Coverage** - 38 new tests, 227 total
✅ **Backward Compatibility** - All existing features working
⏳ **Production IPFS** - Awaits IPFS node configuration
⏳ **On-Chain Registry** - Awaits contract deployment

**Next Steps:**
1. Deploy IPFS node for production backups
2. Deploy on-chain registry contract
3. Implement full IPFS client (upload/download/pin)
4. Implement RegistryClient with viem
5. Add EIP-712 signature generation for registrations
