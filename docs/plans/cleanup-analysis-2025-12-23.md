---
title: Repository Documentation Cleanup Analysis
category: plan
date: 2025-12-23
status: active
---

# Repository Documentation Cleanup Analysis

## Overview

This document analyzes the current state of documentation in the tally-vesting monorepo and identifies cleanup opportunities without code changes.

## Current State

### Repository Structure

```
tally-vesting/
├── .github/
├── .gitignore
├── .gitmodules
├── .nvmrc
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── packages/
    ├── contracts/
    │   ├── CLAUDE.md           # Claude instructions (misplaced)
    │   ├── README.md           # Good - package overview
    │   └── docs/
    │       ├── dev_log.md          # Development log (duplicate)
    │       ├── DEVELOPMENT_LOG.md  # Development log (duplicate)
    │       └── TECHNICAL_NOTES.md  # Technical reference
    └── indexer/
        ├── IMPLEMENTATION_PROMPT.md  # Should be in docs/plans/
        └── README.md                 # Good - package overview
```

### Issues Identified

| Issue | Severity | Impact |
|-------|----------|--------|
| No root README.md | High | Visitors have no project overview |
| No root docs/ directory | Medium | Documentation not discoverable |
| CLAUDE.md in wrong location | Medium | Should be at repo root for global scope |
| Duplicate dev logs | Low | Confusing, redundant content |
| Inconsistent naming | Low | `dev_log.md` vs `DEVELOPMENT_LOG.md` |
| No INDEX.md files | Low | Documentation not discoverable |
| IMPLEMENTATION_PROMPT.md misplaced | Low | Should be in docs/plans/ |

## Cleanup Actions Completed

### 1. Created Root docs/ Directory Structure

```
docs/
├── INDEX.md              # Master index
├── architecture/INDEX.md
├── decisions/INDEX.md
├── guides/INDEX.md
├── learnings/INDEX.md
├── plans/INDEX.md
└── reference/INDEX.md
```

### 2. Consolidated Development Logs

Merged `packages/contracts/docs/dev_log.md` and `packages/contracts/docs/DEVELOPMENT_LOG.md` into:
- `docs/learnings/development-log-2025-12-23.md`

### 3. Reorganized Technical Notes

Moved `packages/contracts/docs/TECHNICAL_NOTES.md` to:
- `docs/reference/sweep-mechanism.md`

### 4. Moved Implementation Plan

Moved `packages/indexer/IMPLEMENTATION_PROMPT.md` to:
- `docs/plans/indexer-implementation-2025-12-23.md`

## Remaining Cleanup Tasks

### High Priority

1. **Create Root README.md** - Add monorepo overview with:
   - Project description
   - Quick start guide
   - Package links
   - Development setup

2. **Move CLAUDE.md to Root** - Move from `packages/contracts/CLAUDE.md` to repo root for global scope

### Medium Priority

3. **Clean Up packages/contracts/docs/** - Remove after confirming consolidation:
   - `dev_log.md` (consolidated)
   - `DEVELOPMENT_LOG.md` (consolidated)
   - `TECHNICAL_NOTES.md` (moved)

### Low Priority

4. **Add Architecture Documentation** - Document:
   - System overview diagram
   - Contract relationships
   - Indexer data flow

5. **Add Decision Records** - Document key decisions:
   - Why merkle-based vesting
   - Why CREATE2 determinism
   - Why permissionless sweep

## File Mapping Summary

| Original Location | New Location | Action |
|-------------------|--------------|--------|
| (missing) | `README.md` | Create |
| (missing) | `docs/INDEX.md` | Created |
| `packages/contracts/CLAUDE.md` | `CLAUDE.md` | Move |
| `packages/contracts/docs/dev_log.md` | `docs/learnings/development-log-2025-12-23.md` | Consolidate |
| `packages/contracts/docs/DEVELOPMENT_LOG.md` | `docs/learnings/development-log-2025-12-23.md` | Consolidate |
| `packages/contracts/docs/TECHNICAL_NOTES.md` | `docs/reference/sweep-mechanism.md` | Move |
| `packages/indexer/IMPLEMENTATION_PROMPT.md` | `docs/plans/indexer-implementation-2025-12-23.md` | Move |

## Verification

After cleanup, verify:
- [ ] Root README.md exists and is accurate
- [ ] CLAUDE.md at root level
- [ ] All INDEX.md files updated
- [ ] No orphaned files in package docs directories
- [ ] All links in documentation are valid

## Related Documents

- [Development Log](../learnings/development-log-2025-12-23.md)
- [Sweep Mechanism Reference](../reference/sweep-mechanism.md)
- [Indexer Implementation Plan](./indexer-implementation-2025-12-23.md)
