/**
 * Dataset Service
 * 
 * Provides CRUD operations for DatasetTemplates and DatasetSnapshots.
 * Handles schema validation, identity key enforcement, diff computation,
 * and stakeholder matching.
 */

import { prisma } from "@/lib/prisma"
import { DatasetTemplate, DatasetSnapshot, Prisma } from "@prisma/client"

// ============================================
// Types
// ============================================

export interface SchemaColumn {
  key: string
  label: string
  type: "text" | "number" | "date" | "boolean" | "currency"
  required: boolean
}

export interface StakeholderMapping {
  columnKey: string
  matchedField: "email"
}

// Identity configuration types
export type ColumnIdentitySource = "headers"  // V1 only; future values reserved

export interface IdentityConfig {
  orientation: "row" | "column"
  rowKey: string                              // Always required (row labels / line items)
  columnIdentitySource?: ColumnIdentitySource // Only for column orientation
}

export interface DatasetTemplateInput {
  name: string
  description?: string
  schema: SchemaColumn[]
  identity: IdentityConfig                    // New: structured identity config
  identityKey?: string                        // Legacy: for backwards compatibility
  stakeholderMapping?: StakeholderMapping | null
}

/**
 * Get the identity configuration from a template, with fallback to legacy identityKey
 */
export function getIdentityConfig(template: DatasetTemplate): IdentityConfig {
  const identity = template.identity as IdentityConfig | null
  if (identity) {
    return identity
  }
  // Fallback for un-migrated data
  return { orientation: "row", rowKey: template.identityKey }
}

export interface MatchedStakeholder {
  rowIdentity: string
  userId: string
  email: string
}

export interface UnmatchedStakeholder {
  rowIdentity: string
  email: string
}

export interface StakeholderResults {
  matched: MatchedStakeholder[]
  unmatched: UnmatchedStakeholder[]
}

export interface DiffSummary {
  addedCount: number
  removedCount: number
  addedIdentities: string[]
  removedIdentities: string[]
}

export interface ColumnValidation {
  column: string
  valid: boolean
  errors?: string[]
}

export interface IdentityValidation {
  valid: boolean
  // Row-based validation
  duplicates: string[]       // Duplicate rowKey values (row-based only)
  emptyCount: number         // Empty rowKey values
  // Column-based validation
  duplicateHeaders?: string[] // Duplicate column headers (column-based only)
  emptyRowLabels?: number     // Empty row labels (column-based only)
}

export interface SnapshotPreviewResult {
  parsedRows: Record<string, unknown>[]
  rowCount: number
  columnValidation: ColumnValidation[]
  identityValidation: IdentityValidation
  stakeholderMapping?: StakeholderResults
  diffSummary?: DiffSummary
}

export interface SnapshotPreviewError {
  error: string
  code: "INVALID_CSV" | "SCHEMA_MISMATCH" | "IDENTITY_DUPLICATES" | "PARSE_ERROR" | "TOO_MANY_ROWS" | "EMPTY_ROWS"
}

// ============================================
// Constants
// ============================================

/** Maximum number of rows allowed in a dataset snapshot */
export const MAX_DATASET_ROWS = 10000

// ============================================
// Service
// ============================================

export class DatasetService {
  // ----------------------------------------
  // Template CRUD
  // ----------------------------------------

  /**
   * Create a new dataset template
   */
  static async createTemplate(
    orgId: string,
    userId: string,
    input: DatasetTemplateInput
  ): Promise<DatasetTemplate> {
    // Resolve identity config (support both new and legacy input)
    const identity: IdentityConfig = input.identity ?? {
      orientation: "row",
      rowKey: input.identityKey!
    }

    // Validate rowKey exists in schema
    const schemaKeys = input.schema.map(col => col.key)
    if (!schemaKeys.includes(identity.rowKey)) {
      throw new Error(`Row key "${identity.rowKey}" must be one of the schema columns`)
    }

    // Validate column-based identity config
    if (identity.orientation === "column" && !identity.columnIdentitySource) {
      throw new Error(`Column-based orientation requires columnIdentitySource to be set`)
    }

    // Validate stakeholder mapping column exists if provided
    if (input.stakeholderMapping && !schemaKeys.includes(input.stakeholderMapping.columnKey)) {
      throw new Error(`Stakeholder mapping column "${input.stakeholderMapping.columnKey}" must be one of the schema columns`)
    }

    return prisma.datasetTemplate.create({
      data: {
        organizationId: orgId,
        createdById: userId,
        name: input.name,
        description: input.description,
        schema: input.schema as unknown as Prisma.InputJsonValue,
        identityKey: identity.rowKey, // Keep for backwards compatibility
        identity: identity as unknown as Prisma.InputJsonValue,
        stakeholderMapping: input.stakeholderMapping as unknown as Prisma.InputJsonValue,
      },
    })
  }

