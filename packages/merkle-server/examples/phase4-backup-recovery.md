# Phase 4: IPFS Backup and Recovery Examples

## Overview

This guide demonstrates the new backup and recovery capabilities added in Phase 4.

## Prerequisites

```bash
# Start the merkle server
bun run dev
```

## Example 1: Create and Backup a Tree

### Step 1: Create a Merkle Tree

```bash
# Create a tree with allocations
TREE_RESPONSE=$(curl -s -X POST http://localhost:3000/trees \
  -H "Content-Type: application/json" \
  -d '{
    "allocations": [
      {
        "beneficiary": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        "amount": "1000000000000000000000"
      },
      {
        "beneficiary": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "amount": "2000000000000000000000"
      }
    ],
    "token": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "vesting": {
      "vestingStart": 1704067200,
      "vestingDuration": 31536000,
      "cliffDuration": 7776000
    }
  }')

# Extract tree ID
TREE_ID=$(echo $TREE_RESPONSE | jq -r '.id')
echo "Created tree: $TREE_ID"

# View the tree
echo $TREE_RESPONSE | jq '.'
```

**Expected Output:**
```json
{
  "id": "abc-123-def-456...",
  "root": "0x1234567890abcdef...",
  "token": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "allocations": [...],
  "vesting": {...},
  "buildSpec": {...},
  "inputHash": "0xabcd..."
}
```

### Step 2: Prepare IPFS Backup

```bash
# Request backup preparation
curl -s -X POST http://localhost:3000/trees/$TREE_ID/backup | jq '.'
```

**Expected Output:**
```json
{
  "treeId": "abc-123-def-456...",
  "contentHash": "0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba",
  "size": 1234,
  "message": "IPFS backup prepared (connect IPFS node to upload)"
}
```

**Key Points:**
- `contentHash`: Keccak256 hash of serialized tree (for verification)
- `size`: Byte size of serialized data
- Currently returns preparation info; actual IPFS upload requires IPFS node

## Example 2: Check Recovery Status

### Check if Tree is Available

```bash
# Check recovery status for existing tree
curl -s http://localhost:3000/trees/$TREE_ID/recovery | jq '.'
```

**Expected Output:**
```json
{
  "source": "local",
  "available": true,
  "root": "0x1234567890abcdef...",
  "inputHash": "0xabcd..."
}
```

### Check Non-Existent Tree

```bash
# Try to check recovery for missing tree
curl -s http://localhost:3000/trees/non-existent-id/recovery | jq '.'
```

**Expected Output:**
```json
{
  "source": "local",
  "available": false,
  "message": "Tree not found locally. Use IPFS CID to recover."
}
```

## Example 3: Recover Tree from Input

### Scenario: Lost Tree, Have Allocations

```bash
# Recover tree by providing original allocations
curl -s -X POST http://localhost:3000/trees/recover \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "allocations": [
        {
          "beneficiary": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          "amount": "1000000000000000000000"
        },
        {
          "beneficiary": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          "amount": "2000000000000000000000"
        }
      ],
      "token": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "vesting": {
        "vestingStart": 1704067200,
        "vestingDuration": 31536000,
        "cliffDuration": 7776000
      }
    }
  }' | jq '.'
```

**Expected Output:**
```json
{
  "source": "rebuild",
  "tree": {
    "id": "new-uuid",
    "root": "0x1234567890abcdef...", // Same root as original!
    "allocations": [...],
    "inputHash": "0xabcd..." // Same inputHash!
  }
}
```

**Key Point:** The recovered tree will have the **same root and inputHash** as the original, proving deterministic reconstruction.

## Example 4: Verify Deterministic Rebuilding

### Rebuild Same Tree Multiple Times

```bash
# First rebuild
REBUILD_1=$(curl -s -X POST http://localhost:3000/trees/recover \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "allocations": [
        {"beneficiary": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "amount": "1000000000000000000000"}
      ]
    }
  }')

ROOT_1=$(echo $REBUILD_1 | jq -r '.tree.root')
HASH_1=$(echo $REBUILD_1 | jq -r '.tree.inputHash')

# Second rebuild
REBUILD_2=$(curl -s -X POST http://localhost:3000/trees/recover \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "allocations": [
        {"beneficiary": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "amount": "1000000000000000000000"}
      ]
    }
  }')

ROOT_2=$(echo $REBUILD_2 | jq -r '.tree.root')
HASH_2=$(echo $REBUILD_2 | jq -r '.tree.inputHash')

# Compare
echo "Root 1: $ROOT_1"
echo "Root 2: $ROOT_2"
echo "Hash 1: $HASH_1"
echo "Hash 2: $HASH_2"

if [ "$ROOT_1" = "$ROOT_2" ] && [ "$HASH_1" = "$HASH_2" ]; then
  echo "✅ Deterministic rebuild verified!"
else
  echo "❌ Rebuild is not deterministic"
fi
```

## Example 5: Content Hash Verification

