#!/bin/bash
set -e

cd "/Users/richardkane/Desktop/Vergo Inbox v2"

# Step 1: Stop all processes
echo "Step 1: Stopping processes..."
pkill -f "next" || true
pkill -f "node" || true
pkill -f "tsx" || true
pkill -f "ts-node" || true
pkill -f "prisma" || true
pkill -f "inngest" || true
sleep 1
echo "Checking for remaining node processes:"
ps aux | grep -i node | grep -v grep || echo "No node processes found"

# Step 2: Check for open file handles
echo -e "\nStep 2: Checking for open file handles..."
lsof +D "./node_modules" 2>/dev/null | head -n 20 || echo "No open handles found (or lsof not available)"

# Step 3: Delete node_modules using rsync trick
echo -e "\nStep 3: Removing node_modules..."
if [ -d "node_modules" ]; then
  mkdir -p /tmp/empty_dir
  rsync -a --delete /tmp/empty_dir/ ./node_modules/ || true
  rm -rf ./node_modules
  echo "node_modules removed"
else
  echo "node_modules already removed"
fi

# Remove lock and build artifacts
echo "Removing lock file and build artifacts..."
rm -f package-lock.json
rm -rf .next
echo "Cleanup complete"

# Step 4: Fresh install
echo -e "\nStep 4: Running npm ci..."
npm ci

# Step 5: Prisma sanity
echo -e "\nStep 5: Prisma sanity checks..."
echo "Node version:"
node -v
echo -e "\nnpm version:"
npm -v
echo -e "\nPrisma version:"
npx prisma -v
echo -e "\nGenerating Prisma client:"
npx prisma generate

# Step 6: Migration integrity
echo -e "\nStep 6: Checking migration integrity..."
if [ -d "prisma/migrations/20260109214401_add_personalization_fields" ]; then
  if [ -z "$(ls -A prisma/migrations/20260109214401_add_personalization_fields)" ]; then
    echo "Removing empty migration directory: 20260109214401_add_personalization_fields"
    rm -rf "prisma/migrations/20260109214401_add_personalization_fields"
  fi
fi

echo -e "\nChecking migration status:"
npx prisma migrate status || echo "Migration status check completed (may require DB connection)"

echo -e "\n✅ All steps completed!"

