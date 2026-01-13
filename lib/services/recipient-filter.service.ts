import { prisma } from "@/lib/prisma"

// Support both single stateKey (legacy) and multiple stateKeys
export type RecipientFilter = {
  stateKey?: string // Legacy single key
  stateKeys?: string[] // Multiple keys
  mode?: "has" | "missing"
}

export type RecipientSelection = {
  entityIds?: string[]
  groupIds?: string[]
  contactTypes?: string[] // Contact types like "CLIENT", "VENDOR", etc.
  stateFilter?: RecipientFilter
}

export type ContactStateData = {
  stateKey: string
  metadata: Record<string, any> | null
}

// ============================================================================
// Recipient Explainability Types (Phase 1)
// Structured, deterministic reasons for inclusion/exclusion - no LLM prose
// ============================================================================

export type InclusionReasonType =
  | "contact_type"
  | "group_membership"
  | "direct_selection"
  | "state_filter_match"

export type ExclusionReasonType =
  | "missing_email"
  | "missing_required_field"
  | "state_filter_mismatch"
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
  contactStates: ContactStateData[]
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
          include: { contactStates: true, groups: { include: { group: true } } }
        })
      : Promise.resolve([]),
    // Entities from groups (used as filter if contactTypes are selected)
    groupIds.length
      ? prisma.entity.findMany({
          where: {
            organizationId,
            groups: { some: { groupId: { in: groupIds } } }
          },
          include: { contactStates: true, groups: { include: { group: true } } }
        })
      : Promise.resolve([]),
    // Entities by contact type
    contactTypes.length
      ? prisma.entity.findMany({
          where: {
            organizationId,
            contactType: { in: contactTypes as any[] }
          },
          include: { contactStates: true, groups: { include: { group: true } } }
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

  // Get filter keys - support both legacy single key and multiple keys
  const filterKeys = selection.stateFilter?.stateKeys?.length 
    ? selection.stateFilter.stateKeys 
    : selection.stateFilter?.stateKey 
      ? [selection.stateFilter.stateKey]
      : []
  const filterMode = selection.stateFilter?.mode

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

    // Check state filter
    if (filterKeys.length > 0 && filterMode === "has") {
      const entityStateKeys = new Set((entity.contactStates || []).map(cs => cs.stateKey))
      const missingKeys = filterKeys.filter(key => !entityStateKeys.has(key))
      
      if (missingKeys.length > 0) {
        excludedRecipients.push({
          email: entity.email,
          entityId: entity.id,
          name: entity.firstName,
          exclusionReasons: missingKeys.map(key => ({ 
            type: "state_filter_mismatch" as const, 
            key 
          }))
        })
        continue
      }
      
      // Add state filter match reason
      reasons.push({ type: "state_filter_match", value: filterKeys.join(", ") })
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
    contactStates: (entity.contactStates || []).map((cs) => ({
      stateKey: cs.stateKey,
      metadata: cs.metadata as Record<string, any> | null
    })),
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
 * Build personalization data for a recipient from their contact info and states.
 * This creates a flat key-value map suitable for template rendering.
 * Supports both single key (legacy) and multiple keys.
 */
export function buildRecipientPersonalizationData(
  recipient: ResolvedRecipient,
  selectedKeys?: string | string[] | null
): Record<string, string> {
  const data: Record<string, string> = {
    "First Name": recipient.firstName || recipient.name || "",
    "Email": recipient.email
  }

  if (recipient.lastName) {
    data["Last Name"] = recipient.lastName
  }

  // Normalize to array
  const keysArray = selectedKeys 
    ? (Array.isArray(selectedKeys) ? selectedKeys : [selectedKeys])
    : []

  // Add contact states as merge fields
  for (const cs of recipient.contactStates) {
    // If specific keys are selected, only include those
    if (keysArray.length > 0) {
      if (keysArray.includes(cs.stateKey)) {
        // Flatten metadata into the data object
        if (cs.metadata && typeof cs.metadata === "object") {
          for (const [key, value] of Object.entries(cs.metadata)) {
            if (value !== null && value !== undefined) {
              data[key] = String(value)
            }
          }
        }
        // Also add the state key itself as a tag with its value
        if (cs.metadata) {
          // If metadata is a simple value, use it directly
          const metaValue = typeof cs.metadata === "object" 
            ? (Object.values(cs.metadata)[0] ?? "")
            : cs.metadata
          data[cs.stateKey] = String(metaValue)
        }
      }
    } else {
      // No specific keys selected - include all states
      if (cs.metadata && typeof cs.metadata === "object") {
        for (const [key, value] of Object.entries(cs.metadata)) {
          if (value !== null && value !== undefined) {
            data[key] = String(value)
          }
        }
      }
    }
  }

  return data
}
