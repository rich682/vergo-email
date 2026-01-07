import { prisma } from "@/lib/prisma"
import { Entity } from "@prisma/client"
import { DomainDetectionService } from "./domain-detection.service"

export class EntityService {
  static async create(data: {
    firstName: string
    email?: string
    phone?: string
    organizationId: string
    groupIds?: string[]
  }): Promise<Entity> {
    const entity = await prisma.entity.create({
      data: {
        firstName: data.firstName,
        email: data.email,
        phone: data.phone,
        organizationId: data.organizationId
      }
    })

    if (data.groupIds && data.groupIds.length > 0) {
      await prisma.entityGroup.createMany({
        data: data.groupIds.map(groupId => ({
          entityId: entity.id,
          groupId
        }))
      })
    }

    return entity
  }

  static async findById(
    id: string,
    organizationId: string
  ): Promise<Entity | null> {
    return prisma.entity.findFirst({
      where: {
        id,
        organizationId
      },
      include: {
        groups: {
          include: {
            group: true
          }
        }
      }
    })
  }

  static async findByEmail(
    email: string,
    organizationId: string
  ): Promise<Entity | null> {
    return prisma.entity.findFirst({
      where: {
        email,
        organizationId
      },
      include: {
        groups: {
          include: {
            group: true
          }
        }
      }
    })
  }

  static async findOrCreateByEmail(data: {
    email: string
    firstName?: string
    organizationId: string
  }): Promise<Entity> {
    const existing = await this.findByEmail(data.email, data.organizationId)
    
    if (existing) {
      return existing
    }

    return this.create({
      firstName: data.firstName || data.email.split("@")[0],
      email: data.email,
      organizationId: data.organizationId
    })
  }

  static async findByOrganization(
    organizationId: string,
    options?: {
      groupId?: string
      search?: string
    }
  ): Promise<Entity[]> {
    const where: any = {
      organizationId
    }

    if (options?.groupId) {
      where.groups = {
        some: {
          groupId: options.groupId
        }
      }
    }

    if (options?.search) {
      where.OR = [
        { firstName: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } }
      ]
    }

    return prisma.entity.findMany({
      where,
      include: {
        groups: {
          include: {
            group: true
          }
        }
      },
      orderBy: {
        firstName: "asc"
      }
    })
  }

  static async update(
    id: string,
    organizationId: string,
    data: Partial<Pick<Entity, "firstName" | "email" | "phone">>
  ): Promise<Entity> {
    return prisma.entity.update({
      where: {
        id,
        organizationId
      },
      data
    })
  }

  static async addToGroup(
    entityId: string,
    groupId: string
  ): Promise<void> {
    await prisma.entityGroup.upsert({
      where: {
        entityId_groupId: {
          entityId,
          groupId
        }
      },
      create: {
        entityId,
        groupId
      },
      update: {}
    })
  }

  static async removeFromGroup(
    entityId: string,
    groupId: string
  ): Promise<void> {
    await prisma.entityGroup.delete({
      where: {
        entityId_groupId: {
          entityId,
          groupId
        }
      }
    })
  }

  static async delete(
    id: string,
    organizationId: string
  ): Promise<void> {
    await prisma.entity.delete({
      where: {
        id,
        organizationId
      }
    })
  }

  /**
   * Check if an entity is internal (belongs to organization's domain)
   */
  static async isInternalEntity(
    email: string | null | undefined,
    organizationId: string
  ): Promise<boolean> {
    if (!email) {
      return false
    }
    return DomainDetectionService.isInternalEmail(email, organizationId)
  }
}

