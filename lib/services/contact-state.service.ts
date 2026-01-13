import { prisma } from "@/lib/prisma"
import { ContactStateSource } from "@prisma/client"

export class ContactStateService {
  /**
   * Get or create a Tag by name for an organization.
   * This ensures tags are auto-created when importing data.
   */
  static async getOrCreateTag(organizationId: string, tagName: string, displayName?: string): Promise<string> {
    // Normalize tag name
    const normalizedName = tagName.trim().toLowerCase().replace(/\s+/g, "_")
    
    // Try to find existing tag
    let tag = await prisma.tag.findUnique({
      where: {
        organizationId_name: {
          organizationId,
          name: normalizedName
        }
      }
    })

    // Create if doesn't exist
    if (!tag) {
      tag = await prisma.tag.create({
        data: {
          organizationId,
          name: normalizedName,
          displayName: displayName || tagName.trim()
        }
      })
    }

    return tag.id
  }

  static async upsertState(params: {
    organizationId: string
    entityId: string
    stateKey: string
    stateValue?: string
    metadata?: any
    source?: ContactStateSource
  }) {
    // Get or create the tag first
    const tagId = await this.getOrCreateTag(params.organizationId, params.stateKey)

    return prisma.contactState.upsert({
      where: {
        organizationId_entityId_tagId: {
          organizationId: params.organizationId,
          entityId: params.entityId,
          tagId: tagId
        }
      },
      create: {
        organizationId: params.organizationId,
        entityId: params.entityId,
        tagId: tagId,
        stateKey: params.stateKey.trim().toLowerCase().replace(/\s+/g, "_"), // Denormalized for backward compat
        stateValue: params.stateValue,
        metadata: params.metadata,
        source: params.source || ContactStateSource.CSV_UPLOAD
      },
      update: {
        stateValue: params.stateValue,
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
    stateValue?: string
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
      stateValue: params.stateValue,
      metadata: params.metadata,
      source: sourceEnum
    })
  }

  static async delete(entityId: string, stateKey: string, organizationId?: string) {
    // If we have organizationId, we can look up the tag first
    if (organizationId) {
      const tag = await prisma.tag.findFirst({
        where: { organizationId, name: stateKey.toLowerCase().replace(/\s+/g, "_") }
      })
      if (tag) {
        return prisma.contactState.deleteMany({
          where: {
            entityId,
            tagId: tag.id
          }
        })
      }
    }
    
    // Fallback to stateKey for backward compatibility
    return prisma.contactState.deleteMany({
      where: {
        entityId,
        stateKey
      }
    })
  }

  static async replaceForTag(params: {
    organizationId: string
    tagId: string
    keepEntityIds: string[]
  }) {
    await prisma.contactState.deleteMany({
      where: {
        organizationId: params.organizationId,
        tagId: params.tagId,
        entityId: {
          notIn: params.keepEntityIds
        }
      }
    })
  }

  // Backward compatible version
  static async replaceForStateKey(params: {
    organizationId: string
    stateKey: string
    keepEntityIds: string[]
  }) {
    const tag = await prisma.tag.findFirst({
      where: { 
        organizationId: params.organizationId, 
        name: params.stateKey.toLowerCase().replace(/\s+/g, "_") 
      }
    })
    
    if (tag) {
      await this.replaceForTag({
        organizationId: params.organizationId,
        tagId: tag.id,
        keepEntityIds: params.keepEntityIds
      })
    }
  }
}

