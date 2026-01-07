import { prisma } from "@/lib/prisma"
import { EmailDraft, EmailDraftStatus, CampaignType } from "@prisma/client"

export class EmailDraftService {
  static async create(data: {
    organizationId: string
    userId: string
    prompt: string
    generatedSubject?: string
    generatedBody?: string
    generatedHtmlBody?: string
    suggestedRecipients?: any
    suggestedCampaignName?: string
    suggestedCampaignType?: CampaignType
  }): Promise<EmailDraft> {
    return prisma.emailDraft.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        prompt: data.prompt,
        generatedSubject: data.generatedSubject,
        generatedBody: data.generatedBody,
        generatedHtmlBody: data.generatedHtmlBody,
        suggestedRecipients: data.suggestedRecipients || null,
        suggestedCampaignName: data.suggestedCampaignName || null,
        suggestedCampaignType: data.suggestedCampaignType || null,
        status: "DRAFT"
      }
    })
  }

  static async findById(
    id: string,
    organizationId: string
  ): Promise<EmailDraft | null> {
    return prisma.emailDraft.findFirst({
      where: {
        id,
        organizationId
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    })
  }

  static async update(
    id: string,
    organizationId: string,
    data: Partial<Pick<EmailDraft, "generatedSubject" | "generatedBody" | "generatedHtmlBody" | "suggestedRecipients" | "suggestedCampaignName" | "suggestedCampaignType" | "status">>
  ): Promise<EmailDraft> {
    return prisma.emailDraft.update({
      where: {
        id,
        organizationId
      },
      data: data as any
    })
  }

  static async findByOrganization(
    organizationId: string,
    userId?: string
  ): Promise<EmailDraft[]> {
    const where: any = { organizationId }
    if (userId) {
      where.userId = userId
    }

    return prisma.emailDraft.findMany({
      where,
      orderBy: {
        createdAt: "desc"
      },
      take: 50
    })
  }
}

