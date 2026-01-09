import { beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Use test database (set TEST_DATABASE_URL or fallback to DATABASE_URL)
const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL

if (!testDbUrl) {
  throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set')
}

// Safety guard: ensure database name indicates it's a test database
// Skip check if URL contains skip-connection marker (for fully mocked tests)
if (!testDbUrl.includes('skip-connection')) {
  const dbUrl = new URL(testDbUrl)
  const dbName = dbUrl.pathname.replace('/', '') || dbUrl.pathname.split('/').pop() || ''

  if (!dbName.includes('_test') && !dbName.includes('-test') && !dbName.includes('test_') && !dbName.includes('test-')) {
    throw new Error(
      `SAFETY CHECK FAILED: Database name "${dbName}" does not indicate a test database.\n` +
      `Test database name must contain "_test", "-test", "test_", or "test-".\n` +
      `Current URL: ${testDbUrl.replace(/:[^:@]+@/, ':****@')}\n` +
      `Set TEST_DATABASE_URL to a test database to proceed.`
    )
  }
}

beforeAll(async () => {
  // Only connect if database URL is valid (skip for fully mocked tests)
  if (testDbUrl && !testDbUrl.includes('skip-connection')) {
    await prisma.$connect()
  }
})

afterAll(async () => {
  if (testDbUrl && !testDbUrl.includes('skip-connection')) {
    await prisma.$disconnect()
  }
})

beforeEach(async () => {
  // Clean up test data (skip if no real DB connection)
  if (testDbUrl && !testDbUrl.includes('skip-connection')) {
    await prisma.emailDraft.deleteMany({
      where: {
        idempotencyKey: {
          startsWith: 'test-'
        }
      }
    })
  }
})