  /**
   * Update a template's schema and identity configuration
   * 
   * When snapshots exist, breaking changes are blocked:
   * - Cannot remove the current rowKey column
   * - Cannot change rowKey to a column that didn't exist before
   * - Cannot change orientation
   */
  static async updateSchema(
    templateId: string,
    orgId: string,
    schema: SchemaColumn[],
    identityOrKey: IdentityConfig | string, // Support both new and legacy
    stakeholderMapping?: StakeholderMapping | null
  ): Promise<DatasetTemplate> {
    // Resolve identity config (support both new object and legacy string)
    const identity: IdentityConfig = typeof identityOrKey === "string"
      ? { orientation: "row", rowKey: identityOrKey }
      : identityOrKey

    // Validate rowKey exists in schema
    const schemaKeys = schema.map(col => col.key)
    if (!schemaKeys.includes(identity.rowKey)) {
      throw new Error(`Row key "${identity.rowKey}" must be one of the schema columns`)
    }

    // Validate column-based identity config
    if (identity.orientation === "column" && !identity.columnIdentitySource) {
      throw new Error(`Column-based orientation requires columnIdentitySource to be set`)
    }

    // Validate stakeholder mapping column exists if provided
    if (stakeholderMapping && !schemaKeys.includes(stakeholderMapping.columnKey)) {
      throw new Error(`Stakeholder mapping column "${stakeholderMapping.columnKey}" must be one of the schema columns`)
    }

    // Get existing template to check for breaking changes
    const existingTemplate = await prisma.datasetTemplate.findFirst({
      where: {
        id: templateId,
        organizationId: orgId,
      },
      include: {
        _count: {
          select: { snapshots: true },
        },
      },
    })

    if (!existingTemplate) {
      throw new Error("Template not found")
    }

    // If snapshots exist, guard against breaking changes
    if (existingTemplate._count.snapshots > 0) {
      const existingSchema = existingTemplate.schema as unknown as SchemaColumn[]
      const existingSchemaKeys = existingSchema.map(col => col.key)
      const existingIdentity = getIdentityConfig(existingTemplate)

      // Cannot change orientation when snapshots exist
      if (identity.orientation !== existingIdentity.orientation) {
        throw new Error(
          `Cannot change identity orientation from "${existingIdentity.orientation}" to "${identity.orientation}" when snapshots exist. ` +
          `Delete all snapshots first.`
        )
      }

      // Cannot remove the current rowKey column
      if (!schemaKeys.includes(existingIdentity.rowKey)) {
        throw new Error(
          `Cannot remove row key column "${existingIdentity.rowKey}" when snapshots exist. ` +
          `Delete all snapshots first or keep this column.`
        )
      }

      // Cannot change rowKey to a column that didn't exist in prior schema
      if (identity.rowKey !== existingIdentity.rowKey && !existingSchemaKeys.includes(identity.rowKey)) {
        throw new Error(
          `Cannot change row key to new column "${identity.rowKey}" when snapshots exist. ` +
          `The row key must be an existing column from the original schema.`
        )
      }
    }

    return prisma.datasetTemplate.update({
      where: {
        id: templateId,
        organizationId: orgId,
      },
      data: {
        schema: schema as unknown as Prisma.InputJsonValue,
        identityKey: identity.rowKey, // Keep for backwards compatibility
        identity: identity as unknown as Prisma.InputJsonValue,
        stakeholderMapping: stakeholderMapping as unknown as Prisma.InputJsonValue,
      },
    })
  }

