# Git Commit Tools - Reliable Committing Despite Cursor Issues

Since Cursor's terminal has persistent issues with git operations, we've created specialized tools to ensure reliable commits.

## Available Tools

### 1. **robust-commit.sh** - Batch Staging with Retry

Stages files in small batches and commits with automatic retry logic.

**Usage:**
```bash
./scripts/robust-commit.sh "Your commit message"
```

**Features:**
- Stages files in small batches (prevents timeouts)
- Automatic retry on commit failure (3 attempts)
- Cleans up processes before operations
- Shows progress and results

### 2. **auto-commit.sh** - Full Automated Commit

Complete automation that stages everything and commits reliably.

**Usage:**
```bash
./scripts/auto-commit.sh "Your commit message"
```

**Features:**
- Stages all files by directory (avoids scanning everything)
- Handles Cursor terminal issues automatically
- Retry logic with cleanup between attempts
- Shows what will be committed
- Reports remaining unstaged files

### 3. **git-status-check.sh** - Quick Status Check

Fast status check that works reliably in Cursor.

**Usage:**
```bash
./scripts/git-status-check.sh
```

**Features:**
- Checks for lock files and stuck processes
- Shows modified, untracked, and staged files
- Quick overview without hanging

### 4. **git-safe** - Enhanced Git Wrapper

Wrapper that kills interfering processes before git commands.

**Usage:**
```bash
./git-safe status
./git-safe add app/
./git-safe commit -m "message"
```

### 5. **Pre-commit Hook** - Automatic Safety Checks

Prevents common issues before commits:

- Removes lock files automatically
- Kills gitWorker processes
- Prevents committing sensitive files (.env, secrets, .key)
- Warns about large files (>10MB)

**Location:** `.git/hooks/pre-commit` (already installed)

## Recommended Workflow

### For Regular Commits

**Option 1: Use auto-commit (Easiest)**
```bash
./scripts/auto-commit.sh "Fix user authentication bug"
```

**Option 2: Use robust-commit (More Control)**
```bash
./scripts/robust-commit.sh "Add new feature"
```

### For Checking Status

```bash
./scripts/git-status-check.sh
```

### For Specific Git Operations

```bash
./git-safe status
./git-safe add app/api/
./git-safe commit -m "Update API routes"
```

## Why These Tools Work

1. **Batch Processing** - Staging in small batches avoids scanning all 46k ignored files
2. **Process Cleanup** - Kills gitWorker and stuck processes before operations
3. **Retry Logic** - Automatically retries failed operations
4. **Progress Feedback** - Shows what's happening so you know it's working
5. **Error Handling** - Handles common failure scenarios

## Troubleshooting

### Commit Still Hangs

1. Check for stuck processes:
   ```bash
   ps aux | grep git
   ```

2. Kill them manually:
   ```bash
   pkill -9 -f gitWorker
   pkill -9 -f "git add"
   ```

3. Remove lock file:
   ```bash
   rm -f .git/index.lock
   ```

4. Use auto-commit script (handles all this automatically)

### Some Files Not Staged

The batch staging may miss some files. Run the script again to catch them:
```bash
./scripts/auto-commit.sh "Commit remaining files"
```

### Need to Commit Everything

Use auto-commit which stages all directories:
```bash
./scripts/auto-commit.sh "Complete commit"
```

## Best Practices

1. **Use scripts instead of manual git commands** - They handle Cursor issues
2. **Commit frequently** - Smaller commits work better than large ones
3. **Check status first** - Use git-status-check.sh before committing
4. **Use descriptive messages** - Makes it easier to track changes

## Comparison: Manual vs Scripts

| Method | Speed | Reliability | Cursor Issues |
|--------|-------|-------------|---------------|
| Manual `git add -A` | Slow | ❌ Hangs | Yes |
| Manual `git add` (batches) | Medium | ⚠️ Can hang | Sometimes |
| `auto-commit.sh` | Fast | ✅ Reliable | Handled |
| `robust-commit.sh` | Fast | ✅ Reliable | Handled |

## Summary

These tools ensure you can commit reliably despite Cursor's terminal issues. Use `auto-commit.sh` for easiest operation, or `robust-commit.sh` for more control.

