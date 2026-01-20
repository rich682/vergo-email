/**
 * Board Migration Script
 * 
 * This script migrates existing boards to the new schema:
 * 1. Converts OPEN → NOT_STARTED, CLOSED → COMPLETE status
 * 2. Sets ownerId = createdById for existing boards
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting board migration...\n')
  
  // Step 1: Update status values using raw SQL
  // This must be done before the enum changes
  console.log('Step 1: Converting board statuses...')
  
  // Get current board counts
  const boards = await prisma.$queryRaw<{ id: string, status: string, createdById: string }[]>`
    SELECT id, status::text, "createdById" FROM "Board"
  `
  console.log(`Found ${boards.length} boards to migrate`)
  
  // Update OPEN → NOT_STARTED
  const openResult = await prisma.$executeRaw`
    UPDATE "Board" SET status = 'NOT_STARTED' WHERE status = 'OPEN'
  `
  console.log(`  - Converted ${openResult} OPEN boards to NOT_STARTED`)
  
  // Update CLOSED → COMPLETE
  const closedResult = await prisma.$executeRaw`
    UPDATE "Board" SET status = 'COMPLETE' WHERE status = 'CLOSED'
  `
  console.log(`  - Converted ${closedResult} CLOSED boards to COMPLETE`)
  
  // Step 2: Set ownerId = createdById for all boards
  console.log('\nStep 2: Setting ownerId = createdById...')
  const ownerResult = await prisma.$executeRaw`
    UPDATE "Board" SET "ownerId" = "createdById" WHERE "ownerId" IS NULL
  `
  console.log(`  - Set owner for ${ownerResult} boards`)
  
  console.log('\n✅ Migration complete!')
  
  // Verify
  const updated = await prisma.$queryRaw<{ id: string, name: string, status: string, ownerId: string }[]>`
    SELECT id, name, status::text, "ownerId" FROM "Board"
  `
  console.log('\nVerification:')
  for (const board of updated) {
    console.log(`  - ${board.name}: status=${board.status}, ownerId=${board.ownerId ? '✓' : '✗'}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
