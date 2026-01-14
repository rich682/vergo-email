import { prisma } from "@/lib/prisma"

// Note: State filter functionality has been removed as part of the migration
// to item-scoped labels. The stateFilter field is kept for backward compatibility
// but is no longer used for filtering.
export type RecipientFilter = {
  stateKey?: string // Legacy single key (deprecated)
  stateKeys?: string[] // Multiple keys (deprecated)
  mode?: "has" | "missing" // (deprecated)
}

export type RecipientSelection = {
  entityIds?: string[]
  groupIds?: string[]
  contactTypes?: string[] // Contact types like "CLIENT", "VENDOR", etc.
  stateFilter?: RecipientFilter // Deprecated - kept for backward compatibility
}

// ============================================================================
// Recipient Explainability Types (Phase 1)
// Structured, deterministic reasons for inclusion/exclusion - no LLM prose
// ============================================================================

export type InclusionReasonType =
  | "contact_type"
  | "group_membership"
  | "direct_selection"

export type ExclusionReasonType =
  | "missing_email"
  | "missing_required_field"
  | "duplicate_email"

export type InclusionReason = {
  type: InclusionReasonType
  value?: string // e.g., "VENDOR" for contact_type, group name for group_membership
}

export type ExclusionReason = {
  type: ExclusionReasonType
  key?: string // e.g., "invoice_number" for missing_required_field
}

export type ResolvedRecipient = {
  email: string
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  entityId?: string
  contactType?: string | null
}

export type ResolvedRecipientWithReasons = ResolvedRecipient & {
  inclusionReasons: InclusionReason[]
}

export type ExcludedRecipient = {
  email?: string
  entityId?: string
  name?: string | null
  exclusionReasons: ExclusionReason[]
}

type ResolveResult = {
  recipients: ResolvedRecipient[]
  counts: {
    total: number
    included: number
    excluded: number
  }
}

export type ResolveResultWithReasons = ResolveResult & {
  recipientsWithReasons: ResolvedRecipientWithReasons[]
  excludedRecipients: ExcludedRecipient[]
}

export async function resolveRecipientsWithFilter(
  organizationId: string,
  selection: RecipientSelection
): Promise<ResolveResult> {
  // Delegate to the version with reasons, but strip the reason data for backward compatibility
  const result = await resolveRecipientsWithReasons(organizationId, selection)
  return {
    recipients: result.recipients,
    counts: result.counts
  }
}

/**
 * Resolve recipients with structured inclusion/exclusion reasons.
 * This provides transparency into why each recipient was included or excluded.
 */
