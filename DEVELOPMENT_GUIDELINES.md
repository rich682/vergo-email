# Development Guidelines

This document provides guidelines for developing this project safely and efficiently, with special attention to preventing Cursor IDE issues and maintaining code quality.

## Table of Contents

1. [Cursor IDE Configuration](#cursor-ide-configuration)
2. [Git Workflow](#git-workflow)
3. [File Organization](#file-organization)
4. [Code Structure](#code-structure)
5. [Common Pitfalls](#common-pitfalls)
6. [Troubleshooting](#troubleshooting)

---

## Cursor IDE Configuration

### Critical Settings

The project includes optimized Cursor settings in `.vscode/settings.json`. **DO NOT** modify these without understanding their purpose:

- **Git is disabled in UI** (`git.enabled: false`) - This prevents gitWorker interference
- **File watcher exclusions** - Large directories are excluded to prevent performance issues
- **Source control disabled** - Use terminal git instead

### gitWorker Management

gitWorker automatically starts with Cursor and can interfere with git operations. We've implemented an auto-kill solution:

**LaunchAgent Status:**
- Auto-kills gitWorker every 30 seconds
- Logs to `~/.cursor-gitworker-kill.log`
- Check status: `launchctl list | grep killgitworker`

**If gitWorker causes issues:**
1. Check LaunchAgent: `launchctl list | grep killgitworker`
2. Reload if needed: `launchctl unload ~/Library/LaunchAgents/com.vergo.killgitworker.plist && launchctl load ~/Library/LaunchAgents/com.vergo.killgitworker.plist`
3. See `GITWORKER_FIX.md` for detailed troubleshooting

### Using Cursor Terminal

**Recommended Approach:**
- Use **Mac Terminal** (outside Cursor) for git operations
- OR use `./git-safe` wrapper in Cursor terminal

**Never:**
- Use Cursor's Source Control panel for commits
- Enable git in Cursor settings
- Rely on gitWorker for git operations

---

## Git Workflow

### Before Making Changes

1. **Always work on a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Pull latest changes:**
   ```bash
   git checkout main
   git pull origin main
   git checkout feature/your-feature-name
   git rebase main  # or merge
   ```

### Committing Changes

**Use Mac Terminal (recommended):**
```bash
cd "/Users/richardkane/Desktop/Vergo Inbox v2"
git add -A
git commit -m "Descriptive commit message"
git push origin feature/your-feature-name
```

**OR use git-safe wrapper in Cursor:**
```bash
./git-safe add -A
./git-safe commit -m "Descriptive commit message"
./git-safe push origin feature/your-feature-name
```

### Commit Message Guidelines

Follow conventional commits format:
- `feat: add user authentication`
- `fix: resolve email parsing bug`
- `docs: update README`
- `refactor: simplify email service`
- `test: add unit tests for user service`

### Before Pushing

1. **Check what you're committing:**
   ```bash
   git status
   git diff --staged
   ```

2. **Ensure no sensitive data:**
   - No `.env` files
   - No API keys or secrets
   - No credentials

3. **Run checks:**
   ```bash
   npm run lint
   # Test your changes locally
   ```

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates

---

## File Organization

### What Should Be Tracked

✅ **Always track:**
- Source code (`.ts`, `.tsx`, `.js`, `.jsx`)
- Configuration files (`.json`, `.yaml`, `.config.js`)
- Documentation (`.md`)
- Database schema (`prisma/schema.prisma`)
- Scripts (`scripts/*.sh`)

### What Should NEVER Be Tracked

❌ **Never commit:**
- `.env` files (any environment files)
- `node_modules/`
- `.next/`, `dist/`, `build/`
- `*.log` files
- `.DS_Store`
- IDE-specific files (`.vscode/` is tracked for project settings only)
- Lock files (optional, but `package-lock.json` is ignored)

### Verify Before Committing

Run this before committing:
```bash
git status
# Check for any files that shouldn't be tracked
git ls-files | grep -E "\.env|node_modules|\.next|\.log"
# Should return nothing
```

---

## Code Structure

### Project Organization

```
app/              # Next.js app router (pages and API routes)
lib/              # Core utilities and services
  services/       # Business logic services
components/       # React components
  ui/            # Reusable UI components
inngest/          # Background job functions
prisma/           # Database schema and migrations
scripts/          # Utility scripts
public/           # Static assets
```

### Naming Conventions

- **Files**: `kebab-case.ts` or `PascalCase.tsx` (components)
- **Functions**: `camelCase`
- **Classes**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Interfaces/Types**: `PascalCase` with descriptive names

### Service Files

Services should:
- Be in `lib/services/`
- Export a class or object with methods
- Handle errors gracefully
- Use TypeScript types/interfaces
- Include JSDoc comments for public methods

Example structure:
```typescript
/**
 * Service for handling email operations
 */
export class EmailService {
  /**
   * Send an email
   */
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    // Implementation
  }
}
```

### API Routes

API routes should:
- Be in `app/api/`
- Use Next.js route handlers
- Validate input
- Handle errors appropriately
- Return proper HTTP status codes
- Use authentication middleware when needed

---

## Common Pitfalls

### 1. Git Operations Hanging

**Symptom:** `git add` or `git commit` hangs indefinitely

**Solution:**
1. Kill gitWorker: `pkill -9 -f gitWorker`
2. Remove lock: `rm -f .git/index.lock`
3. Use Mac Terminal or `./git-safe` wrapper

### 2. Large Files Accidentally Tracked

**Symptom:** Repository size suddenly increases

**Prevention:**
- Always check `git status` before committing
- Use `git check-ignore <file>` to verify files are ignored
- Run `./check-tracked-files.sh` periodically

**Fix if already committed:**
```bash
git rm --cached <file>
git commit -m "Remove large file from tracking"
```

### 3. Environment Variables Committed

**Symptom:** `.env` file appears in git

**Fix:**
```bash
git rm --cached .env
echo ".env" >> .gitignore
git commit -m "Remove .env from tracking"
```

### 4. Cursor Settings Breaking

**Symptom:** Cursor behaves unexpectedly

**Solution:**
- Don't modify `.vscode/settings.json` without understanding the impact
- If issues occur, check `GITWORKER_FIX.md`
- Reset settings: `git checkout .vscode/settings.json`

### 5. Dependency Issues

**Symptom:** `npm install` fails or dependencies are outdated

**Solution:**
1. Delete `node_modules` and `package-lock.json`
2. Clear npm cache: `npm cache clean --force`
3. Reinstall: `npm install`
4. If issues persist, check Node.js version (should be 18+)

---

## Troubleshooting

### Git Issues

**Lock file errors:**
```bash
# Kill processes
pkill -9 -f gitWorker
pkill -9 -f "git add"
# Remove lock
rm -f .git/index.lock
# Try again
```

**Repository corruption:**
```bash
# Check for issues
git fsck --full
# If errors, may need to clone fresh
```

**Large repository size:**
```bash
# Check what's tracked
./check-tracked-files.sh
# Verify .gitignore is working
git check-ignore node_modules
```

### Cursor Issues

**gitWorker causing problems:**
- See `GITWORKER_FIX.md` for complete guide
- Check LaunchAgent: `launchctl list | grep killgitworker`
- Check logs: `tail -f ~/.cursor-gitworker-kill.log`

**Performance issues:**
- Ensure large directories are in `files.watcherExclude`
- Close unnecessary files
- Restart Cursor if memory usage is high

### Build Issues

**Prisma client errors:**
```bash
npm run db:generate
```

**Next.js build fails:**
```bash
rm -rf .next
npm run build
```

**Type errors:**
```bash
npm run lint
# Fix issues reported
```

---

## Development Workflow

### Daily Workflow

1. **Start of day:**
   - Pull latest changes
   - Check for updates: `npm outdated`
   - Verify environment: `npm run verify`

2. **During development:**
   - Work on feature branch
   - Commit frequently with descriptive messages
   - Test changes locally before pushing

3. **Before pushing:**
   - Run linter: `npm run lint`
   - Test your changes
   - Check `git status` for unwanted files
   - Write clear commit message

4. **End of day:**
   - Push your work
   - Create PR if feature is complete
   - Document any blockers or issues

### Adding New Features

1. Create feature branch
2. Write code following conventions
3. Add/update tests if applicable
4. Update documentation if needed
5. Test thoroughly
6. Commit and push
7. Create PR for review

### Fixing Bugs

1. Reproduce the bug
2. Create fix branch: `git checkout -b fix/bug-description`
3. Write fix with tests
4. Verify fix works
5. Commit and push
6. Create PR

---

## Best Practices

### Code Quality

- ✅ Write clear, self-documenting code
- ✅ Use TypeScript types strictly
- ✅ Handle errors gracefully
- ✅ Add comments for complex logic
- ✅ Follow existing code patterns

### Git Practices

- ✅ Commit often with clear messages
- ✅ Use feature branches
- ✅ Never commit secrets or credentials
- ✅ Keep commits focused (one logical change per commit)
- ✅ Review diffs before committing

### Performance

- ✅ Avoid scanning large directories (use exclusions)
- ✅ Don't track build artifacts
- ✅ Use `.gitignore` properly
- ✅ Keep repository clean

### Security

- ✅ Never commit `.env` files
- ✅ Use environment variables for secrets
- ✅ Review dependencies for vulnerabilities: `npm audit`
- ✅ Keep dependencies updated

---

## Resources

- **Git Issues**: See `GITWORKER_FIX.md`
- **Deployment**: See `DEPLOYMENT.md`
- **Setup**: See `SETUP.md`
- **Gmail Setup**: See `GMAIL_SETUP.md`

## Questions?

If you encounter issues not covered here:
1. Check relevant documentation file
2. Review error messages carefully
3. Check git status and logs
4. Verify environment setup
5. Document the issue for future reference

---

**Last Updated**: January 2025
**Maintained By**: Development Team

