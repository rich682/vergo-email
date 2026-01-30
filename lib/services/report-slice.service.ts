/**
 * ReportSlice Service
 * 
 * Manages saved filter views (slices) for reports.
 * A slice stores filter bindings (e.g., { pm: "Caleb", brand: "Chipotle" })
 * without hardcoding period, enabling quick report viewing by audience.
 * 
 * Future: Tasks will reference slices by ID to render reports with
 * slice filters + board period.
 */

import { prisma } from "@/lib/prisma"

// ============================================
// Types
// ============================================

export interface FilterBindings {
  [key: string]: unknown
}

export interface ReportSlice {
  id: string
  organizationId: string
  reportDefinitionId: string
  name: string
  filterBindings: FilterBindings
  createdAt: Date
  updatedAt: Date
  createdById: string
}

export interface CreateSliceInput {
  organizationId: string
  reportDefinitionId: string
  name: string
  filterBindings: FilterBindings
  createdById: string
}

export interface UpdateSliceInput {
  name?: string
  filterBindings?: FilterBindings
}

export interface BulkCreateSlicesInput {
  organizationId: string
  reportDefinitionId: string
  columnKey: string          // The filter column key
  values: string[]           // Unique values to create slices for
  createdById: string
  namePrefix?: string        // Optional prefix (e.g., "Location: ")
}

export interface BulkCreateSlicesResult {
  created: ReportSlice[]
  skipped: string[]  // Values that already have slices with that name
}

// ============================================
// Service
// ============================================

export class ReportSliceService {
  /**
   * List all slices for a report definition
   */
  static async listSlices(
    reportDefinitionId: string,
    organizationId: string
  ): Promise<ReportSlice[]> {
    const slices = await prisma.reportSlice.findMany({
      where: {
        reportDefinitionId,
        organizationId,
      },
      orderBy: { name: "asc" },
    })

    return slices.map(this.mapToSlice)
  }

  /**
   * Get a single slice by ID
   */
  static async getSlice(
    sliceId: string,
    organizationId: string
  ): Promise<ReportSlice | null> {
    const slice = await prisma.reportSlice.findFirst({
      where: {
        id: sliceId,
        organizationId,
      },
    })

    return slice ? this.mapToSlice(slice) : null
  }

  /**
   * Create a new slice for a report
   */
  static async createSlice(input: CreateSliceInput): Promise<ReportSlice> {
    const { organizationId, reportDefinitionId, name, filterBindings, createdById } = input

    // Verify report exists and belongs to organization
    const report = await prisma.reportDefinition.findFirst({
      where: {
        id: reportDefinitionId,
        organizationId,
      },
    })

    if (!report) {
      throw new Error("Report not found")
    }

    // Check for duplicate name
    const existing = await prisma.reportSlice.findFirst({
      where: {
        reportDefinitionId,
        name,
      },
    })

    if (existing) {
      throw new Error("A slice with this name already exists for this report")
    }

    const slice = await prisma.reportSlice.create({
      data: {
        organizationId,
        reportDefinitionId,
        name,
        filterBindings: filterBindings as any,
        createdById,
      },
    })

    return this.mapToSlice(slice)
  }

  /**
   * Update a slice
   */
  static async updateSlice(
    sliceId: string,
    organizationId: string,
    input: UpdateSliceInput
  ): Promise<ReportSlice> {
    // Verify slice exists and belongs to organization
    const existing = await prisma.reportSlice.findFirst({
      where: {
        id: sliceId,
        organizationId,
      },
    })

    if (!existing) {
      throw new Error("Slice not found")
    }

    // If renaming, check for duplicate
    if (input.name && input.name !== existing.name) {
      const duplicate = await prisma.reportSlice.findFirst({
        where: {
          reportDefinitionId: existing.reportDefinitionId,
          name: input.name,
          NOT: { id: sliceId },
        },
      })

      if (duplicate) {
        throw new Error("A slice with this name already exists for this report")
      }
    }

    const slice = await prisma.reportSlice.update({
      where: { id: sliceId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.filterBindings && { filterBindings: input.filterBindings as any }),
      },
    })

    return this.mapToSlice(slice)
  }

  /**
   * Delete a slice
   */
  static async deleteSlice(
    sliceId: string,
    organizationId: string
  ): Promise<void> {
    // Verify slice exists and belongs to organization
    const existing = await prisma.reportSlice.findFirst({
      where: {
        id: sliceId,
        organizationId,
      },
    })

    if (!existing) {
      throw new Error("Slice not found")
    }

    await prisma.reportSlice.delete({
      where: { id: sliceId },
    })
  }

  /**
   * Bulk create slices from unique values in a column
   * Creates one slice per value, skipping values that already have slices
   */
  static async createBulkSlices(input: BulkCreateSlicesInput): Promise<BulkCreateSlicesResult> {
    const { organizationId, reportDefinitionId, columnKey, values, createdById, namePrefix } = input

    // Verify report exists and belongs to organization
    const report = await prisma.reportDefinition.findFirst({
      where: {
        id: reportDefinitionId,
        organizationId,
      },
    })

    if (!report) {
      throw new Error("Report not found")
    }

    // Get existing slice names to check for duplicates
    const existingSlices = await prisma.reportSlice.findMany({
      where: {
        reportDefinitionId,
        organizationId,
      },
      select: { name: true },
    })
    const existingNames = new Set(existingSlices.map(s => s.name))

    const created: ReportSlice[] = []
    const skipped: string[] = []

    // Create slices for each value
    for (const value of values) {
      const sliceName = namePrefix ? `${namePrefix}${value}` : value

      // Skip if a slice with this name already exists
      if (existingNames.has(sliceName)) {
        skipped.push(value)
        continue
      }

      const slice = await prisma.reportSlice.create({
        data: {
          organizationId,
          reportDefinitionId,
          name: sliceName,
          filterBindings: { [columnKey]: value } as any,
          createdById,
        },
      })

      created.push(this.mapToSlice(slice))
      existingNames.add(sliceName) // Track in case of duplicate values in input
    }

    return { created, skipped }
  }

  /**
   * Map Prisma result to typed ReportSlice
   */
  private static mapToSlice(data: any): ReportSlice {
    return {
      id: data.id,
      organizationId: data.organizationId,
      reportDefinitionId: data.reportDefinitionId,
      name: data.name,
      filterBindings: (data.filterBindings || {}) as FilterBindings,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      createdById: data.createdById,
    }
  }
}
