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

  // Alias for upsertState with slightly different param names
  static async upsert(params: {
    entityId: string
    organizationId: string
    stateKey: string
    metadata?: any
    source?: string
  }) {
    const sourceEnum = params.source === "manual" 
      ? ContactStateSource.MANUAL 
      : params.source === "csv" 
        ? ContactStateSource.CSV_UPLOAD 
        : ContactStateSource.CSV_UPLOAD
    
    return this.upsertState({
      organizationId: params.organizationId,
      entityId: params.entityId,
      stateKey: params.stateKey,
      metadata: params.metadata,
      source: sourceEnum
    })
  }

  static async delete(entityId: string, stateKey: string) {
    return prisma.contactState.deleteMany({
      where: {
        entityId,
        stateKey
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

