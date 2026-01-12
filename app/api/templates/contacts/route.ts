import { NextResponse } from "next/server"
import * as XLSX from "xlsx"

export async function GET() {
  const headers = [
    "EMAIL",
    "FIRSTNAME",
    "LASTNAME",
    "PHONE",
    "TYPE",
    "GROUPS",
    "INVOICE_NUM",
    "UNPAID_INVOICE_AMOUNT",
    "DUE_DATE"
  ]

  const exampleRow = [
    "alex@example.com",
    "Alex",
    "Smith",
    "555-123-4567",
    "CLIENT",
    "NY Office, Marketing Team",
    "INV-12345",
    1250.5,
    "2026-02-01"
  ]

  const sheet = XLSX.utils.aoa_to_sheet([headers, exampleRow])
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

  const amountCellRef = XLSX.utils.encode_cell({ r: 1, c: 7 })
  const amountCell = sheet[amountCellRef]
  if (amountCell) {
    amountCell.z = "0.00"
  }

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
      "Content-Disposition": 'attachment; filename="Vergo Email Contact Upload.xlsx"'
    }
  })
}
