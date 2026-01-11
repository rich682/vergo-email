import { prisma } from "@/lib/prisma"
import { Organization } from "@prisma/client"

export class OrganizationService {
  static async create(data: {
    name: string
    slug: string
  }): Promise<Organization> {
    return prisma.organization.create({
      data
    })
  }

  static async findBySlug(slug: string): Promise<Organization | null> {
    return prisma.organization.findUnique({
      where: { slug }
    })
  }

  static async findById(id: string): Promise<Organization | null> {
    return prisma.organization.findUnique({
      where: { id }
    })
  }

  static async update(
    id: string,
    data: Partial<Pick<Organization, "name" | "slug">>
  ): Promise<Organization> {
    return prisma.organization.update({
      where: { id },
      data
    })
  }

  static async delete(id: string): Promise<void> {
    await prisma.organization.delete({
      where: { id }
    })
  }
}











