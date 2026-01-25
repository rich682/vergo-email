import { prisma } from "@/lib/prisma"
import type { JobLabel, JobContactLabel, Entity } from "@prisma/client"

// Types for metadata schema
export interface MetadataFieldSchema {
  key: string      // e.g., "invoice_number"
  label: string    // e.g., "Invoice #"
  type: "text" | "number" | "date" | "currency"
}

export interface CreateLabelInput {
  jobId: string
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
  jobLabelId: string
  entityIds: string[]
  metadata?: Record<string, string | number | null>
}

export interface ContactWithLabels extends Entity {
  jobLabels: Array<{
    id: string
    metadata: Record<string, string | number | null>
    jobLabel: {
      id: string
      name: string
      color: string | null
      metadataSchema: MetadataFieldSchema[]
    }
  }>
}

export class JobLabelService {
  /**
   * Create a new label for a job
   */
  static async createLabel(input: CreateLabelInput): Promise<JobLabel> {
    const { jobId, organizationId, name, color, metadataSchema = [] } = input

    // Normalize the name (lowercase, trim)
    const normalizedName = name.trim().toLowerCase()

    return prisma.jobLabel.create({
      data: {
        jobId,
        organizationId,
        name: normalizedName,
        color: color || null,
        metadataSchema: metadataSchema as any,
      },
    })
  }

  /**
   * Get all labels for a job
   */
  static async getLabelsForJob(jobId: string): Promise<JobLabel[]> {
    return prisma.jobLabel.findMany({
      where: { jobId },
      orderBy: { name: "asc" },
    })
  }

  /**
   * Get a single label by ID
   */
  static async getLabelById(
    labelId: string,
    organizationId: string
  ): Promise<JobLabel | null> {
    return prisma.jobLabel.findFirst({
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
  ): Promise<JobLabel | null> {
    const existing = await prisma.jobLabel.findFirst({
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

    return prisma.jobLabel.update({
      where: { id: labelId },
      data: updateData,
    })
  }

  /**
   * Delete a label (cascades to all contact-label associations)
   */
  static async deleteLabel(
    labelId: string,
    organizationId: string
  ): Promise<boolean> {
    const existing = await prisma.jobLabel.findFirst({
      where: { id: labelId, organizationId },
    })

    if (!existing) return false

    await prisma.jobLabel.delete({
      where: { id: labelId },
    })

    return true
  }

  /**
   * Apply a label to one or more contacts
   */
  static async applyLabelToContacts(
    input: ApplyLabelInput
  ): Promise<JobContactLabel[]> {
    const { jobLabelId, entityIds, metadata = {} } = input

    // Use upsert to handle both new and existing associations
    const results = await Promise.all(
      entityIds.map((entityId) =>
        prisma.jobContactLabel.upsert({
          where: {
            jobLabelId_entityId: {
              jobLabelId,
              entityId,
            },
          },
          create: {
            jobLabelId,
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
  ): Promise<JobContactLabel | null> {
    return prisma.jobContactLabel.update({
      where: { id: contactLabelId },
      data: { metadata: metadata as any },
    })
  }

  /**
   * Remove a label from a contact
   */
  static async removeLabelFromContact(
    jobLabelId: string,
    entityId: string
  ): Promise<boolean> {
    try {
      await prisma.jobContactLabel.delete({
        where: {
          jobLabelId_entityId: {
            jobLabelId,
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
   * Get all contacts for a job with their labels
   * This resolves stakeholders and includes their label assignments
   */
  static async getContactsWithLabels(
    jobId: string,
    organizationId: string
  ): Promise<ContactWithLabels[]> {
    // First, get the job to access stakeholders
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { labels: true },
    })

    if (!job) return []

    // Get stakeholder definitions from job.labels
    const labels = job.labels as { stakeholders?: Array<{ type: string; id: string }> } | null
    const stakeholders = labels?.stakeholders || []

    if (stakeholders.length === 0) return []

    // Resolve all entity IDs from stakeholders
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

    // Fetch entities with their job labels
    const entities = await prisma.entity.findMany({
      where: {
        id: { in: Array.from(entityIds) },
        organizationId,
      },
      include: {
        jobLabels: {
          where: {
            jobLabel: { jobId },
          },
          include: {
            jobLabel: {
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

    // Transform to match our interface
    return entities.map((entity) => ({
      ...entity,
      jobLabels: entity.jobLabels.map((jl) => ({
        id: jl.id,
        metadata: jl.metadata as Record<string, string | number | null>,
        jobLabel: {
          ...jl.jobLabel,
          metadataSchema: jl.jobLabel.metadataSchema as MetadataFieldSchema[],
        },
      })),
    }))
  }

  /**
   * Get contacts filtered by a specific label
   */
  static async getContactsByLabel(
    jobLabelId: string,
    organizationId: string
  ): Promise<Entity[]> {
    const contactLabels = await prisma.jobContactLabel.findMany({
      where: { jobLabelId },
      include: {
        entity: true,
      },
    })

    return contactLabels
      .filter((cl) => cl.entity.organizationId === organizationId)
      .map((cl) => cl.entity)
  }

  /**
   * Get label statistics for a job
   */
  static async getLabelStats(
    jobId: string
  ): Promise<Array<{ labelId: string; name: string; count: number }>> {
    const labels = await prisma.jobLabel.findMany({
      where: { jobId },
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