  /**
   * List all templates for an organization
   */
  static async listTemplates(orgId: string): Promise<(DatasetTemplate & { _count: { snapshots: number }, latestSnapshot?: { createdAt: Date, rowCount: number } | null })[]> {
    const templates = await prisma.datasetTemplate.findMany({
      where: {
        organizationId: orgId,
        isArchived: false,
      },
      include: {
        _count: {
          select: { snapshots: true },
        },
        snapshots: {
          where: { isLatest: true },
          take: 1,
          select: {
            createdAt: true,
            rowCount: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return templates.map(t => ({
      ...t,
      latestSnapshot: t.snapshots[0] || null,
      snapshots: undefined as never, // Remove the snapshots array from the return type
    }))
  }

  /**
   * Get a single template by ID
   */
  static async getTemplate(
    templateId: string,
    orgId: string
  ): Promise<(DatasetTemplate & { _count: { snapshots: number } }) | null> {
    return prisma.datasetTemplate.findFirst({
      where: {
        id: templateId,
        organizationId: orgId,
      },
      include: {
        _count: {
          select: { snapshots: true },
        },
      },
    })
  }

  /**
   * Archive a template (soft delete)
   */
  static async archiveTemplate(templateId: string, orgId: string): Promise<DatasetTemplate> {
    return prisma.datasetTemplate.update({
      where: {
        id: templateId,
        organizationId: orgId,
      },
      data: {
        isArchived: true,
      },
    })
  }

  // ----------------------------------------
  // Template Download
  // ----------------------------------------

  /**
   * Generate a CSV template from schema
   */
  static async downloadTemplate(templateId: string, orgId: string): Promise<string> {
    const template = await this.getTemplate(templateId, orgId)
    if (!template) {
      throw new Error("Template not found")
    }

    const schema = template.schema as unknown as SchemaColumn[]
    
    // Build CSV header row using column labels
    // Note: Identity key is already visible in the UI schema display
    const headers = schema.map(col => col.label)

    return headers.join(",") + "\n"
  }

  // ----------------------------------------
  // Snapshot Operations
  // ----------------------------------------

  /**
   * Preview an import - validates CSV against schema and computes diff
   */
  static async previewImport(
    templateId: string,
    orgId: string,
    parsedRows: Record<string, unknown>[],
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<SnapshotPreviewResult | SnapshotPreviewError> {
    // Check row limits
    if (parsedRows.length === 0) {
      return { error: "CSV has no data rows", code: "EMPTY_ROWS" }
    }
    if (parsedRows.length > MAX_DATASET_ROWS) {
      return { error: `CSV has ${parsedRows.length} rows, maximum is ${MAX_DATASET_ROWS}`, code: "TOO_MANY_ROWS" }
    }

    const template = await this.getTemplate(templateId, orgId)
    if (!template) {
      return { error: "Template not found", code: "PARSE_ERROR" }
    }

    const schema = template.schema as unknown as SchemaColumn[]
    const identity = getIdentityConfig(template)
    const stakeholderMapping = template.stakeholderMapping as StakeholderMapping | null

    // Validate columns
    const columnValidation = this.validateColumns(parsedRows, schema)
    
    // Validate identity based on orientation
    const identityValidation = this.validateIdentity(parsedRows, identity)

    // Match stakeholders if configured (only for row-based or using rowKey)
    let stakeholderResults: StakeholderResults | undefined
    if (stakeholderMapping) {
      stakeholderResults = await this.matchStakeholders(orgId, parsedRows, stakeholderMapping, identity.rowKey)
    }

    // Compute diff against prior snapshot
    let diffSummary: DiffSummary | undefined
    const latestSnapshot = await prisma.datasetSnapshot.findFirst({
      where: {
        templateId,
        organizationId: orgId,
        isLatest: true,
      },
      orderBy: { createdAt: "desc" },
    })

    if (latestSnapshot) {
      const priorRows = latestSnapshot.rows as unknown as Record<string, unknown>[]
      diffSummary = this.computeDiff(parsedRows, priorRows, identity)
    }

    return {
      parsedRows,
      rowCount: parsedRows.length,
      columnValidation,
      identityValidation,
      stakeholderMapping: stakeholderResults,
      diffSummary,
    }
  }

  /**
   * Create a new immutable snapshot
   */
  static async createSnapshot(
    templateId: string,
    orgId: string,
    userId: string,
    rows: Record<string, unknown>[],
    periodLabel?: string,
    periodStart?: Date,
    periodEnd?: Date,
    sourceFilename?: string
  ): Promise<DatasetSnapshot> {
    // Validate row limits
    if (rows.length === 0) {
      throw new Error("Cannot create snapshot with no rows")
    }
    if (rows.length > MAX_DATASET_ROWS) {
      throw new Error(`Cannot create snapshot with ${rows.length} rows, maximum is ${MAX_DATASET_ROWS}`)
    }

    const template = await this.getTemplate(templateId, orgId)
    if (!template) {
      throw new Error("Template not found")
    }

    const identity = getIdentityConfig(template)
    const stakeholderMapping = template.stakeholderMapping as StakeholderMapping | null

    // Find the latest snapshot for this template
    const latestSnapshot = await prisma.datasetSnapshot.findFirst({
      where: {
        templateId,
        organizationId: orgId,
        isLatest: true,
      },
      orderBy: { createdAt: "desc" },
    })

    // Compute diff based on identity orientation
    let diffSummary: DiffSummary | undefined
    if (latestSnapshot) {
      const priorRows = latestSnapshot.rows as unknown as Record<string, unknown>[]
      diffSummary = this.computeDiff(rows, priorRows, identity)
    }

    // Match stakeholders (uses rowKey for identity)
    let stakeholderResults: StakeholderResults | undefined
    if (stakeholderMapping) {
      stakeholderResults = await this.matchStakeholders(orgId, rows, stakeholderMapping, identity.rowKey)
    }

    // Determine version number
    let version = 1
    if (latestSnapshot && periodStart && latestSnapshot.periodStart) {
      // Check if same period
      const samePeriod = latestSnapshot.periodStart.getTime() === periodStart.getTime() &&
        (!periodEnd || !latestSnapshot.periodEnd || latestSnapshot.periodEnd.getTime() === periodEnd.getTime())
      if (samePeriod) {
        version = (latestSnapshot.version || 1) + 1
      }
    }

    // Create snapshot and mark previous as not latest
    return prisma.$transaction(async (tx) => {
      // Mark previous latest as not latest
      if (latestSnapshot) {
        await tx.datasetSnapshot.update({
          where: { id: latestSnapshot.id },
          data: { isLatest: false },
        })
      }

      // Create new snapshot
      return tx.datasetSnapshot.create({
        data: {
          organizationId: orgId,
          templateId,
          uploadedById: userId,
          periodLabel,
          periodStart,
          periodEnd,
          version,
          isLatest: true,
          rows: rows as unknown as Prisma.InputJsonValue,
          rowCount: rows.length,
          stakeholderResults: stakeholderResults as unknown as Prisma.InputJsonValue,
          diffSummary: diffSummary as unknown as Prisma.InputJsonValue,
          priorSnapshotId: latestSnapshot?.id,
          sourceFilename,
        },
      })
    })
  }

  /**
   * List all snapshots for a template
   */
  static async listSnapshots(
    templateId: string,
    orgId: string
  ): Promise<Omit<DatasetSnapshot, "rows">[]> {
    return prisma.datasetSnapshot.findMany({
      where: {
        templateId,
        organizationId: orgId,
      },
      select: {
        id: true,
        organizationId: true,
        templateId: true,
        periodLabel: true,
        periodStart: true,
        periodEnd: true,
        version: true,
        isLatest: true,
        rowCount: true,
        stakeholderResults: true,
        diffSummary: true,
        priorSnapshotId: true,
        sourceFilename: true,
        uploadedById: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }) as Promise<Omit<DatasetSnapshot, "rows">[]>
  }

  /**
   * Get a single snapshot by ID
   */
  static async getSnapshot(
    snapshotId: string,
    orgId: string
  ): Promise<DatasetSnapshot | null> {
    return prisma.datasetSnapshot.findFirst({
      where: {
        id: snapshotId,
        organizationId: orgId,
      },
    })
  }

  // ----------------------------------------
  // Internal Helpers
  // ----------------------------------------

  /**
   * Validate CSV columns against schema
   */
  private static validateColumns(
    rows: Record<string, unknown>[],
    schema: SchemaColumn[]
  ): ColumnValidation[] {
    if (rows.length === 0) {
      return schema.map(col => ({
        column: col.key,
        valid: true,
      }))
    }

    const firstRow = rows[0]
    const rowKeys = Object.keys(firstRow)

    return schema.map(col => {
      const errors: string[] = []

      // Check if column exists in data
      if (!rowKeys.includes(col.key)) {
        errors.push(`Column "${col.label}" (${col.key}) not found in data`)
      }

      // Check required columns have values
      if (col.required) {
        const missingCount = rows.filter(row => {
          const val = row[col.key]
          return val === undefined || val === null || val === ""
        }).length

        if (missingCount > 0) {
          errors.push(`${missingCount} rows missing required value`)
        }
      }

      return {
        column: col.key,
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      }
    })
  }

  /**
   * Validate identity based on orientation
   * - Row-based: rowKey values must be non-empty AND unique
   * - Column-based: rowKey values must be non-empty (uniqueness NOT required), column headers must be unique
   */
  private static validateIdentity(
    rows: Record<string, unknown>[],
    identity: IdentityConfig
  ): IdentityValidation {
    if (identity.orientation === "column") {
      return this.validateColumnBasedIdentity(rows, identity.rowKey)
    }
    return this.validateRowBasedIdentity(rows, identity.rowKey)
  }

  /**
   * Validate row-based identity: rowKey values must be non-empty AND unique
   */
  private static validateRowBasedIdentity(
    rows: Record<string, unknown>[],
    rowKey: string
  ): IdentityValidation {
    const seen = new Map<string, number>()
    const duplicates: string[] = []
    let emptyCount = 0

    for (const row of rows) {
      const rawValue = row[rowKey]
      const identity = String(rawValue ?? "").trim()
      
      if (!identity) {
        emptyCount++
      } else {
        const count = seen.get(identity) || 0
        if (count > 0) {
          duplicates.push(identity)
        }
        seen.set(identity, count + 1)
      }
    }

    return {
      valid: duplicates.length === 0 && emptyCount === 0,
      duplicates: [...new Set(duplicates)],
      emptyCount,
    }
  }

  /**
   * Validate column-based identity:
   * - rowKey values must be non-empty (uniqueness NOT required in V1)
   * - Column headers must be unique after normalization
   */
  private static validateColumnBasedIdentity(
    rows: Record<string, unknown>[],
    rowKey: string
  ): IdentityValidation {
    // Check row labels (rowKey values) for empty values
    let emptyRowLabels = 0
    for (const row of rows) {
      const rawValue = row[rowKey]
      const label = String(rawValue ?? "").trim()
      if (!label) {
        emptyRowLabels++
      }
    }

    // Check column headers (excluding rowKey column) for uniqueness
    const columnHeaders = rows.length > 0 
      ? Object.keys(rows[0]).filter(k => k !== rowKey)
      : []
    
    const seenHeaders = new Set<string>()
    const duplicateHeaders: string[] = []
    for (const header of columnHeaders) {
      const normalized = header.toLowerCase().trim()
      if (seenHeaders.has(normalized)) {
        duplicateHeaders.push(header)
      }
      seenHeaders.add(normalized)
    }

    return {
      valid: emptyRowLabels === 0 && duplicateHeaders.length === 0,
      duplicates: [],  // Not used for column-based
      emptyCount: 0,   // Not used for column-based
      duplicateHeaders,
      emptyRowLabels,
    }
  }

  /**
   * Legacy wrapper for backwards compatibility
   */
  private static validateIdentityUniqueness(
    rows: Record<string, unknown>[],
    identityKey: string
  ): IdentityValidation {
    return this.validateRowBasedIdentity(rows, identityKey)
  }

  /**
   * Compute diff between current and prior rows based on identity orientation
   */
  private static computeDiff(
    currentRows: Record<string, unknown>[],
    priorRows: Record<string, unknown>[],
    identity: IdentityConfig
  ): DiffSummary {
    if (identity.orientation === "column") {
      return this.computeColumnBasedDiff(currentRows, priorRows, identity.rowKey)
    }
    return this.computeRowBasedDiff(currentRows, priorRows, identity.rowKey)
  }

  /**
   * Compute row-based diff: compare row identities
   */
  private static computeRowBasedDiff(
    currentRows: Record<string, unknown>[],
    priorRows: Record<string, unknown>[],
    rowKey: string
  ): DiffSummary {
    const currentIdentities = new Set(
      currentRows.map(row => String(row[rowKey] ?? ""))
    )
    const priorIdentities = new Set(
      priorRows.map(row => String(row[rowKey] ?? ""))
    )

    const addedIdentities: string[] = []
    const removedIdentities: string[] = []

    for (const id of currentIdentities) {
      if (id && !priorIdentities.has(id)) {
        addedIdentities.push(id)
      }
    }

    for (const id of priorIdentities) {
      if (id && !currentIdentities.has(id)) {
        removedIdentities.push(id)
      }
    }

    return {
      addedCount: addedIdentities.length,
      removedCount: removedIdentities.length,
      addedIdentities,
      removedIdentities,
    }
  }

  /**
   * Compute column-based diff: compare column headers between snapshots
   */
  private static computeColumnBasedDiff(
    currentRows: Record<string, unknown>[],
    priorRows: Record<string, unknown>[],
    rowKey: string
  ): DiffSummary {
    const currentColumns = new Set(
      currentRows.length > 0 
        ? Object.keys(currentRows[0]).filter(k => k !== rowKey)
        : []
    )
    const priorColumns = new Set(
      priorRows.length > 0 
        ? Object.keys(priorRows[0]).filter(k => k !== rowKey)
        : []
    )

    const addedIdentities = [...currentColumns].filter(c => !priorColumns.has(c))
    const removedIdentities = [...priorColumns].filter(c => !currentColumns.has(c))

    return {
      addedCount: addedIdentities.length,
      removedCount: removedIdentities.length,
      addedIdentities,
      removedIdentities,
    }
  }

  /**
   * Legacy wrapper for backwards compatibility
   */
  private static computeDiffSummary(
    currentRows: Record<string, unknown>[],
    priorRows: Record<string, unknown>[],
    identityKey: string
  ): DiffSummary {
    return this.computeRowBasedDiff(currentRows, priorRows, identityKey)
  }

  /**
   * Match stakeholder emails against User table
   */
  private static async matchStakeholders(
    orgId: string,
    rows: Record<string, unknown>[],
    mapping: StakeholderMapping,
    identityKey: string
  ): Promise<StakeholderResults> {
    const emails = rows
      .map(row => ({
        identity: String(row[identityKey] ?? ""),
        email: String(row[mapping.columnKey] ?? "").toLowerCase().trim(),
      }))
      .filter(e => e.email)

    if (emails.length === 0) {
      return { matched: [], unmatched: [] }
    }

    // Get all users in org
    const users = await prisma.user.findMany({
      where: {
        organizationId: orgId,
        email: {
          in: emails.map(e => e.email),
        },
      },
      select: {
        id: true,
        email: true,
      },
    })

    const userMap = new Map(users.map(u => [u.email.toLowerCase(), u.id]))

    const matched: MatchedStakeholder[] = []
    const unmatched: UnmatchedStakeholder[] = []

    for (const { identity, email } of emails) {
      const userId = userMap.get(email)
      if (userId) {
        matched.push({ rowIdentity: identity, userId, email })
      } else {
        unmatched.push({ rowIdentity: identity, email })
      }
    }

    return { matched, unmatched }
  }

  /**
   * Delete a snapshot and update isLatest flag on prior snapshot if needed
   */
  static async deleteSnapshot(
    snapshotId: string,
    organizationId: string
  ): Promise<void> {
    const snapshot = await prisma.datasetSnapshot.findFirst({
      where: { id: snapshotId, organizationId },
    })

    if (!snapshot) {
      throw new Error("Snapshot not found")
    }

    await prisma.$transaction(async (tx) => {
      // If this was the latest snapshot, mark the prior one as latest
      if (snapshot.isLatest && snapshot.priorSnapshotId) {
        await tx.datasetSnapshot.update({
          where: { id: snapshot.priorSnapshotId },
          data: { isLatest: true },
        })
      }

      // Delete the snapshot
      await tx.datasetSnapshot.delete({
        where: { id: snapshotId },
      })
    })
  }
}
