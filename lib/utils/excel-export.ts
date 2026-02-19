/**
 * Excel Export Utility
 *
 * Converts report data to styled Excel format using ExcelJS.
 * Supports bold rows, separator lines, number formatting, and cell styling.
 */

import ExcelJS from "exceljs"
import { GeneratedReportData } from "@/lib/services/report-generation.service"

/**
 * Convert a GeneratedReportData to a styled Excel workbook buffer
 */
export async function reportToExcel(data: GeneratedReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()

  const sheetName = data.sliceName
    ? `${data.reportName} - ${data.sliceName}`.substring(0, 31)
    : data.reportName.substring(0, 31)

  const worksheet = workbook.addWorksheet(sheetName)

  const columns = data.table.columns
  const numCols = columns.length

  // --- HEADER ROW ---
  const headerValues = columns.map(col => col.label || col.key)
  const headerRow = worksheet.addRow(headerValues)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF3F4F6" }, // gray-100
  }
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF000000" } },
    }
    cell.alignment = {
      vertical: "middle",
      horizontal: colNumber === 1 ? "left" : "center",
    }
  })

  // Set column widths
  columns.forEach((col, idx) => {
    const wsCol = worksheet.getColumn(idx + 1)
    const isLabel = col.key === "_label"
    wsCol.width = isLabel ? 30 : 18
    if (!isLabel) {
      wsCol.alignment = { horizontal: "center" }
    }
  })

  // --- DATA ROWS ---
  for (const row of data.table.rows) {
    const rowBold = row._bold as boolean | undefined
    const rowSeparator = row._separatorAbove as boolean | undefined
    const rowFormat = (row._format as string) || ""

    const values = columns.map(col => {
      const value = row[col.key]
      if (value === null || value === undefined) return ""
      return value
    })

    const excelRow = worksheet.addRow(values)

    // Separator: thick black top border on all cells
    if (rowSeparator) {
      excelRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          ...cell.border,
          top: { style: "medium", color: { argb: "FF000000" } },
        }
      })
    }

    // Bold row
    if (rowBold) {
      excelRow.font = { bold: true }
    }

    // First column (label) always bold
    const labelCell = excelRow.getCell(1)
    labelCell.font = { bold: true }
    labelCell.alignment = { horizontal: "left", vertical: "middle" }

    // Apply number formatting based on _format or column dataType
    columns.forEach((col, idx) => {
      if (col.key === "_label") return
      const cell = excelRow.getCell(idx + 1)
      const format = rowFormat || col.dataType
      applyNumberFormat(cell, format)
      cell.alignment = { horizontal: "center", vertical: "middle" }
    })
  }

  // --- FORMULA ROWS ---
  if (data.table.formulaRows && data.table.formulaRows.length > 0) {
    // Add empty separator row
    worksheet.addRow([])

    for (const formulaRow of data.table.formulaRows) {
      const fBold = (formulaRow as any)._bold as boolean | undefined
      const fSeparator = (formulaRow as any)._separatorAbove as boolean | undefined

      const values = columns.map((col, idx) => {
        if (idx === 0) return formulaRow.label
        const value = formulaRow.values[col.key]
        if (value === null || value === undefined) return ""
        return value
      })

      const excelRow = worksheet.addRow(values)

      // Formula rows: always bold, with blue background
      excelRow.font = { bold: true }
      excelRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEFF6FF" }, // blue-50
      }

      if (fSeparator) {
        excelRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            ...cell.border,
            top: { style: "medium", color: { argb: "FF000000" } },
          }
        })
      }

      // First column alignment
      const labelCell = excelRow.getCell(1)
      labelCell.alignment = { horizontal: "left", vertical: "middle" }

      // Number formatting for formula row cells
      columns.forEach((col, idx) => {
        if (idx === 0) return
        const cell = excelRow.getCell(idx + 1)
        applyNumberFormat(cell, col.dataType)
        cell.alignment = { horizontal: "center", vertical: "middle" }
      })
    }
  }

  // Write to buffer
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

function applyNumberFormat(cell: ExcelJS.Cell, format: string) {
  switch (format?.toLowerCase()) {
    case "currency":
      cell.numFmt = "$#,##0"
      break
    case "percent":
      cell.numFmt = "0.00%"
      break
    case "number":
      cell.numFmt = "#,##0"
      break
  }
}

/**
 * Generate a filename for the export
 */
export function generateExportFilename(
  reportName: string,
  sliceName?: string,
  periodKey?: string
): string {
  const parts = [reportName]
  if (sliceName) parts.push(sliceName)
  if (periodKey) parts.push(periodKey)

  // Sanitize filename (remove special chars)
  const filename = parts.join(" - ")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()

  return `${filename}.xlsx`
}
