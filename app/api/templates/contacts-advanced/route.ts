import { NextResponse } from "next/server"
import * as XLSX from "xlsx"

export async function GET() {
  const data = [
    ["email*", "type", "groups", "invoice_number", "unpaid_invoice_amount", "due_date"],
    [
      "ar@vendor.com",
      "VENDOR",
      "Vendors, AR",
      "INV-12345",
      "1250.50",
      "2026-02-01"
    ],
    ["Comment:", "Add any additional columns; each column becomes a custom field."]
  ]

  const sheet = XLSX.utils.aoa_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Contacts")

  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })

  return new NextResponse(Buffer.from(arrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="contacts_advanced_template.xlsx"'
    }
  })
}
