import { prisma } from "@/lib/prisma"
import { Campaign, CampaignType } from "@prisma/client"

export class CampaignService {
  static async create(data: {
    name: string
    description?: string
    goal?: string
    type: CampaignType
    organizationId: string
    groupId?: string
    autoVerify?: boolean
    isActive?: boolean
    automationRules?: any
  }): Promise<Campaign> {
    return prisma.campaign.create({
      data: {
        name: data.name,
        description: data.description,
        goal: data.goal,
        type: data.type,
        organizationId: data.organizationId,
        groupId: data.groupId,
        autoVerify: data.autoVerify || false,
        isActive: data.isActive !== undefined ? data.isActive : true,
        automationRules: data.automationRules || null
      }
    })
  }

  static async findById(
    id: string,
    organizationId: string
  ): Promise<Campaign | null> {
    return prisma.campaign.findFirst({
      where: {
        id,
        organizationId
      },
      include: {
        group: true,
        tasks: {
          take: 10,
          orderBy: {
            createdAt: "desc"
          }
        }
      }
    })
  }

  static async findByOrganization(
    organizationId: string,
    options?: {
      isActive?: boolean
      type?: CampaignType
      groupId?: string
    }
  ): Promise<Campaign[]> {
    const where: any = {
      organizationId
    }

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive
    }

    if (options?.type) {
      where.type = options.type
    }

    if (options?.groupId) {
      where.groupId = options.groupId
    }

    return prisma.campaign.findMany({
      where,
      include: {
        group: true
      },
      orderBy: {
        name: "asc"
      }
    })
  }

  static async update(
    id: string,
    organizationId: string,
    data: Partial<Pick<Campaign, "name" | "description" | "goal" | "autoVerify" | "isActive" | "automationRules">>
  ): Promise<Campaign> {
    return prisma.campaign.update({
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
    await prisma.campaign.delete({
      where: {
        id,
        organizationId
      }
    })
  }
}

