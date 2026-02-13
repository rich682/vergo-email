/**
 * Form Definition Service
 * 
 * Business logic for managing form definitions (templates).
 * Forms are linked to databases where responses are stored.
 */

import { prisma } from "@/lib/prisma"
import type { 
  FormField, 
  FormSettings, 
  CreateFormDefinitionInput, 
  UpdateFormDefinitionInput,
  DEFAULT_FORM_SETTINGS 
} from "@/lib/types/form"

// Default settings for new forms
const defaultSettings: FormSettings = {
  allowEdit: false,
  enforceDeadline: false,
}

export class FormDefinitionService {
  /**
   * Create a new form definition
   */
  static async create(
    organizationId: string,
    createdById: string,
    input: CreateFormDefinitionInput
  ) {
    // Validate fields if provided
    if (input.fields && input.fields.length > 0) {
      this.validateFields(input.fields)
    }

    // If database is specified, validate it exists and belongs to org
    if (input.databaseId) {
      const database = await prisma.database.findFirst({
        where: {
          id: input.databaseId,
          organizationId,
        },
      })
      if (!database) {
        throw new Error("Database not found or access denied")
      }
    }

    const form = await prisma.formDefinition.create({
      data: {
        name: input.name,
        description: input.description,
        organizationId,
        createdById,
        fields: (input.fields || []) as any,
        settings: { ...defaultSettings, ...input.settings },
        databaseId: input.databaseId,
        columnMapping: input.columnMapping || {},
      },
      include: {
        database: {
          select: {
            id: true,
            name: true,
            schema: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            formRequests: true,
          },
        },
      },
    })

    return form
  }

