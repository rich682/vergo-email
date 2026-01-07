import { prisma } from "@/lib/prisma"
import { Group } from "@prisma/client"

export class GroupService {
  static async create(data: {
    name: string
    description?: string
    color?: string
    organizationId: string
  }): Promise<Group> {
    return prisma.group.create({
      data
    })
  }

  static async findById(
    id: string,
    organizationId: string
  ): Promise<Group | null> {
    return prisma.group.findFirst({
      where: {
        id,
        organizationId
      },
      include: {
        entities: {
          include: {
            entity: true
          }
        }
      }
    })
  }

  static async findByOrganization(
    organizationId: string
  ): Promise<Group[]> {
    return prisma.group.findMany({
      where: { organizationId },
      include: {
        entities: {
          include: {
            entity: true
          }
        }
      },
      orderBy: {
        name: "asc"
      }
    })
  }

  static async update(
    id: string,
    organizationId: string,
    data: Partial<Pick<Group, "name" | "description" | "color">>
  ): Promise<Group> {
    return prisma.group.update({
      where: {
        id,
        organizationId
      },
      data
    })
  }

  static async delete(
    id: string,
    organizationId: string
  ): Promise<void> {
    await prisma.group.delete({
      where: {
        id,
        organizationId
      }
    })
  }
}






