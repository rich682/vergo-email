# Bloat Review - Files to Clean Up

## Issues Found

### 1. Redundant Documentation Files (5 files → keep 1)

**Duplicate git fix documentation:**
- `CURSOR_GIT_FIX.md` - ⚠️ **DELETE** (superseded by GITWORKER_FIX.md)
- `CURSOR_GIT_FIX_COMPLETE.md` - ⚠️ **DELETE** (superseded by GITWORKER_FIX.md)
- `GIT_SOLUTION.md` - ⚠️ **DELETE** (superseded by GITWORKER_FIX.md)
- `DIAGNOSTIC_RESULTS.md` - ⚠️ **DELETE** (temporary diagnostic output)
- `GITWORKER_FIX.md` - ✅ **KEEP** (most comprehensive and up-to-date)

**Recommendation:** Consolidate all git fix info into `GITWORKER_FIX.md` and delete the others.

### 2. Scripts in Root Directory (should be in scripts/)

**Move to scripts/ directory:**
- `check-tracked-files.sh` - ⚠️ **MOVE** to `scripts/`
- `diagnose-git.sh` - ⚠️ **MOVE** to `scripts/`

### 3. Redundant Scripts

**Potential duplicates:**
- `safe-git-commit.sh` - ⚠️ **DELETE** (redundant with `git-safe` wrapper which is more comprehensive)
- `scripts/stage-files.sh` - ⚠️ **REVIEW** (may not be needed with git-safe wrapper)

### 4. Empty Directory

**Unused directory:**
- `app/api/migrate/` - ⚠️ **DELETE** (empty, duplicate of `app/api/admin/migrate/`)

### 5. Git Tracked Status

All these files appear to be tracked in git. They should be cleaned up to:
- Reduce repository clutter
- Avoid confusion about which documentation is current
- Keep root directory clean

## Cleanup Actions Completed ✅

### ✅ Completed: Deleted redundant documentation
- ✅ `CURSOR_GIT_FIX.md` - DELETED
- ✅ `CURSOR_GIT_FIX_COMPLETE.md` - DELETED
- ✅ `GIT_SOLUTION.md` - DELETED
- ✅ `DIAGNOSTIC_RESULTS.md` - DELETED

### ✅ Completed: Moved scripts to scripts/ directory
- ✅ `check-tracked-files.sh` → `scripts/check-tracked-files.sh`
- ✅ `diagnose-git.sh` → `scripts/diagnose-git.sh`

### ✅ Completed: Removed redundant/empty items
- ✅ `safe-git-commit.sh` - DELETED (redundant with git-safe)
- ✅ `app/api/migrate/` - DELETED (empty duplicate directory)

### ⚠️ Kept: scripts/stage-files.sh
- This script is useful for incremental staging (avoids scanning entire tree)
- Different purpose than git-safe (which just kills processes)
- Keep it for now

### 📝 Note: Update references if needed
- `DEVELOPMENT_GUIDELINES.md` references `GITWORKER_FIX.md` (still exists ✅)
- Script references may need updating if any scripts called deleted files

## Summary

**Files to delete:** 6 files
**Files to move:** 2 files
**Empty directories to remove:** 1 directory

**Space saved:** ~20KB (small but keeps project clean)

**Benefits:**
- Single source of truth for git fix documentation
- Cleaner root directory
- Less confusion about which files to use
- Better organization (scripts in scripts/ directory)

