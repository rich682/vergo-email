import { PrismaClient, Prisma } from '@prisma/client'

// Models that support soft delete via deletedAt field
// NOTE: Prisma $allModels callbacks receive PascalCase model names (matching the schema)
const SOFT_DELETE_MODELS = [
  'Database',
  'FormDefinition',
  'ReportDefinition',
  'Board',
  'TaskInstance',
  'ReconciliationConfig',
  'AgentDefinition',
  'Entity',
  'Group',
  'Request',
  'Message',
] as const

type SoftDeleteModel = typeof SOFT_DELETE_MODELS[number]

function isSoftDeleteModel(model: string): model is SoftDeleteModel {
  return SOFT_DELETE_MODELS.includes(model as SoftDeleteModel)
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const basePrisma = globalForPrisma.prisma ?? new PrismaClient()

// Extended client that auto-filters soft-deleted records from all queries
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        if (isSoftDeleteModel(model)) {
          args.where = { ...args.where, deletedAt: null }
        }
        return query(args)
      },
      async findFirst({ model, args, query }) {
        if (isSoftDeleteModel(model)) {
          args.where = { ...args.where, deletedAt: null }
        }
        return query(args)
      },
      async findUnique({ model, args, query }) {
        if (isSoftDeleteModel(model)) {
          // findUnique only supports unique fields in where, so we can't add deletedAt.
          // Instead, we run the query and filter the result.
          const result = await query(args)
          if (result && (result as any).deletedAt !== null && (result as any).deletedAt !== undefined) {
            return null
          }
          return result
        }
        return query(args)
      },
      async count({ model, args, query }) {
        if (isSoftDeleteModel(model)) {
          args.where = { ...args.where, deletedAt: null }
        }
        return query(args)
      },
    },
  },
})

globalForPrisma.prisma = basePrisma

/**
 * Raw (unextended) Prisma client for trash/restore operations
 * that need to query soft-deleted records.
 */
export const prismaWithDeleted = basePrisma

/** Transaction client type for passing to service methods.
 *  Uses the extended client type so it's compatible with both
 *  the extended prisma client and its $transaction callback. */
export type PrismaTransactionClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>
