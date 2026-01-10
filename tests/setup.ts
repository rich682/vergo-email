import { beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'

// Use test database (set TEST_DATABASE_URL or fallback to DATABASE_URL)
// Allow tests to run without DB connection for pure unit tests
const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL

// Only initialize Prisma if DB URL is provided (for integration tests)
let prisma: PrismaClient | null = null

if (testDbUrl && !testDbUrl.includes('skip-connection')) {
  // Safety guard: ensure database name indicates it's a test database
  try {
    const dbUrl = new URL(testDbUrl)
    const dbName = dbUrl.pathname.replace('/', '') || dbUrl.pathname.split('/').pop() || ''

    if (!dbName.includes('_test') && !dbName.includes('-test') && !dbName.includes('test_') && !dbName.includes('test-')) {
      console.warn(
        `WARNING: Database name "${dbName}" does not indicate a test database.\n` +
        `Test database name should contain "_test", "-test", "test_", or "test-".\n` +
        `Skipping database connection for unit tests.`
      )
    } else {
      // Only create Prisma client if DB URL is valid
      prisma = new PrismaClient()
    }
  } catch (e) {
    // Invalid URL format, skip DB connection
    console.warn('Invalid database URL format, skipping database connection for unit tests.')
  }
}

beforeAll(async () => {
  // Only connect if database URL is valid and Prisma client was created
  if (prisma) {
    await prisma.$connect().catch(() => {
      // If connection fails, set prisma to null to skip DB operations
      prisma = null
    })
  }
})

afterAll(async () => {
  // Clean up connection if it exists
  if (prisma) {
    await prisma.$disconnect().catch(() => {
      // Ignore disconnection errors
    })
  }
})

beforeEach(async () => {
  // Clean up test data (skip if no real DB connection)
  if (prisma) {
    try {
      await prisma.emailDraft.deleteMany({
        where: {
          idempotencyKey: {
            startsWith: 'test-'
          }
        }
      })
    } catch (e) {
      // Ignore cleanup errors (DB might not be available for unit tests)
    }
  }
})

