/**
 * Personalization Data Service
 * 
 * Manages per-recipient personalization data and rendered emails.
 * Handles storage and retrieval of CSV-based personalization data.
 */

import { prisma } from "@/lib/prisma"

export interface PersonalizationDataInput {
  emailDraftId: string
  recipientEmail: string
  contactId?: string
  dataJson: Record<string, string>
  renderSubject?: string
  renderBody?: string
  renderHtmlBody?: string
  renderStatus?: "ok" | "missing" | "failed"
  renderErrors?: string[]
}

export class PersonalizationDataService {
  /**
   * Create personalization data for a recipient
   */
  static async create(data: PersonalizationDataInput) {
    return prisma.personalizationData.create({
      data: {
        emailDraftId: data.emailDraftId,
        recipientEmail: data.recipientEmail,
        contactId: data.contactId || null,
        dataJson: data.dataJson as any,
        renderSubject: data.renderSubject || null,
        renderBody: data.renderBody || null,
        renderHtmlBody: data.renderHtmlBody || null,
        renderStatus: data.renderStatus || null,
        renderErrors: data.renderErrors ? JSON.stringify(data.renderErrors) as any : null
      }
    })
  }

  /**
   * Bulk create personalization data for multiple recipients
   * Uses upsert to handle duplicates (emailDraftId + recipientEmail unique constraint)
   */
  static async createMany(dataArray: PersonalizationDataInput[]) {
    // Use createMany with skipDuplicates for efficiency, but handle potential duplicates
    try {
      return await prisma.personalizationData.createMany({
        data: dataArray.map(data => ({
          emailDraftId: data.emailDraftId,
          recipientEmail: data.recipientEmail,
          contactId: data.contactId || null,
          dataJson: data.dataJson as any,
          renderSubject: data.renderSubject || null,
          renderBody: data.renderBody || null,
          renderHtmlBody: data.renderHtmlBody || null,
          renderStatus: data.renderStatus || null,
          renderErrors: data.renderErrors ? JSON.stringify(data.renderErrors) as any : null
        })),
        skipDuplicates: true // Skip duplicates based on unique constraint
      })
    } catch (error: any) {
      // If createMany fails due to unique constraint, fall back to individual upserts
      // This handles edge cases where duplicates might exist
      const results = []
      for (const data of dataArray) {
        try {
          await prisma.personalizationData.upsert({
            where: {
              emailDraftId_recipientEmail: {
                emailDraftId: data.emailDraftId,
                recipientEmail: data.recipientEmail
              }
            },
            create: {
              emailDraftId: data.emailDraftId,
              recipientEmail: data.recipientEmail,
              contactId: data.contactId || null,
              dataJson: data.dataJson as any,
              renderSubject: data.renderSubject || null,
              renderBody: data.renderBody || null,
              renderHtmlBody: data.renderHtmlBody || null,
              renderStatus: data.renderStatus || null,
              renderErrors: data.renderErrors ? JSON.stringify(data.renderErrors) as any : null
            },
            update: {
              dataJson: data.dataJson as any,
              renderSubject: data.renderSubject ?? undefined,
              renderBody: data.renderBody ?? undefined,
              renderHtmlBody: data.renderHtmlBody ?? undefined,
              renderStatus: data.renderStatus ?? undefined,
              renderErrors: data.renderErrors ? JSON.stringify(data.renderErrors) as any : undefined
            }
          })
          results.push({ count: 1 })
        } catch (err: any) {
          // Skip individual errors
          console.error("Error upserting personalization data:", err)
        }
      }
      return { count: results.length }
    }
  }

  /**
   * Find all personalization data for a draft
   */
  static async findByDraftId(emailDraftId: string) {
    return prisma.personalizationData.findMany({
      where: { emailDraftId },
      orderBy: { recipientEmail: "asc" }
    })
  }

  /**
   * Find personalization data by draft and email
   */
  static async findByDraftAndEmail(emailDraftId: string, recipientEmail: string) {
    return prisma.personalizationData.findFirst({
      where: {
        emailDraftId,
        recipientEmail
      }
    })
  }

  /**
   * Update rendered content for a recipient
   */
  static async updateRender(
    id: string,
    data: {
      renderSubject?: string
      renderBody?: string
      renderHtmlBody?: string
      renderStatus?: "ok" | "missing" | "failed"
      renderErrors?: string[]
    }
  ) {
    return prisma.personalizationData.update({
      where: { id },
      data: {
        renderSubject: data.renderSubject ?? undefined,
        renderBody: data.renderBody ?? undefined,
        renderHtmlBody: data.renderHtmlBody ?? undefined,
        renderStatus: data.renderStatus ?? undefined,
        renderErrors: data.renderErrors ? JSON.stringify(data.renderErrors) as any : undefined
      }
    })
  }

  /**
   * Delete all personalization data for a draft
   */
  static async deleteByDraftId(emailDraftId: string) {
    return prisma.personalizationData.deleteMany({
      where: { emailDraftId }
    })
  }
}

