import { NextResponse } from "next/server"
import * as XLSX from "xlsx"

export async function GET() {
  // Core contact fields only - no custom tags/personalization data
  const headers = [
    "EMAIL",
    "FIRST_NAME",
    "LAST_NAME",
    "COMPANY",
    "PHONE",
    "TYPE",
    "GROUPS"
  ]

  const exampleRow = [
    "alex@example.com",
    "Alex",
    "Smith",
    "Acme Corp",
    "555-123-4567",
    "CLIENT",
    "NY Office, Marketing Team"
  ]

  const sheet = XLSX.utils.aoa_to_sheet([headers, exampleRow])
  
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

  // Set column widths
  const columnWidths = headers.map((header, idx) => {
    const valueLength = exampleRow[idx]?.toString().length || 0
    const maxLength = Math.max(header.length, valueLength)
    return maxLength + 2
  })
  sheet["!cols"] = columnWidths.map((wch) => ({ wch }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Contacts")

  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })

  return new NextResponse(Buffer.from(arrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Vergo Contact Import Template.xlsx"'
    }
  })
}
