import { prisma } from "@/lib/prisma"
import { EmailDraft, EmailDraftStatus, CampaignType } from "@prisma/client"

export class EmailDraftService {
  static async create(data: {
    organizationId: string
    userId: string
    jobId?: string | null  // Optional: parent Job for Request-level association
    prompt: string
    generatedSubject?: string
    generatedBody?: string
    generatedHtmlBody?: string
    // Personalization fields
    subjectTemplate?: string
    bodyTemplate?: string
    htmlBodyTemplate?: string
    availableTags?: string[]
    personalizationMode?: "none" | "contact" | "csv"
    blockOnMissingValues?: boolean
    // Legacy fields
    suggestedRecipients?: any
    suggestedCampaignName?: string
    suggestedCampaignType?: CampaignType
    idempotencyKey?: string | null
    aiGenerationStatus?: string | null
  }): Promise<EmailDraft> {
    const draft = await prisma.emailDraft.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        jobId: data.jobId || null,  // Persist jobId at creation time
        prompt: data.prompt,
        generatedSubject: data.generatedSubject,
        generatedBody: data.generatedBody,
        generatedHtmlBody: data.generatedHtmlBody,
        subjectTemplate: data.subjectTemplate || null,
        bodyTemplate: data.bodyTemplate || null,
        htmlBodyTemplate: data.htmlBodyTemplate || null,
        availableTags: data.availableTags ? JSON.stringify(data.availableTags) as any : null,
        personalizationMode: data.personalizationMode || null,
        blockOnMissingValues: data.blockOnMissingValues ?? true,
        suggestedRecipients: data.suggestedRecipients || null,
        suggestedCampaignName: data.suggestedCampaignName || null,
        suggestedCampaignType: data.suggestedCampaignType || null,
        idempotencyKey: data.idempotencyKey || null,
        aiGenerationStatus: data.aiGenerationStatus || null,
        status: "DRAFT"
      }
    })
    return draft
  }

  static async findById(
    id: string,
    organizationId: string
  ): Promise<(EmailDraft & { availableTags?: string[] }) | null> {
    const draft = await prisma.emailDraft.findFirst({
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

    if (!draft) return null

    // Parse availableTags from JSON if it exists
    const draftWithTags = {
      ...draft,
      availableTags: draft.availableTags ? (typeof draft.availableTags === 'string' ? JSON.parse(draft.availableTags) : draft.availableTags) : undefined
    }

    return draftWithTags
  }

  static async findByIdempotencyKey(
    idempotencyKey: string,
    organizationId: string
  ): Promise<EmailDraft | null> {
    return prisma.emailDraft.findFirst({
      where: {
        idempotencyKey,
        organizationId
      }
    })
  }

  static async update(
    id: string,
    organizationId: string,
    data: Partial<Pick<EmailDraft, "generatedSubject" | "generatedBody" | "generatedHtmlBody" | "subjectTemplate" | "bodyTemplate" | "htmlBodyTemplate" | "availableTags" | "personalizationMode" | "blockOnMissingValues" | "suggestedRecipients" | "suggestedCampaignName" | "suggestedCampaignType" | "status" | "aiGenerationStatus" | "sentAt">>
  ): Promise<EmailDraft> {
    const updateData: any = { ...data }
    
    // Convert availableTags array to JSON if provided
    if ('availableTags' in updateData && Array.isArray(updateData.availableTags)) {
      updateData.availableTags = JSON.stringify(updateData.availableTags)
    }

    return prisma.emailDraft.update({
      where: {
        id,
        organizationId
      },
      data: updateData
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

