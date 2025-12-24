# Documentation Index

> Last updated: 2025-12-23

## Overview

This directory contains all project documentation for the Tally Vesting monorepo. Each subdirectory has its own INDEX.md for detailed listings.

## Quick Links

- [Architecture](./architecture/INDEX.md) - System design and architecture
- [Decisions](./decisions/INDEX.md) - Architecture Decision Records (ADRs)
- [Guides](./guides/INDEX.md) - How-to guides and tutorials
- [Learnings](./learnings/INDEX.md) - Insights and retrospectives
- [Plans](./plans/INDEX.md) - Implementation plans and roadmaps
- [Reference](./reference/INDEX.md) - Reference materials and specs

## Recent Documents

| Date | Category | Document | Description |
|------|----------|----------|-------------|
| 2025-12-23 | architecture | [system-overview-2025-12-23.md](./architecture/system-overview-2025-12-23.md) | Complete system architecture overview |
| 2025-12-23 | decisions | [adr-001-merkle-vesting-2025-12-23.md](./decisions/adr-001-merkle-vesting-2025-12-23.md) | ADR: Merkle-based vesting |
| 2025-12-23 | decisions | [adr-002-create2-determinism-2025-12-23.md](./decisions/adr-002-create2-determinism-2025-12-23.md) | ADR: CREATE2 determinism |
| 2025-12-23 | decisions | [adr-003-permissionless-sweep-2025-12-23.md](./decisions/adr-003-permissionless-sweep-2025-12-23.md) | ADR: Permissionless sweep |
| 2025-12-23 | guides | [development-setup-2025-12-23.md](./guides/development-setup-2025-12-23.md) | Development environment setup |
| 2025-12-23 | learnings | [development-log-2025-12-23.md](./learnings/development-log-2025-12-23.md) | Consolidated development log |
| 2025-12-23 | plans | [cleanup-analysis-2025-12-23.md](./plans/cleanup-analysis-2025-12-23.md) | Repository documentation cleanup analysis |
| 2025-12-23 | plans | [indexer-implementation-2025-12-23.md](./plans/indexer-implementation-2025-12-23.md) | Ponder indexer implementation plan |
| 2025-12-23 | reference | [sweep-mechanism.md](./reference/sweep-mechanism.md) | Technical notes on sweep mechanism |

## Document Count by Category

- Architecture: 1 document
- Decisions: 3 ADRs
- Guides: 1 guide
- Learnings: 1 document
- Plans: 2 documents
- Reference: 1 document

**Total**: 9 documents

## How to Use This Documentation

1. **Finding Information**: Use this index or category indices
2. **Creating New Docs**: Follow templates and naming conventions
3. **Updating Docs**: Update in place or create new dated version
4. **Organizing**: Always update indices when adding/moving files

## Package-Level Documentation

Each package maintains its own README for package-specific details:

- [`packages/contracts/README.md`](../packages/contracts/README.md) - Solidity contracts documentation
- [`packages/indexer/README.md`](../packages/indexer/README.md) - Ponder indexer documentation
