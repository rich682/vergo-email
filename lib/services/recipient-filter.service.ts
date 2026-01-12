import { prisma } from "@/lib/prisma"

export type RecipientFilter = {
  stateKey: string
  mode: "has" | "missing"
}

export type RecipientSelection = {
  entityIds?: string[]
  groupIds?: string[]
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

  const [directEntities, groupEntities] = await Promise.all([
    entityIds.length
      ? prisma.entity.findMany({
          where: { organizationId, id: { in: entityIds } },
          include: { contactStates: true }
        })
      : Promise.resolve([]),
    groupIds.length
      ? prisma.entity.findMany({
          where: {
            organizationId,
            groups: { some: { groupId: { in: groupIds } } }
          },
          include: { contactStates: true }
        })
      : Promise.resolve([])
  ])

  // Deduplicate by email (case-insensitive)
  const dedupedByEmail = new Map<string, (typeof directEntities)[number]>()
  for (const entity of [...directEntities, ...groupEntities]) {
    if (!entity.email) continue
    dedupedByEmail.set(entity.email.toLowerCase(), entity)
  }

  const baseEntities = Array.from(dedupedByEmail.values())

  const filteredEntities = selection.stateFilter?.stateKey
    ? baseEntities.filter((entity) => {
        const hasState = (entity.contactStates || []).some(
          (cs) => cs.stateKey === selection.stateFilter?.stateKey
        )
        return selection.stateFilter?.mode === "missing" ? !hasState : hasState
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
 */
export function buildRecipientPersonalizationData(
  recipient: ResolvedRecipient,
  selectedSliceKey?: string | null
): Record<string, string> {
  const data: Record<string, string> = {
    "First Name": recipient.firstName || recipient.name || "",
    "Email": recipient.email
  }

  if (recipient.lastName) {
    data["Last Name"] = recipient.lastName
  }

  // Add all contact states as potential merge fields
  for (const cs of recipient.contactStates) {
    // If a specific slice is selected, prioritize it
    if (selectedSliceKey && cs.stateKey === selectedSliceKey) {
      // Flatten metadata into the data object
      if (cs.metadata && typeof cs.metadata === "object") {
        for (const [key, value] of Object.entries(cs.metadata)) {
          if (value !== null && value !== undefined) {
            data[key] = String(value)
          }
        }
      }
      // Also add the slice key itself as a tag
      data[cs.stateKey] = cs.metadata ? JSON.stringify(cs.metadata) : ""
    } else if (!selectedSliceKey) {
      // No specific slice selected - include all states
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