  /**
   * Find a form definition by ID
   */
  static async findById(id: string, organizationId: string) {
    const form = await prisma.formDefinition.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        database: {
          select: {
            id: true,
            name: true,
            schema: true,
            rowCount: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        viewers: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { addedAt: "asc" as const },
        },
        _count: {
          select: {
            formRequests: true,
          },
        },
      },
    })

    return form
  }

  /**
   * Find all form definitions for an organization
   */
  static async findAll(organizationId: string) {
    const forms = await prisma.formDefinition.findMany({
      where: {
        organizationId,
      },
      include: {
        database: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            formRequests: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return forms
  }

  /**
   * Update a form definition
   */
  static async update(
    id: string,
    organizationId: string,
    input: UpdateFormDefinitionInput
  ) {
    // Verify form exists and belongs to org
    const existing = await prisma.formDefinition.findFirst({
      where: {
        id,
        organizationId,
      },
    })

    if (!existing) {
      throw new Error("Form not found or access denied")
    }

    // Validate fields if provided
    if (input.fields) {
      this.validateFields(input.fields)
    }

    // If database is being changed, validate it
    if (input.databaseId !== undefined && input.databaseId !== null) {
      const database = await prisma.database.findFirst({
        where: {
          id: input.databaseId,
          organizationId,
        },
      })
      if (!database) {
        throw new Error("Database not found or access denied")
      }
    }

    // Merge settings if provided
    const existingSettings = existing.settings as unknown as FormSettings || defaultSettings
    const newSettings = input.settings 
      ? { ...existingSettings, ...input.settings }
      : existingSettings

    const form = await prisma.formDefinition.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.fields !== undefined && { fields: input.fields as any }),
        ...(input.settings !== undefined && { settings: newSettings }),
        ...(input.databaseId !== undefined && { databaseId: input.databaseId }),
        ...(input.columnMapping !== undefined && { columnMapping: input.columnMapping }),
      } as any,
      include: {
        database: {
          select: {
            id: true,
            name: true,
            schema: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            formRequests: true,
          },
        },
      },
    })

    return form
  }

  /**
   * Delete a form definition
   */
  static async delete(id: string, organizationId: string) {
    // Verify form exists and belongs to org
    const existing = await prisma.formDefinition.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        _count: {
          select: {
            formRequests: true,
          },
        },
      },
    })

    if (!existing) {
      throw new Error("Form not found or access denied")
    }

    // Warn if there are existing requests (but still allow deletion)
    if (existing._count.formRequests > 0) {
      console.warn(`Deleting form ${id} with ${existing._count.formRequests} associated requests`)
    }

    await prisma.formDefinition.delete({
      where: { id },
    })

    return { success: true, deletedId: id }
  }

  /**
   * Validate form fields
   */
  static validateFields(fields: FormField[]): void {
    if (!Array.isArray(fields)) {
      throw new Error("Fields must be an array")
    }

    const keys = new Set<string>()
    const validTypes = ["text", "longText", "number", "currency", "date", "dropdown", "checkbox", "file"]

    for (const field of fields) {
      // Check required properties
      if (!field.key || typeof field.key !== "string") {
        throw new Error("Each field must have a string key")
      }
      if (!field.label || typeof field.label !== "string") {
        throw new Error(`Field "${field.key}" must have a string label`)
      }
      if (!validTypes.includes(field.type)) {
        throw new Error(`Field "${field.key}" has invalid type "${field.type}"`)
      }
      if (typeof field.required !== "boolean") {
        throw new Error(`Field "${field.key}" must have a boolean required property`)
      }
      if (typeof field.order !== "number") {
        throw new Error(`Field "${field.key}" must have a numeric order`)
      }

      // Check for duplicate keys
      if (keys.has(field.key)) {
        throw new Error(`Duplicate field key: "${field.key}"`)
      }
      keys.add(field.key)

      // Dropdown must have options
      if (field.type === "dropdown") {
        if (!field.options || !Array.isArray(field.options) || field.options.length === 0) {
          throw new Error(`Dropdown field "${field.key}" must have at least one option`)
        }
      }
    }
  }

  /**
   * Generate column mapping from form fields to database columns
   * Matches fields to columns by key or creates new column keys
   */
  static generateColumnMapping(
    fields: FormField[],
    databaseSchema: { columns: Array<{ key: string; label: string }> }
  ): Record<string, string> {
    const mapping: Record<string, string> = {}
    const dbColumns = databaseSchema.columns || []

    for (const field of fields) {
      // Try to find a matching database column by key
      const matchByKey = dbColumns.find(
        col => col.key.toLowerCase() === field.key.toLowerCase()
      )
      if (matchByKey) {
        mapping[field.key] = matchByKey.key
        continue
      }

      // Try to find a matching database column by label
      const matchByLabel = dbColumns.find(
        col => col.label.toLowerCase() === field.label.toLowerCase()
      )
      if (matchByLabel) {
        mapping[field.key] = matchByLabel.key
        continue
      }

      // Use the field key as the column key (will need to create column)
      mapping[field.key] = field.key
    }

    return mapping
  }

  /**
   * Get form definition count for an organization
   */
  static async getCount(organizationId: string): Promise<number> {
    return prisma.formDefinition.count({
      where: { organizationId },
    })
  }

  /**
   * Set viewers for a form definition (replaces full list)
   */
  static async setViewers(
    formDefinitionId: string,
    organizationId: string,
    userIds: string[],
    addedBy: string
  ) {
    const form = await prisma.formDefinition.findFirst({
      where: { id: formDefinitionId, organizationId },
    })
    if (!form) {
      throw new Error("Form definition not found")
    }

    await prisma.$transaction([
      prisma.formDefinitionViewer.deleteMany({
        where: { formDefinitionId },
      }),
      ...(userIds.length > 0
        ? [
            prisma.formDefinitionViewer.createMany({
              data: userIds.map((userId) => ({
                formDefinitionId,
                userId,
                addedBy,
              })),
            }),
          ]
        : []),
    ])

    const viewers = await prisma.formDefinitionViewer.findMany({
      where: { formDefinitionId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { addedAt: "asc" },
    })

    return viewers
  }

  /**
   * Check if a user is a viewer of a form definition
   */
  static async isViewer(formDefinitionId: string, userId: string): Promise<boolean> {
    const viewer = await prisma.formDefinitionViewer.findFirst({
      where: { formDefinitionId, userId },
      select: { id: true },
    })
    return !!viewer
  }
}