export async function resolveRecipientsWithReasons(
  organizationId: string,
  selection: RecipientSelection
): Promise<ResolveResultWithReasons> {
  const entityIds = selection.entityIds?.filter(Boolean) || []
  const groupIds = selection.groupIds?.filter(Boolean) || []
  const contactTypes = selection.contactTypes?.filter(Boolean) || []

  // Fetch groups to get their names for inclusion reasons
  const groups = groupIds.length > 0
    ? await prisma.group.findMany({
        where: { organizationId, id: { in: groupIds } },
        select: { id: true, name: true }
      })
    : []
  const groupNameMap = new Map(groups.map(g => [g.id, g.name]))

  const [directEntities, groupEntities, typeEntities] = await Promise.all([
    // Direct entity selection
    entityIds.length
      ? prisma.entity.findMany({
          where: { organizationId, id: { in: entityIds } },
          include: { groups: { include: { group: true } } }
        })
      : Promise.resolve([]),
    // Entities from groups (used as filter if contactTypes are selected)
    groupIds.length
      ? prisma.entity.findMany({
          where: {
            organizationId,
            groups: { some: { groupId: { in: groupIds } } }
          },
          include: { groups: { include: { group: true } } }
        })
      : Promise.resolve([]),
    // Entities by contact type
    contactTypes.length
      ? prisma.entity.findMany({
          where: {
            organizationId,
            contactType: { in: contactTypes as any[] }
          },
          include: { groups: { include: { group: true } } }
        })
      : Promise.resolve([])
  ])

  // Track inclusion reasons per entity
  type EntityWithGroups = (typeof directEntities)[number]
  const entityInclusionReasons = new Map<string, { entity: EntityWithGroups; reasons: InclusionReason[] }>()

  // Helper to add entity with reasons
  const addEntityWithReason = (entity: EntityWithGroups, reason: InclusionReason) => {
    const existing = entityInclusionReasons.get(entity.id)
    if (existing) {
      // Add reason if not already present
      if (!existing.reasons.some(r => r.type === reason.type && r.value === reason.value)) {
        existing.reasons.push(reason)
      }
    } else {
      entityInclusionReasons.set(entity.id, { entity, reasons: [reason] })
    }
  }

  // Process direct selections
  for (const entity of directEntities) {
    addEntityWithReason(entity, { type: "direct_selection" })
  }

  // Process type-based selections
  for (const entity of typeEntities) {
    const entityType = entity.contactType as string
    // If groups are also selected, only include if entity is in one of those groups
    if (groupIds.length > 0) {
      const entityGroupIds = entity.groups.map(g => g.groupId)
      const matchingGroupId = entityGroupIds.find(gid => groupIds.includes(gid))
      if (matchingGroupId) {
        addEntityWithReason(entity, { type: "contact_type", value: entityType })
        const groupName = groupNameMap.get(matchingGroupId)
        if (groupName) {
          addEntityWithReason(entity, { type: "group_membership", value: groupName })
        }
      }
      // If not in any selected group, don't add (will be excluded)
    } else {
      addEntityWithReason(entity, { type: "contact_type", value: entityType })
    }
  }

  // Process group-based selections (when no types selected)
  if (contactTypes.length === 0) {
    for (const entity of groupEntities) {
      const entityGroupIds = entity.groups.map(g => g.groupId)
      for (const gid of entityGroupIds) {
        if (groupIds.includes(gid)) {
          const groupName = groupNameMap.get(gid)
          if (groupName) {
            addEntityWithReason(entity, { type: "group_membership", value: groupName })
          }
        }
      }
    }
  }

  // Track excluded recipients and duplicates
  const excludedRecipients: ExcludedRecipient[] = []
  const seenEmails = new Set<string>()
  const includedEntities: { entity: EntityWithGroups; reasons: InclusionReason[] }[] = []

  // Process all entities with reasons
  for (const [entityId, { entity, reasons }] of entityInclusionReasons) {
    // Check for missing email
    if (!entity.email) {
      excludedRecipients.push({
        entityId: entity.id,
        name: entity.firstName,
        exclusionReasons: [{ type: "missing_email" }]
      })
      continue
    }

    // Check for duplicate email
    const emailLower = entity.email.toLowerCase()
    if (seenEmails.has(emailLower)) {
      excludedRecipients.push({
        email: entity.email,
        entityId: entity.id,
        name: entity.firstName,
        exclusionReasons: [{ type: "duplicate_email" }]
      })
      continue
    }

    seenEmails.add(emailLower)
    includedEntities.push({ entity, reasons })
  }

  // Build final recipients with reasons
  const recipientsWithReasons: ResolvedRecipientWithReasons[] = includedEntities.map(({ entity, reasons }) => ({
    email: entity.email as string,
    name: entity.firstName,
    firstName: entity.firstName,
    lastName: entity.lastName,
    entityId: entity.id,
    contactType: entity.contactType as string | null,
    inclusionReasons: reasons
  }))

  // Build backward-compatible recipients array (without reasons)
  const recipients: ResolvedRecipient[] = recipientsWithReasons.map(({ inclusionReasons, ...rest }) => rest)

  const totalConsidered = entityInclusionReasons.size

  return {
    recipients,
    recipientsWithReasons,
    excludedRecipients,
    counts: {
      total: totalConsidered,
      included: recipients.length,
      excluded: excludedRecipients.length
    }
  }
}

/**
 * Build personalization data for a recipient from their contact info.
 * This creates a flat key-value map suitable for template rendering.
 * Note: Contact state functionality has been removed as part of the migration
 * to item-scoped labels.
 */
export function buildRecipientPersonalizationData(
  recipient: ResolvedRecipient
): Record<string, string> {
  const data: Record<string, string> = {
    "First Name": recipient.firstName || recipient.name || "",
    "Email": recipient.email
  }

  if (recipient.lastName) {
    data["Last Name"] = recipient.lastName
  }

  return data
}
