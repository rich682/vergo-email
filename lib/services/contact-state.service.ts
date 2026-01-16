import { prisma } from "@/lib/prisma"
import { ContactStateSource } from "@prisma/client"

export class ContactStateService {
  static async upsertState(params: {
    organizationId: string
    entityId: string
    stateKey: string
    metadata?: any
    source?: ContactStateSource
  }) {
    return prisma.contactState.upsert({
      where: {
        organizationId_entityId_stateKey: {
          organizationId: params.organizationId,
          entityId: params.entityId,
          stateKey: params.stateKey
        }
      },
      create: {
        organizationId: params.organizationId,
        entityId: params.entityId,
        stateKey: params.stateKey,
        metadata: params.metadata,
        source: params.source || ContactStateSource.CSV_UPLOAD
      },
      update: {
        metadata: params.metadata,
        source: params.source || ContactStateSource.CSV_UPLOAD
      }
    })
  }

  static async replaceForStateKey(params: {
    organizationId: string
    stateKey: string
    keepEntityIds: string[]
  }) {
    await prisma.contactState.deleteMany({
      where: {
        organizationId: params.organizationId,
        stateKey: params.stateKey,
        entityId: {
          notIn: params.keepEntityIds
        }
      }
    })
  }
}

