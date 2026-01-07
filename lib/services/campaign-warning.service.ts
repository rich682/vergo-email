import { EntityService } from "./entity.service"
import { DomainDetectionService } from "./domain-detection.service"

export interface CampaignWarningResult {
  hasExternal: boolean
  externalCount: number
  internalCount: number
  warning?: string
}

export class CampaignWarningService {
  /**
   * Check if campaign recipients include external contacts
   */
  static async checkExternalRecipients(
    organizationId: string,
    entityIds?: string[],
    groupIds?: string[]
  ): Promise<CampaignWarningResult> {
    const entityEmails = new Set<string>()
    
    // Collect entity emails
    if (entityIds && entityIds.length > 0) {
      for (const entityId of entityIds) {
        const entity = await EntityService.findById(entityId, organizationId)
        if (entity?.email) {
          entityEmails.add(entity.email)
        }
      }
    }

    // Collect group entity emails
    if (groupIds && groupIds.length > 0) {
      for (const groupId of groupIds) {
        const entities = await EntityService.findByOrganization(organizationId, {
          groupId
        })
        for (const entity of entities) {
          if (entity.email) {
            entityEmails.add(entity.email)
          }
        }
      }
    }

    if (entityEmails.size === 0) {
      return {
        hasExternal: false,
        externalCount: 0,
        internalCount: 0,
        warning: "No recipients found"
      }
    }

    // Check each email
    let internalCount = 0
    let externalCount = 0

    for (const email of entityEmails) {
      const isInternal = await DomainDetectionService.isInternalEmail(
        email,
        organizationId
      )
      if (isInternal) {
        internalCount++
      } else {
        externalCount++
      }
    }

    const hasExternal = externalCount > 0

    let warning: string | undefined
    if (hasExternal) {
      warning = `This campaign will send to ${externalCount} external contact${externalCount > 1 ? "s" : ""} and ${internalCount} internal contact${internalCount !== 1 ? "s" : ""}. Are you sure you want to proceed?`
    }

    return {
      hasExternal,
      externalCount,
      internalCount,
      warning
    }
  }
}









