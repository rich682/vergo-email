import { prisma } from "@/lib/prisma"
import { Entity } from "@prisma/client"
import { DomainDetectionService } from "./domain-detection.service"

export class EntityService {
  static async create(data: {
    firstName: string
    lastName?: string
    email?: string
    phone?: string
    companyName?: string
    organizationId: string
    contactType?: any
    contactTypeCustomLabel?: string
    isInternal?: boolean
  }): Promise<Entity> {
    return prisma.entity.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        companyName: data.companyName,
        contactType: data.contactType,
        contactTypeCustomLabel: data.contactTypeCustomLabel,
        isInternal: data.isInternal ?? false,
        organizationId: data.organizationId
      }
    })
  }

  static async findById(
    id: string,
    organizationId: string
  ): Promise<Entity | null> {
    return prisma.entity.findFirst({
      where: {
        id,
        organizationId
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

  static async delete(
    id: string,
    organizationId: string,
    deletedById?: string
  ): Promise<void> {
    // Soft delete: set deletedAt instead of removing the record
    await prisma.entity.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: deletedById ?? null },
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
