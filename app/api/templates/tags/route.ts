import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizationId = session.user.organizationId

  // Fetch all contacts with their tag values
  const entities = await prisma.entity.findMany({
    where: { organizationId },
    include: {
      contactStates: {
        include: {
          tag: true
        }
      }
    },
    orderBy: { firstName: "asc" }
  })

  // Fetch all existing tags for this organization
  const tags = await prisma.tag.findMany({
    where: { organizationId },
    orderBy: { name: "asc" }
  })

  // Build headers: EMAIL, FIRST_NAME, LAST_NAME (for reference), then all tag columns
  const headers = [
    "EMAIL",
    "FIRST_NAME",
    "LAST_NAME",
    ...tags.map(t => t.name.toUpperCase())
  ]

  // Build data rows
  const rows: (string | number | null)[][] = []
  
  for (const entity of entities) {
    if (!entity.email) continue // Skip contacts without email
    
    const row: (string | number | null)[] = [
      entity.email,
      entity.firstName || "",
      entity.lastName || ""
    ]

    // Add tag values
    for (const tag of tags) {
      const contactState = entity.contactStates.find(cs => cs.tagId === tag.id)
      row.push(contactState?.stateValue || "")
    }

    rows.push(row)
  }

  // Create worksheet
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])

  // Style headers as bold
  headers.forEach((_, idx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: idx })
    const cell = sheet[cellRef]
    if (cell) {
      cell.s = {
        ...(cell.s || {}),
        font: { ...(cell.s?.font || {}), bold: true },
        alignment: { ...(cell.s?.alignment || {}), wrapText: true, vertical: "center" }
      }
    }
  })

  // Make EMAIL, FIRST_NAME, LAST_NAME columns slightly grayed (read-only hint)
  // Note: xlsx-style would be needed for full styling, basic xlsx doesn't support cell colors
  
  // Set column widths
  const columnWidths = headers.map((header, idx) => {
    // Find max length in this column
    let maxLen = header.length
    for (const row of rows) {
      const val = row[idx]
      if (val !== null && val !== undefined) {
        maxLen = Math.max(maxLen, String(val).length)
      }
    }
    return Math.min(maxLen + 2, 40) // Cap at 40 chars
  })
  sheet["!cols"] = columnWidths.map((wch) => ({ wch }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Contact Tags")

  // Add instructions sheet
  const instructionsData = [
    ["INSTRUCTIONS"],
    [""],
    ["This template contains all your contacts with their current tag values."],
    [""],
    ["HOW TO USE:"],
    ["1. Fill in or update values in the tag columns (columns D onwards)"],
    ["2. Do NOT modify EMAIL, FIRST_NAME, or LAST_NAME columns - they are for reference only"],
    ["3. To remove a tag value, leave the cell empty"],
    ["4. To add a new tag column, simply add a new column header"],
    ["5. Save the file and upload it in the Tags tab"],
    [""],
    ["IMPORTANT:"],
    ["- Contacts are matched by EMAIL address"],
    ["- Unknown emails will be skipped"],
    ["- Uploading will REPLACE all tag values for contacts in this file"],
    ["- Tags not included in the file will be removed for those contacts"]
  ]
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsData)
  instructionsSheet["!cols"] = [{ wch: 80 }]
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions")

  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })

  const timestamp = new Date().toISOString().split("T")[0]
  const filename = `Vergo Contact Tags ${timestamp}.xlsx`

  return new NextResponse(Buffer.from(arrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  })
}
