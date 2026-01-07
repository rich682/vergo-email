#!/bin/bash

# Incremental file staging script
# Avoids using git add -A which scans entire tree

set -e

echo "Staging files incrementally..."

# Stage critical config files first
echo "Stage 1: Config files..."
git add .gitignore .gitattributes .vscode/settings.json .git/info/exclude 2>&1 || true
git add package.json package-lock.json tsconfig.json next.config.js 2>&1 || true
git add Dockerfile .dockerignore cloudbuild.yaml 2>&1 || true

# Stage documentation
echo "Stage 2: Documentation..."
git add *.md 2>&1 || true

# Stage source code directories incrementally
echo "Stage 3: Source code - lib..."
git add lib/ 2>&1 || true

echo "Stage 4: Source code - app..."
git add app/ 2>&1 || true

echo "Stage 5: Source code - components..."
git add components/ 2>&1 || true

echo "Stage 6: Source code - inngest..."
git add inngest/ 2>&1 || true

echo "Stage 7: Source code - prisma..."
git add prisma/ 2>&1 || true

echo "Stage 8: Source code - types and middleware..."
git add types/ middleware.ts 2>&1 || true

echo "Stage 9: Source code - scripts..."
git add scripts/ 2>&1 || true

echo "Stage 10: Config files..."
git add components.json postcss.config.js tailwind.config.ts 2>&1 || true

echo "Staging complete!"
git status --short | head -20

