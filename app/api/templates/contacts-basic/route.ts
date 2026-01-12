import { NextResponse } from "next/server"
import * as XLSX from "xlsx"

export async function GET() {
  const data = [
    ["email*", "firstName", "lastName", "phone", "type", "groups"],
    [
      "alex@example.com",
      "Alex",
      "Smith",
      "555-123-4567",
      "CLIENT",
      "NY Office, Marketing Team"
    ],
    ["Note:", "Email is required. Groups are comma-separated. Add extra columns for custom fields."]
  ]

  const sheet = XLSX.utils.aoa_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Contacts")

  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })

  return new NextResponse(Buffer.from(arrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="contacts_basic_template.xlsx"'
    }
  })
}
