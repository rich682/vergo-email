import { prisma } from "@/lib/prisma"
import type { TaskInstanceLabel, TaskInstanceContactLabel, Entity } from "@prisma/client"

// Types for metadata schema
export interface MetadataFieldSchema {
  key: string      // e.g., "invoice_number"
  label: string    // e.g., "Invoice #"
  type: "text" | "number" | "date" | "currency"
}

export interface CreateLabelInput {
  taskInstanceId: string
  organizationId: string
  name: string
  color?: string
  metadataSchema?: MetadataFieldSchema[]
}

export interface UpdateLabelInput {
  name?: string
  color?: string
  metadataSchema?: MetadataFieldSchema[]
}

export interface ApplyLabelInput {
  taskInstanceLabelId: string
  entityIds: string[]
  metadata?: Record<string, string | number | null>
}

export interface ContactWithLabels extends Entity {
  taskInstanceLabels: Array<{
    id: string
    metadata: Record<string, string | number | null>
    taskInstanceLabel: {
      id: string
      name: string
      color: string | null
      metadataSchema: MetadataFieldSchema[]
    }
  }>
}

export class TaskInstanceLabelService {
  /**
   * Create a new label for a task instance
   */
  static async createLabel(input: CreateLabelInput): Promise<TaskInstanceLabel> {
    const { taskInstanceId, organizationId, name, color, metadataSchema = [] } = input

    // Normalize the name (lowercase, trim)
    const normalizedName = name.trim().toLowerCase()

    return prisma.taskInstanceLabel.create({
      data: {
        taskInstanceId,
        organizationId,
        name: normalizedName,
        color: color || null,
        metadataSchema: metadataSchema as any,
      },
    })
  }

  /**
   * Get all labels for a task instance
   */
  static async getLabelsForInstance(taskInstanceId: string): Promise<TaskInstanceLabel[]> {
    return prisma.taskInstanceLabel.findMany({
      where: { taskInstanceId },
      orderBy: { name: "asc" },
    })
  }

  /**
   * Get a single label by ID
   */
  static async getLabelById(
    labelId: string,
    organizationId: string
  ): Promise<TaskInstanceLabel | null> {
    return prisma.taskInstanceLabel.findFirst({
      where: {
        id: labelId,
        organizationId,
      },
    })
  }

  /**
   * Update a label
   */
  static async updateLabel(
    labelId: string,
    organizationId: string,
    input: UpdateLabelInput
  ): Promise<TaskInstanceLabel | null> {
    const existing = await prisma.taskInstanceLabel.findFirst({
      where: { id: labelId, organizationId },
    })

    if (!existing) return null

    const updateData: any = {}
    if (input.name !== undefined) {
      updateData.name = input.name.trim().toLowerCase()
    }
    if (input.color !== undefined) {
      updateData.color = input.color
    }
    if (input.metadataSchema !== undefined) {
      updateData.metadataSchema = input.metadataSchema
    }

    return prisma.taskInstanceLabel.update({
      where: { id: labelId },
      data: updateData,
    })
  }

  /**
   * Delete a label
   */
  static async deleteLabel(
    labelId: string,
    organizationId: string
  ): Promise<boolean> {
    const existing = await prisma.taskInstanceLabel.findFirst({
      where: { id: labelId, organizationId },
    })

    if (!existing) return false

    await prisma.taskInstanceLabel.delete({
      where: { id: labelId },
    })

    return true
  }

  /**
   * Apply a label to one or more contacts
   */
  static async applyLabelToContacts(
    input: ApplyLabelInput
  ): Promise<TaskInstanceContactLabel[]> {
    const { taskInstanceLabelId, entityIds, metadata = {} } = input

    // Use upsert to handle both new and existing associations
    const results = await Promise.all(
      entityIds.map((entityId) =>
        prisma.taskInstanceContactLabel.upsert({
          where: {
            taskInstanceLabelId_entityId: {
              taskInstanceLabelId,
              entityId,
            },
          },
          create: {
            taskInstanceLabelId,
            entityId,
            metadata: metadata as any,
          },
          update: {
            metadata: metadata as any,
          },
        })
      )
    )

    return results
  }

