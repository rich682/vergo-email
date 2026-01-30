/**
 * Excel Export Utility
 * 
 * Converts report data to Excel format for download.
 */

import * as XLSX from "xlsx"
import { GeneratedReportData } from "@/lib/services/report-generation.service"

/**
 * Convert a GeneratedReportData to an Excel workbook buffer
 */
export function reportToExcel(data: GeneratedReportData, filename?: string): Buffer {
  // Create a new workbook
  const workbook = XLSX.utils.book_new()

  // Build the worksheet data
  const wsData: unknown[][] = []

  // Add header row (column labels)
  const headers = data.table.columns.map(col => col.label || col.key)
  wsData.push(headers)

  // Add data rows
  for (const row of data.table.rows) {
    const rowData = data.table.columns.map(col => {
      const value = row[col.key]
      // Keep null/undefined as empty
      if (value === null || value === undefined) return ""
      return value
    })
    wsData.push(rowData)
  }

  // Add formula rows if present
  if (data.table.formulaRows && data.table.formulaRows.length > 0) {
    // Add empty row separator
    wsData.push([])
    
    for (const formulaRow of data.table.formulaRows) {
      const rowData = data.table.columns.map((col, idx) => {
        if (idx === 0) {
          return formulaRow.label
        }
        const value = formulaRow.values[col.key]
        if (value === null || value === undefined) return ""
        return value
      })
      wsData.push(rowData)
    }
  }

  // Create the worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(wsData)

  // Set column widths based on content
  const colWidths = headers.map((header, idx) => {
    let maxWidth = String(header).length
    for (const row of wsData) {
      const cellValue = String(row[idx] || "")
      if (cellValue.length > maxWidth) {
        maxWidth = cellValue.length
      }
    }
    return { wch: Math.min(maxWidth + 2, 50) } // Cap at 50 chars
  })
  worksheet["!cols"] = colWidths

  // Add the worksheet to the workbook
  const sheetName = data.sliceName 
    ? `${data.reportName} - ${data.sliceName}`.substring(0, 31) // Excel sheet name limit
    : data.reportName.substring(0, 31)
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

  // Write to buffer
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
  
  return buffer
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
