import { EntityService } from "./entity.service"
import { GroupService } from "./group.service"

export interface CSVRow {
  firstName: string
  email: string
  phone?: string
  tags: string[]
  groups?: string[]
}

export interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: Array<{ row: number; error: string }>
}

export class CSVImportService {
  static parseCSV(csvText: string): CSVRow[] {
    const lines = csvText.split("\n").filter(line => line.trim())
    if (lines.length === 0) return []

    const headerColumns = this.parseCSVLine(lines[0])
    const lowerHeaders = headerColumns.map(h => h.toLowerCase())
    const hasHeaders = lowerHeaders.some(h =>
      h.includes("firstname") || h.includes("first name") || h === "name" || h === "email" || h === "phone"
    )

    const firstNameIndex = hasHeaders
      ? lowerHeaders.findIndex(h => h === "firstname" || h === "first name" || h === "name")
      : 0
    const emailIndex = hasHeaders ? lowerHeaders.findIndex(h => h === "email") : 1
    const phoneIndex = hasHeaders ? lowerHeaders.findIndex(h => h === "phone") : 2
    const groupsIndex = hasHeaders ? lowerHeaders.findIndex(h => h === "groups") : -1

    const dataLines = hasHeaders ? lines.slice(1) : lines
    const rows: CSVRow[] = []

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim()
      if (!line) continue

      const columns = this.parseCSVLine(line)
      const getValue = (idx: number) => (idx >= 0 && idx < columns.length ? columns[idx]?.trim() : "")

      const firstName = getValue(firstNameIndex >= 0 ? firstNameIndex : 0)
      const email = getValue(emailIndex >= 0 ? emailIndex : 1)
      const phoneRaw = getValue(phoneIndex >= 0 ? phoneIndex : 2)
      const phone = phoneRaw || undefined

      const groupsCell = groupsIndex >= 0 ? getValue(groupsIndex) : ""
      const groups = groupsCell
        ? groupsCell.split(",").map(g => g.trim()).filter(Boolean)
        : []

      const usedIndexes = new Set(
        [firstNameIndex, emailIndex, phoneIndex, groupsIndex].filter((v) => v >= 0)
      )

      const tags: string[] = []
      columns.forEach((col, idx) => {
        if (usedIndexes.has(idx)) return
        const tag = col?.trim()
        if (tag) tags.push(tag)
      })

      if (firstName && email) {
        rows.push({
          firstName,
          email,
          phone,
          tags,
          groups
        })
      }
    }

    return rows
  }

  static parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current)
        current = ""
      } else {
        current += char
      }
    }
    result.push(current)

    return result.map(col => col.trim().replace(/^"|"$/g, ""))
  }

  static validateRow(row: CSVRow, rowIndex: number): string | null {
    if (!row.firstName || row.firstName.trim() === "") {
      return `Row ${rowIndex + 1}: firstName is required`
    }
    if (!row.email || row.email.trim() === "") {
      return `Row ${rowIndex + 1}: email is required`
    }
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(row.email)) {
      return `Row ${rowIndex + 1}: invalid email format`
    }
    return null
  }

  static async importEntities(
    rows: CSVRow[],
    organizationId: string,
    options?: {
      updateExisting?: boolean
      groupIds?: string[]
    }
  ): Promise<ImportResult> {
    const result: ImportResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    }

    // Get all existing groups for this organization
    const existingGroups = await GroupService.findByOrganization(organizationId)
    const groupMap = new Map<string, string>() // name -> id
    existingGroups.forEach(g => groupMap.set(g.name.toLowerCase(), g.id))

    const addGroupByName = async (name: string, groupIds: string[]) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const lower = trimmed.toLowerCase()

      let groupId = groupMap.get(lower)
      if (!groupId) {
        const newGroup = await GroupService.create({
          name: trimmed,
          organizationId,
          color: this.generateColorForGroup(trimmed)
        })
        groupMap.set(lower, newGroup.id)
        groupId = newGroup.id
      }

      if (!groupIds.includes(groupId)) {
        groupIds.push(groupId)
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      
      // Validate row
      const validationError = this.validateRow(row, i)
      if (validationError) {
        result.errors.push({ row: i + 1, error: validationError })
        result.skipped++
        continue
      }

      try {
        // Start with groups from UI selector (applied to all contacts)
        const groupIds: string[] = options?.groupIds ? [...options.groupIds] : []
        
        // Add groups from groups column (comma-separated names)
        if (row.groups && row.groups.length > 0) {
          for (const groupName of row.groups) {
            await addGroupByName(groupName, groupIds)
          }
        }

        // Add groups from CSV tags (columns 3+)
        for (const tagName of row.tags) {
          if (!tagName) continue
          
          await addGroupByName(tagName, groupIds)
        }

        // Check if entity exists by email
        const existing = await EntityService.findByEmail(row.email, organizationId)

        if (existing) {
          if (options?.updateExisting) {
            // Update existing entity
            await EntityService.update(
              existing.id,
              organizationId,
              {
                firstName: row.firstName,
                phone: row.phone || undefined
              }
            )

            // Update groups - merge with existing (additive only, don't remove)
            // Fetch entity with groups to get current groups
            const existingWithGroups = await EntityService.findById(existing.id, organizationId)
            if (existingWithGroups) {
              const entityWithGroups = existingWithGroups as typeof existingWithGroups & {
                groups: Array<{ group: { id: string } }>
              }
              const currentGroups = entityWithGroups.groups.map(eg => eg.group.id)
              // Only add groups that aren't already assigned
              for (const gId of groupIds) {
                if (!currentGroups.includes(gId)) {
                  await EntityService.addToGroup(existing.id, gId)
                }
              }
            } else {
              // If entity exists but no groups, add all
              for (const gId of groupIds) {
                await EntityService.addToGroup(existing.id, gId)
              }
            }

            result.updated++
          } else {
            result.skipped++
          }
        } else {
          // Create new entity
          await EntityService.create({
            firstName: row.firstName,
            email: row.email,
            phone: row.phone || undefined,
            organizationId,
            groupIds
          })
          result.created++
        }
      } catch (error: any) {
        result.errors.push({
          row: i + 1,
          error: error.message || "Unknown error"
        })
        result.skipped++
      }
    }

    return result
  }

  static generateColorForGroup(name: string): string {
    // Generate a consistent color based on group name
    const colors = [
      "#3B82F6", // blue
      "#10B981", // green
      "#8B5CF6", // purple
      "#F59E0B", // amber
      "#EF4444", // red
      "#06B6D4", // cyan
      "#EC4899", // pink
      "#84CC16"  // lime
    ]
    
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    
    return colors[Math.abs(hash) % colors.length]
  }
}

