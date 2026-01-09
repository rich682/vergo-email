import { EntityService } from "./entity.service"
import { GroupService } from "./group.service"

export interface CSVRow {
  firstName: string
  email: string
  phone?: string
  tags: string[]
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

    // Check if first line is headers
    const firstLine = lines[0].toLowerCase()
    const hasHeaders = firstLine.includes("firstname") || firstLine.includes("first name") || 
                      firstLine.includes("email") || firstLine.includes("phone")

    const dataLines = hasHeaders ? lines.slice(1) : lines
    const rows: CSVRow[] = []

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim()
      if (!line) continue

      const columns = this.parseCSVLine(line)
      if (columns.length < 2) continue // Need at least firstName and email

      const firstName = columns[0]?.trim()
      const email = columns[1]?.trim()
      const phone = columns[2]?.trim() || undefined

      // Extract tags from remaining columns
      const tags: string[] = []
      for (let j = 3; j < columns.length; j++) {
        const tag = columns[j]?.trim()
        if (tag) {
          tags.push(tag)
        }
      }

      if (firstName && email) {
        rows.push({
          firstName,
          email,
          phone,
          tags
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
        
        // Add groups from CSV tags (columns 3+)
        for (const tagName of row.tags) {
          if (!tagName) continue
          
          const tagLower = tagName.toLowerCase()
          let groupId = groupMap.get(tagLower)
          
          if (!groupId) {
            // Create new group
            const newGroup = await GroupService.create({
              name: tagName,
              organizationId,
              color: this.generateColorForGroup(tagName)
            })
            groupMap.set(tagLower, newGroup.id)
            groupId = newGroup.id
          }
          
          // Only add if not already in list (avoid duplicates)
          if (!groupIds.includes(groupId)) {
            groupIds.push(groupId)
          }
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