  /**
   * Update metadata for a specific contact-label association
   */
  static async updateContactLabelMetadata(
    contactLabelId: string,
    metadata: Record<string, string | number | null>
  ): Promise<TaskInstanceContactLabel | null> {
    return prisma.taskInstanceContactLabel.update({
      where: { id: contactLabelId },
      data: { metadata: metadata as any },
    })
  }

  /**
   * Remove a label from a contact
   */
  static async removeLabelFromContact(
    taskInstanceLabelId: string,
    entityId: string
  ): Promise<boolean> {
    try {
      await prisma.taskInstanceContactLabel.delete({
        where: {
          taskInstanceLabelId_entityId: {
            taskInstanceLabelId,
            entityId,
          },
        },
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get all contacts for a task instance with their labels
   */
  static async getContactsWithLabels(
    taskInstanceId: string,
    organizationId: string
  ): Promise<ContactWithLabels[]> {
    const instance = await prisma.taskInstance.findUnique({
      where: { id: taskInstanceId },
      select: { labels: true },
    })

    if (!instance) return []

    const labels = instance.labels as { stakeholders?: Array<{ type: string; id: string }> } | null
    const stakeholders = labels?.stakeholders || []

    if (stakeholders.length === 0) return []

    const entityIds = new Set<string>()

    for (const stakeholder of stakeholders) {
      if (stakeholder.type === "individual") {
        entityIds.add(stakeholder.id)
      } else if (stakeholder.type === "group") {
        const groupEntities = await prisma.entity.findMany({
          where: {
            organizationId,
            groups: { some: { groupId: stakeholder.id } },
          },
          select: { id: true },
        })
        groupEntities.forEach((e) => entityIds.add(e.id))
      } else if (stakeholder.type === "contact_type") {
        const typeEntities = await prisma.entity.findMany({
          where: {
            organizationId,
            contactType: stakeholder.id as any,
          },
          select: { id: true },
        })
        typeEntities.forEach((e) => entityIds.add(e.id))
      }
    }

    const entities = await prisma.entity.findMany({
      where: {
        id: { in: Array.from(entityIds) },
        organizationId,
      },
      include: {
        taskInstanceLabels: {
          where: {
            taskInstanceLabel: { taskInstanceId },
          },
          include: {
            taskInstanceLabel: {
              select: {
                id: true,
                name: true,
                color: true,
                metadataSchema: true,
              },
            },
          },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    })

    return entities.map((entity) => ({
      ...entity,
      taskInstanceLabels: entity.taskInstanceLabels.map((tl) => ({
        id: tl.id,
        metadata: tl.metadata as Record<string, string | number | null>,
        taskInstanceLabel: {
          ...tl.taskInstanceLabel,
          metadataSchema: tl.taskInstanceLabel.metadataSchema as unknown as MetadataFieldSchema[],
        },
      })),
    }))
  }

  /**
   * Get contacts filtered by a specific label
   */
  static async getContactsByLabel(
    taskInstanceLabelId: string,
    organizationId: string
  ): Promise<Entity[]> {
    const contactLabels = await prisma.taskInstanceContactLabel.findMany({
      where: { taskInstanceLabelId },
      include: {
        entity: true,
      },
    })

    return contactLabels
      .filter((cl) => cl.entity.organizationId === organizationId)
      .map((cl) => cl.entity)
  }

  /**
   * Get label statistics for a task instance
   */
  static async getLabelStats(
    taskInstanceId: string
  ): Promise<Array<{ labelId: string; name: string; count: number }>> {
    const labels = await prisma.taskInstanceLabel.findMany({
      where: { taskInstanceId },
      include: {
        _count: {
          select: { contactLabels: true },
        },
      },
    })

    return labels.map((label) => ({
      labelId: label.id,
      name: label.name,
      count: label._count.contactLabels,
    }))
  }
}
