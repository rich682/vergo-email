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

type ResolvedRecipient = {
  email: string
  name?: string | null
  entityId?: string
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

  const recipients: ResolvedRecipient[] = filteredEntities.map((entity) => ({
    email: entity.email as string,
    name: entity.firstName,
    entityId: entity.id
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
