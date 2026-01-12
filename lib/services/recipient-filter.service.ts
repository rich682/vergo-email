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

export type ResolvedRecipient = {
  email: string
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  entityId?: string
  contactStates: ContactStateData[]
}

type ResolveResult = {
  recipients: ResolvedRecipient[]
  counts: {
    total: number
    included: number
    excluded: number
  }
}

export async function resolveRecipientsWithFilter(
  organizationId: string,
  selection: RecipientSelection
): Promise<ResolveResult> {
  const entityIds = selection.entityIds?.filter(Boolean) || []
  const groupIds = selection.groupIds?.filter(Boolean) || []
  const contactTypes = selection.contactTypes?.filter(Boolean) || []

  const [directEntities, groupEntities, typeEntities] = await Promise.all([
    // Direct entity selection
    entityIds.length
      ? prisma.entity.findMany({
          where: { organizationId, id: { in: entityIds } },
          include: { contactStates: true }
        })
      : Promise.resolve([]),
    // Entities from groups (used as filter if contactTypes are selected)
    groupIds.length
      ? prisma.entity.findMany({
          where: {
            organizationId,
            groups: { some: { groupId: { in: groupIds } } }
          },
          include: { contactStates: true }
        })
      : Promise.resolve([]),
    // Entities by contact type
    contactTypes.length
      ? prisma.entity.findMany({
          where: {
            organizationId,
            contactType: { in: contactTypes as any[] }
          },
          include: { contactStates: true }
        })
      : Promise.resolve([])
  ])

  // Combine entities based on selection logic:
  // - If contactTypes are selected, start with those entities
  // - If groups are also selected, filter to only entities in those groups
  // - Direct entityIds are always included
  let combinedEntities: typeof directEntities = []
  
  if (contactTypes.length > 0) {
    // Start with type-based entities
    let typeBasedEntities = typeEntities
    
    // If groups are selected, filter to only entities in those groups
    if (groupIds.length > 0) {
      const groupEntityIds = new Set(groupEntities.map(e => e.id))
      typeBasedEntities = typeEntities.filter(e => groupEntityIds.has(e.id))
    }
    
    combinedEntities = [...typeBasedEntities, ...directEntities]
  } else if (groupIds.length > 0) {
    // No types selected, but groups are - use group entities
    combinedEntities = [...groupEntities, ...directEntities]
  } else {
    // Only direct entities
    combinedEntities = directEntities
  }

  // Deduplicate by email (case-insensitive)
  const dedupedByEmail = new Map<string, (typeof directEntities)[number]>()
  for (const entity of combinedEntities) {
    if (!entity.email) continue
    dedupedByEmail.set(entity.email.toLowerCase(), entity)
  }

  const baseEntities = Array.from(dedupedByEmail.values())

  // Get filter keys - support both legacy single key and multiple keys
  const filterKeys = selection.stateFilter?.stateKeys?.length 
    ? selection.stateFilter.stateKeys 
    : selection.stateFilter?.stateKey 
      ? [selection.stateFilter.stateKey]
      : []

  // Apply filter if keys are specified and mode is "has"
  const filteredEntities = filterKeys.length > 0 && selection.stateFilter?.mode === "has"
    ? baseEntities.filter((entity) => {
        // Check if entity has ALL selected state keys
        const entityStateKeys = new Set((entity.contactStates || []).map(cs => cs.stateKey))
        return filterKeys.every(key => entityStateKeys.has(key))
      })
    : baseEntities

  // Build recipients with full contact data including contactStates
  const recipients: ResolvedRecipient[] = filteredEntities
    .filter((entity) => entity.email) // Exclude entities without email
    .map((entity) => ({
      email: entity.email as string,
      name: entity.firstName,
      firstName: entity.firstName,
      lastName: entity.lastName,
      entityId: entity.id,
      contactStates: (entity.contactStates || []).map((cs) => ({
        stateKey: cs.stateKey,
        metadata: cs.metadata as Record<string, any> | null
      }))
    }))

  return {
    recipients,
    counts: {
      total: baseEntities.length,
      included: recipients.length,
      excluded: Math.max(0, baseEntities.length - recipients.length)
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