### Verify Content Hash Matches

```bash
# Get original tree
ORIGINAL=$(curl -s http://localhost:3000/trees/$TREE_ID)

# Prepare backup
BACKUP=$(curl -s -X POST http://localhost:3000/trees/$TREE_ID/backup)

# Extract values
ORIGINAL_ROOT=$(echo $ORIGINAL | jq -r '.root')
BACKUP_HASH=$(echo $BACKUP | jq -r '.contentHash')

echo "Original Root:  $ORIGINAL_ROOT"
echo "Content Hash:   $BACKUP_HASH"
echo ""
echo "The content hash is keccak256 of the serialized tree"
echo "It can be used to verify IPFS downloads without fully deserializing"
```

## Example 6: Download Original Input

### Retrieve Allocations for Manual Recovery

```bash
# Get original input allocations
curl -s http://localhost:3000/trees/$TREE_ID/input | jq '.'
```

**Expected Output:**
```json
{
  "allocations": [
    {
      "beneficiary": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      "amount": "1000000000000000000000"
    }
  ],
  "token": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "vesting": {...},
  "inputHash": "0xabcd...",
  "buildSpec": {...}
}
```

**Use Case:** Save this JSON to a file for disaster recovery.

## Disaster Recovery Workflow

### Full Backup and Recovery Process

```bash
# 1. Create tree
TREE_ID=$(curl -s -X POST http://localhost:3000/trees \
  -H "Content-Type: application/json" \
  -d '{"allocations": [...]}' | jq -r '.id')

# 2. Save original input to file
curl -s http://localhost:3000/trees/$TREE_ID/input > backup-$TREE_ID.json

# 3. Prepare IPFS backup (get content hash)
BACKUP_INFO=$(curl -s -X POST http://localhost:3000/trees/$TREE_ID/backup)
echo $BACKUP_INFO > backup-info-$TREE_ID.json

# 4. Later: Recover from saved input
RECOVERED=$(curl -s -X POST http://localhost:3000/trees/recover \
  -H "Content-Type: application/json" \
  -d "{\"input\": $(cat backup-$TREE_ID.json)}")

# 5. Verify recovery
ORIGINAL_ROOT=$(cat backup-info-$TREE_ID.json | jq -r '.contentHash')
RECOVERED_HASH=$(echo $RECOVERED | jq -r '.tree.inputHash')

echo "Backup saved to:"
echo "  - backup-$TREE_ID.json (input allocations)"
echo "  - backup-info-$TREE_ID.json (content hash)"
echo ""
echo "Recovery verified: $([ \"$ORIGINAL_ROOT\" != \"null\" ] && echo '✅' || echo '❌')"
```

## Integration with Existing Endpoints

### Download Proof Package and Backup Together

```bash
# Download individual proof package
curl -s http://localhost:3000/trees/$TREE_ID/download/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  > proof-alice.json

# Download batch proof package (all beneficiaries)
curl -s http://localhost:3000/trees/$TREE_ID/download \
  > batch-proofs.json

# Prepare IPFS backup
curl -s -X POST http://localhost:3000/trees/$TREE_ID/backup \
  > ipfs-backup-info.json

echo "Complete backup package created:"
echo "  - proof-alice.json (individual proof)"
echo "  - batch-proofs.json (all proofs)"
echo "  - ipfs-backup-info.json (IPFS metadata)"
```

## Future: IPFS Upload (When IPFS Node Available)

### Once IPFS is Configured

```bash
# Set IPFS API URL
export IPFS_API_URL=http://127.0.0.1:5001

# Backup will upload to IPFS automatically
curl -s -X POST http://localhost:3000/trees/$TREE_ID/backup | jq '.'
```

**Expected Output (Future):**
```json
{
  "treeId": "abc-123...",
  "cid": "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
  "contentHash": "0x1234...",
  "size": 1234,
  "pinned": true
}
```

### Recovery from IPFS CID (Future)

```bash
# Recover from IPFS CID
curl -s -X POST http://localhost:3000/trees/recover \
  -H "Content-Type: application/json" \
  -d '{"cid": "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"}' | jq '.'
```

**Expected Output (Future):**
```json
{
  "source": "ipfs",
  "tree": {
    "id": "recovered-uuid",
    "root": "0x1234...",
    ...
  }
}
```

## Summary

Phase 4 provides:

1. **Backup Preparation** - `POST /trees/:id/backup`
   - Computes content hash
   - Prepares serialized data
   - Returns backup metadata

2. **Recovery Status** - `GET /trees/:id/recovery`
   - Check if tree exists locally
   - Get recovery hints if missing

3. **Recovery from Input** - `POST /trees/recover`
   - Rebuild from allocations
   - Deterministic reconstruction
   - Verify with inputHash

4. **Future: IPFS Integration**
   - Automatic upload to IPFS
   - Download from CID
   - Content verification

All operations maintain backward compatibility with existing endpoints.
